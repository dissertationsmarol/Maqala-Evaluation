(window.MQ_BUILD = window.MQ_BUILD || {}).form = '2026-11-19d';
/* The evaluation form: criteria cards, rubric, result, comments, autosave to the spreadsheet. */
(function () {
'use strict';
var MQ = window.MQ, $ = MQ.$, $$ = MQ.$$, esc = MQ.esc, isObj = MQ.isObj;

/* ================= small helpers (rubric maths) ================= */
function rng(r) { return r.length > 1 ? r[r.length - 1] + '–' + r[0] : String(r[0]); }
function levelOf(c, m) { var s = SCALES[c.max]; for (var i = 0; i < s.length; i++) { if (s[i].indexOf(m) > -1) return i + 1; } return 0; }
function mk(d, id) { var v = d.marks && d.marks[id]; return (v === null || v === undefined || v === '') ? null : +v; }
function total(d) { return CRIT.reduce(function (a, c) { var m = mk(d, c.id); return a + (m == null ? 0 : m); }, 0); }
function secTotal(d, sid) { return CRIT.filter(function (c) { return c.sec === sid; }).reduce(function (a, c) { var m = mk(d, c.id); return a + (m == null ? 0 : m); }, 0); }
function markedCount(d) { return CRIT.filter(function (c) { return mk(d, c.id) != null; }).length; }
function secComment(d, sid) { return typeof d.sec[sid] === 'string' ? d.sec[sid] : ''; }
function collatedText(d) {
  var parts = [];
  SECTIONS.forEach(function (s) { var t = secComment(d, s.id).trim(); if (t) parts.push(s.ar + ' · ' + s.en + '\n' + t); });
  return parts.join('\n\n');
}
function collatedHTML(d, withGeneral) {
  var h = '';
  SECTIONS.forEach(function (s) { var t = secComment(d, s.id).trim(); if (t) h += '<h4>' + s.ar + ' · ' + s.en + '</h4><p>' + esc(t) + '</p>'; });
  if (withGeneral && (d.comment || '').trim()) h += '<h4>تعليقات عامة · General</h4><p>' + esc(d.comment.trim()) + '</p>';
  return h;
}
function o1(k, v) { var o = {}; o[k] = v; return o; }
MQ.rubric = { rng: rng, levelOf: levelOf, mk: mk, total: total, secTotal: secTotal, markedCount: markedCount };

/* ================= state ================= */
var F = null;            // the open evaluation
var preview = {};        // level shown under each criterion (before a mark is picked)
var rubricFilter = 0, tab = 'score';
var callbacks = {};

function blankData() {
  var marks = {}; CRIT.forEach(function (c) { marks[c.id] = null; });
  return { topic: '', marks: marks, subs: {}, wc: '', sec: { m: '', c: '', f: '' }, comment: '' };
}
function normData(d) {
  var b = blankData(); d = d || {};
  d.topic = typeof d.topic === 'string' ? d.topic : '';
  d.marks = isObj(d.marks) ? Object.assign(b.marks, d.marks) : b.marks;
  d.subs = isObj(d.subs) ? d.subs : {};
  d.sec = isObj(d.sec) ? Object.assign(b.sec, d.sec) : b.sec;
  d.comment = typeof d.comment === 'string' ? d.comment : '';
  if (d.wc == null) d.wc = '';
  return d;
}
function flat(p, pre, out) {
  Object.keys(p).forEach(function (k) {
    var v = p[k], key = pre ? pre + '.' + k : k;
    if (isObj(v)) flat(v, key, out); else out[key] = v;
  });
  return out;
}
/** Applies a flat patch such as {'marks.c3': 7, 'sec.m': 'text'} to a data object. */
function applyFlat(d, f) {
  Object.keys(f).forEach(function (k) {
    var v = f[k], p = k.split('.');
    if (p.length === 1) d[k] = v; else d[p[0]][p[1]] = v;
  });
}

/* ================= criteria cards (from the first version of the form) ================= */
var CMHTML = '<div class="cm"><textarea id="__ID__" __ATTR__ dir="auto" rows="4"></textarea><div class="mics" hidden><button type="button" class="mic" data-mic="__ID__"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span>Dictate</span></button><button type="button" class="lang" data-lang aria-label="Dictation language">AR</button></div></div><p class="partial" id="pt-__ID__" dir="auto" aria-live="polite"></p>';

function levelBlock(c, L) {
  var r = SCALES[c.max][L.n - 1];
  return '<div class="lb l' + L.n + '"><div class="lh"><b>المستوى ' + L.ord + ' (' + L.ar + ') <em>' + L.letter + '</em></b><span class="rng">' + rng(r) + '</span></div><p>' + esc(c.lv[L.n - 1]) + '</p></div>';
}
function subControls(c, s, i) {
  var key = c.id + '_' + i, h = '';
  if (s.k === 'yn') {
    h += '<button type="button" data-act="sub" data-key="' + key + '" data-v="Y">نعم</button><button type="button" data-act="sub" data-key="' + key + '" data-v="N">لا</button>';
    if (s.wc) h += '<input id="f-wc" type="number" inputmode="numeric" min="0" placeholder="Word count" aria-label="Word count">';
  } else if (s.k === 'q') {
    QUOTE.forEach(function (q) { h += '<button type="button" data-act="sub" data-key="' + key + '" data-v="' + q[0] + '"><span>' + q[0] + '</span><small>' + q[1] + '</small></button>'; });
  } else {
    ['A', 'B', 'C', 'D'].forEach(function (l) { h += '<button type="button" data-act="sub" data-key="' + key + '" data-v="' + l + '">' + l + '</button>'; });
  }
  return h;
}
function cardHTML(c) {
  var sc = SCALES[c.max];
  var cols = LEVELS.map(function (L, i) {
    return '<div class="col l' + L.n + '" data-l="' + L.n + '"><button type="button" class="lvl" data-act="lvl" data-l="' + L.n + '" aria-pressed="false"><b>' + L.letter + '</b><span class="lar">' + L.ar + '</span><i>' + rng(sc[i]) + '</i></button><div class="chips" style="display:flex;flex-direction:column;gap:6px">' +
      sc[i].map(function (m) { return '<button type="button" class="chip" data-act="mark" data-m="' + m + '" data-l="' + L.n + '" aria-pressed="false">' + m + '</button>'; }).join('') + '</div></div>';
  }).join('');
  var subs = c.subs.map(function (s, i) { return '<div class="sub"><p>' + esc(s.t) + '</p><div class="sc">' + subControls(c, s, i) + '</div></div>'; }).join('');
  return '<article class="card crit" id="card-' + c.id + '" data-cid="' + c.id + '">' +
    '<header class="crit-h"><span class="num">' + c.n + '</span><div class="ttl"><h3>' + esc(c.ar) + '</h3><p class="en">' + esc(c.en) + '</p></div><div class="got"><b class="none">–</b><small>/' + c.max + '</small></div></header>' +
    '<div class="grid" role="group" aria-label="Grade">' + cols + '</div>' +
    '<div class="desc"></div>' +
    '<details class="fold"><summary><span>كل المستويات</span><span class="en">Compare all grades</span></summary>' + LEVELS.map(function (L) { return levelBlock(c, L); }).join('') + '</details>' +
    '<details class="fold subs"><summary><span>المعايير الفرعية</span><span class="en">Sub-criteria · ' + c.subs.length + '</span><span class="tally"></span></summary>' + subs + '</details>' +
    '</article>';
}
function subStats(c, d) {
  var sum = 0, cnt = 0, yes = 0, yn = 0, pts = { A: 4, B: 3, C: 2, D: 1 };
  c.subs.forEach(function (s, i) {
    var v = d.subs[c.id + '_' + i]; if (!v) return;
    if (s.k === 'yn') { yn++; if (v === 'Y') yes++; } else { cnt++; sum += pts[v] || 0; }
  });
  var avg = cnt ? sum / cnt : null, hint = null, LT = { 4: 'A', 3: 'B', 2: 'C', 1: 'D' };
  if (avg != null) {
    if (avg % 1 === 0.5) hint = LT[Math.ceil(avg)] + '–' + LT[Math.floor(avg)];
    else hint = LT[Math.round(avg)];
  }
  return { cnt: cnt, yn: yn, yes: yes, hint: hint };
}
function setVal(el, v) { if (el && document.activeElement !== el && el.value !== v) el.value = v; }
function renderCard(c, d) {
  var card = $('#card-' + c.id); if (!card) return;
  var m = mk(d, c.id), chosen = m == null ? 0 : levelOf(c, m), pv = preview[c.id] || chosen;
  var got = $('.got', card);
  got.className = 'got' + (chosen ? ' has l' + chosen : '');
  got.innerHTML = (m == null ? '<b class="none">–</b>' : '<b>' + m + '</b>') + '<small>/' + c.max + '</small>';
  $$('.col', card).forEach(function (cl) {
    var n = +cl.getAttribute('data-l');
    cl.classList.toggle('sel', pv === n);
    $('.lvl', cl).setAttribute('aria-pressed', pv === n ? 'true' : 'false');
    $$('.chip', cl).forEach(function (ch) { var on = (+ch.getAttribute('data-m') === m); ch.classList.toggle('on', on); ch.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  });
  var desc = $('.desc', card), key = pv + ':' + c.id;
  if (desc.getAttribute('data-k') !== key) {
    desc.setAttribute('data-k', key);
    desc.innerHTML = pv ? levelBlock(c, LEVELS[pv - 1]) : '<p class="hint">اضغط على مستوى لقراءة شروطه · Tap a grade to read what it requires.</p>';
  }
  $$('.sc button[data-act=sub]', card).forEach(function (b) { b.classList.toggle('on', d.subs[b.getAttribute('data-key')] === b.getAttribute('data-v')); });
  var st = subStats(c, d), parts = [];
  if (st.cnt) parts.push('avg ≈ ' + st.hint);
  if (st.yn) parts.push(st.yes + '/' + st.yn + ' yes');
  $('.tally', card).textContent = parts.length ? '· ' + parts.join(' · ') : '';
}

/* ================= building the views (once) ================= */
function buildScore() {
  var h = '<div class="card topic"><p class="tkrow" id="s-tk" hidden></p><label for="f-topic">موضوع المقالة<span class="en">Topic of the maqala</span></label><textarea id="f-topic" dir="auto" rows="2"></textarea><p class="hint">Taken from the sheet when it is there. Add or correct it here.</p></div>';
  SECTIONS.forEach(function (s) {
    h += '<div class="sec-h"><div><h2>' + s.ar + '</h2><p class="en">' + s.en + '</p></div><div class="sec-sub"><b id="st-' + s.id + '">0</b>/' + SECMAX[s.id] + '</div></div>';
    CRIT.filter(function (c) { return c.sec === s.id; }).forEach(function (c) { h += cardHTML(c); });
    h += '<button type="button" class="btn ghost gocm" data-act="gocm" data-sec="' + s.id + '">✎ تعليقات ' + s.ar + ' <span class="en">Write comments on ' + s.en + '</span></button>';
  });
  h += '<button type="button" class="btn gold wide" id="btn-result">النتيجة <span class="en">See result</span></button>';
  $('#fv-score').innerHTML = h;
}
function buildComments() {
  var h = '<p class="hint pad">التعليقات بحسب الأقسام الكبرى، ثم تعليق عام في النهاية.<br><span class="en">Comments by main part, then one overall comment at the end.</span></p>';
  SECTIONS.forEach(function (s) {
    h += '<div class="card seccm"><label for="sc-' + s.id + '">تعليقات ' + s.ar + '<span class="en">Comments on ' + s.en + '</span></label><div class="gs" id="gs-' + s.id + '"></div>' + CMHTML.replace(/__ID__/g, 'sc-' + s.id).replace('__ATTR__', 'data-sec="' + s.id + '"') + '</div>';
  });
  h += '<div class="card"><h3 class="h3">كل التعليقات في مكان واحد</h3><p class="en">All your section comments, exactly as written, so you can write your own summary below</p><div id="collated" class="collate empty" style="margin-top:10px"></div><button type="button" class="btn ghost wide" id="btn-insert">أضفها إلى تعليقي العام <span class="en">Add them to the overall comment</span></button></div>';
  h += '<div class="card seccm"><label for="f-comment">تعليقات عامة<span class="en">Overall comment</span></label><div class="gs" id="gs-all"></div>' + CMHTML.replace(/__ID__/g, 'f-comment').replace('__ATTR__', '') + '</div>';
  $('#fv-comments').innerHTML = h;
}
function renderRubric() {
  var h = '';
  h += '<div class="card"><h2 style="font-size:23px">من الحرف إلى الدرجة</h2><p class="en">Grade letter → marks</p>';
  h += '<table class="rtab" style="margin-top:8px"><thead><tr><th style="text-align:start">المستوى</th><th>Letter</th><th>/10</th><th>/15</th><th>/5</th></tr></thead><tbody>';
  LEVELS.forEach(function (L, i) { h += '<tr class="l' + L.n + '"><td style="text-align:start"><b>' + L.ord + ' · ' + L.ar + '</b><br><span class="en">' + L.en + '</span></td><td><span class="lg">' + L.letter + '</span></td><td class="rg">' + rng(SCALES[10][i]) + '</td><td class="rg">' + rng(SCALES[15][i]) + '</td><td class="rg">' + rng(SCALES[5][i]) + '</td></tr>'; });
  h += '</tbody></table>';
  h += '<ul class="note-list"><li>The /15 scale applies to criterion 6 only and the /5 scale to criterion 5 only. Every other criterion is out of 10.</li>';
  h += '<li>The sub-criteria checklist uses four letters (A, B, C, D) while the rubric has five levels, so D here covers both level 4 (Weak) and level 5 (Unacceptable).</li>';
  h += '<li>The section headings in the source read Methodology ' + SECTIONS[0].src + ' and Content ' + SECTIONS[1].src + ', but the criteria beneath them add up to ' + SECMAX.m + ' and ' + SECMAX.c + '. The total is 100 either way; this form adds up the criteria marks.</li>';
  h += '<li>The sub-criteria are an aid for the supervisor and are not exhaustive (note on the checklist page).</li></ul></div>';
  h += '<div class="filters" role="group" aria-label="Show grade"><button type="button" data-f="0" aria-pressed="' + (rubricFilter === 0) + '">All grades</button>';
  LEVELS.forEach(function (L) { h += '<button type="button" class="l' + L.n + '" data-f="' + L.n + '" aria-pressed="' + (rubricFilter === L.n) + '"><span class="dotc"></span>' + L.letter + ' · ' + L.ar + '</button>'; });
  h += '</div>';
  SECTIONS.forEach(function (s) {
    h += '<div class="sec-h"><div><h2>' + s.ar + '</h2><p class="en">' + s.en + '</p></div><div class="sec-sub"><b>' + SECMAX[s.id] + '</b> marks</div></div>';
    CRIT.filter(function (c) { return c.sec === s.id; }).forEach(function (c) {
      h += '<article class="card rb"><header><span class="num">' + c.n + '</span><div class="ttl"><h3>' + esc(c.ar) + '</h3><p class="en">' + esc(c.en) + '</p></div><span class="mx">/' + c.max + '</span></header>';
      LEVELS.forEach(function (L) { if (!rubricFilter || rubricFilter === L.n) h += levelBlock(c, L); });
      h += '<details class="fold"><summary><span>المعايير الفرعية</span><span class="en">Sub-criteria · ' + c.subs.length + '</span></summary><ul class="sublist">' +
        c.subs.map(function (x) { var kind = x.k === 'yn' ? 'Yes / No' : x.k === 'q' ? 'A–D · quote share' : 'A–D'; return '<li><span class="kind">' + kind + '</span><span>' + esc(x.t) + '</span></li>'; }).join('') + '</ul></details></article>';
    });
  });
  $('#fv-rubric').innerHTML = h;
}
function buildResult() {
  $('#fv-result').innerHTML =
    '<div class="card"><div class="res-head"><div><h2 id="r-name" dir="auto"></h2><p id="r-tk" class="tkrow" hidden></p><p id="r-topic" dir="auto" class="rtopic"></p><p class="en" id="r-meta"></p></div>' +
    '<div class="bigtot"><b id="r-total">0</b><small>/100</small></div></div>' +
    '<table class="rt" style="margin-top:10px"><tbody id="r-body"></tbody></table><p class="missing" id="r-missing"></p></div>' +
    '<div class="card"><h3 class="h3">التعليقات <span class="en">Comments</span></h3><div id="r-comments" class="collate" style="margin-top:8px"></div></div>' +
    '<div class="card submitbox"><p id="r-status" class="statusline"></p>' +
    '<button type="button" class="btn gold wide" id="btn-submit">إرسال التقييم النهائي <span class="en">Submit final evaluation</span></button>' +
    '<p class="hint">Everything is saved automatically as you work. Submitting tells the dissertations office that you have finished. You can still change marks until the deadline.</p>' +
    '<button type="button" class="btn ghost wide" id="btn-copy">نسخ الملخص <span class="en">Copy summary</span></button>' +
    '<button type="button" class="btn ghost wide" id="btn-back">← رجوع إلى التقييم <span class="en">Back to marking</span></button>' +
    '<textarea id="copybox" hidden rows="8" readonly></textarea></div>';
}

/* ================= rendering ================= */
function renderScore(d) {
  setVal($('#f-topic'), d.topic || ''); setVal($('#f-wc'), d.wc == null ? '' : String(d.wc));
  CRIT.forEach(function (c) { renderCard(c, d); });
  SECTIONS.forEach(function (s) { $('#st-' + s.id).textContent = secTotal(d, s.id); setVal($('#sc-' + s.id), secComment(d, s.id)); });
  setVal($('#f-comment'), d.comment || '');
  renderSummary(d);
  var ch = collatedHTML(d, false), cb = $('#collated');
  cb.classList.toggle('empty', !ch);
  cb.innerHTML = ch || 'Nothing yet. Comments you write under each of the three parts appear here.';
  $('#btn-insert').disabled = !ch || F.locked;
}
function summaryText() {
  var d = F.D, L = [];
  L.push('تقييم المقالة الموسعة · Maqala evaluation');
  L.push('Student: ' + (F.student.name || '—') + ' (ITS ' + F.student.its + (F.student.trno ? ', TRNO ' + F.student.trno : '') + ')');
  L.push('Topic: ' + (d.topic || '—'));
  L.push('Evaluator: ' + (F.evaluator.name || '—'));
  L.push('');
  L.push('TOTAL: ' + total(d) + ' / 100   (' + SECTIONS.map(function (s) { return s.en + ' ' + secTotal(d, s.id) + '/' + SECMAX[s.id]; }).join(' · ') + ')');
  L.push('');
  CRIT.forEach(function (c) {
    var m = mk(d, c.id), lv = m == null ? 0 : levelOf(c, m);
    L.push(c.n + '. ' + c.en + ' — ' + (m == null ? 'not marked' : m + '/' + c.max + ' (' + LEVELS[lv - 1].letter + ', ' + LEVELS[lv - 1].en + ')'));
  });
  SECTIONS.forEach(function (s) { var t = secComment(d, s.id).trim(); if (t) { L.push(''); L.push('Comments · ' + s.en + ' (' + s.ar + '):'); L.push(t); } });
  if ((d.comment || '').trim()) { L.push(''); L.push('Overall comment:'); L.push(d.comment.trim()); }
  return L.join('\n');
}
function renderResult() {
  var d = F.D;
  $('#r-name').textContent = F.student.name || 'Student ' + F.student.its;
  $('#r-topic').textContent = d.topic || '';
  $('#r-tk').innerHTML = MQ.tkChip(F.student.takhassus); $('#r-tk').hidden = !F.student.takhassus;
  $('#r-meta').textContent = 'ITS ' + F.student.its + (F.student.trno ? ' · TRNO ' + F.student.trno : '') + ' · Evaluator ' + (F.evaluator.name || '');
  $('#r-total').textContent = total(d);
  var h = '', miss = [];
  SECTIONS.forEach(function (s) {
    h += '<tr class="srow"><th colspan="2">' + s.ar + ' <span class="en">' + s.en + '</span></th><td class="rm">' + secTotal(d, s.id) + '<small>/' + SECMAX[s.id] + '</small></td></tr>';
    CRIT.filter(function (c) { return c.sec === s.id; }).forEach(function (c) {
      var m = mk(d, c.id), lv = m == null ? 0 : levelOf(c, m);
      if (m == null) miss.push(c.n);
      h += '<tr><td class="rn">' + c.n + '</td><td>' + esc(c.ar) + '</td><td class="rm">' + (lv ? '<span class="lt l' + lv + '">' + LEVELS[lv - 1].letter + '</span>' + m : '<span class="lt no">–</span>') + '<small>/' + c.max + '</small></td></tr>';
    });
  });
  h += '<tr class="trow"><th colspan="2">المجموع <span class="en">Total</span></th><td class="rm">' + total(d) + '<small>/100</small></td></tr>';
  $('#r-body').innerHTML = h;
  $('#r-missing').textContent = miss.length ? 'Not marked yet: criteria ' + miss.join(', ') + '.' : 'All 10 criteria are marked.';
  var rc = collatedHTML(d, true), rb = $('#r-comments');
  rb.classList.toggle('empty', !rc); rb.innerHTML = rc || 'No comments written.';
  var st = $('#r-status');
  if (F.status === 'complete') st.innerHTML = '<b class="ok">✓ Submitted</b>' + (F.submittedAt ? ' · ' + esc(F.submittedAt) : '');
  else st.innerHTML = miss.length ? '<b>In progress</b> · ' + (10 - miss.length) + ' of 10 criteria marked' : '<b>Ready to submit</b> · all 10 criteria marked';
  $('#btn-submit').textContent = '';
  $('#btn-submit').innerHTML = (F.status === 'complete' ? 'تم الإرسال · أعد الإرسال بعد التعديل <span class="en">Submitted · resubmit after changes</span>' : 'إرسال التقييم النهائي <span class="en">Submit final evaluation</span>');
  $('#btn-submit').disabled = !!F.locked;
}
/* ================= your grades in words (comments tab) =================
   Above each comment box: the grade the evaluator chose, in words, and what the rubric itself says for that grade, so the
   comment can be written from it. Nothing is generated: it is the rubric wording and the marks, arranged. */
var sumKey = '', sumOpen = {};
function sentences(t) { return String(t || '').split('.').map(function (x) { return x.trim(); }).filter(Boolean); }
function verdictOf(avg) { return LEVELS[Math.min(5, Math.max(1, Math.round(avg))) - 1]; }
function numBtn(c) { return '<button type="button" class="gs-n" data-act="godot" data-cid="' + c.id + '" title="Go to criterion ' + c.n + '" aria-label="Go to criterion ' + c.n + '">' + c.n + '</button>'; }
function secFacts(d, s) {
  var out = { s: s, marked: [], missing: [], sum: 0 };
  CRIT.filter(function (c) { return c.sec === s.id; }).forEach(function (c) {
    var m = mk(d, c.id);
    if (m == null) { out.missing.push(c); return; }
    var lv = levelOf(c, m); out.marked.push({ c: c, m: m, lv: lv }); out.sum += lv;
  });
  out.total = secTotal(d, s.id); out.max = SECMAX[s.id];
  out.verdict = out.marked.length ? verdictOf(out.sum / out.marked.length) : null;
  return out;
}
function overviewText(d, s) {
  var f = secFacts(d, s), t = s.ar + ' (' + f.total + '/' + f.max + ')' + (f.verdict ? ' — غالبًا ' + f.verdict.ar : '');
  f.marked.forEach(function (x) { t += '\n• ' + x.c.ar + ': ' + LEVELS[x.lv - 1].ar + ' (' + x.m + '/' + x.c.max + ')'; });
  return t;
}
function wordingText(c, d) {
  var m = mk(d, c.id); if (m == null) return '';
  var lv = levelOf(c, m); return '• ' + c.ar + ' (' + LEVELS[lv - 1].ar + '): ' + sentences(c.lv[lv - 1]).join('. ') + '.';
}
function sectionSummaryHTML(d, s) {
  var f = secFacts(d, s);
  if (!f.marked.length) return '<p class="gs-line">لم تُقيَّم معايير هذا القسم بعد. <span class="en">Nothing marked in this part yet. Your grades in words will appear here.</span></p>';
  var h = '<p class="gs-v"><span class="gs-t" dir="ltr">' + f.total + '/' + f.max + '</span> غالبًا <b class="l' + f.verdict.n + '">' + f.verdict.ar + '</b> <span class="en">Mostly ' + f.verdict.en + ' · ' + f.marked.length + ' of ' + (f.marked.length + f.missing.length) + ' criteria marked</span></p>';
  var strong = f.marked.filter(function (x) { return x.lv <= 2; }).map(function (x) { return numBtn(x.c); }).join('');
  var weak = f.marked.filter(function (x) { return x.lv >= 4; }).map(function (x) { return numBtn(x.c); }).join('');
  if (strong) h += '<p class="gs-line">الأقوى <span class="en">Strongest (A or B)</span> ' + strong + '</p>';
  if (weak) h += '<p class="gs-line">يحتاج إلى عناية <span class="en">Needs attention (D)</span> ' + weak + '</p>';
  if (f.missing.length) h += '<p class="gs-line">لم يُقيَّم بعد <span class="en">Not marked yet</span> ' + f.missing.map(numBtn).join('') + '</p>';
  var rows = CRIT.filter(function (c) { return c.sec === s.id; }).map(function (c) {
    var m = mk(d, c.id);
    if (m == null) return '<div class="gs-row">' + numBtn(c) + '<div class="gs-b"><p class="gs-title" dir="auto">' + esc(c.ar) + '</p><p class="gs-g none">لم يُقيَّم بعد · Not marked yet</p></div></div>';
    var lv = levelOf(c, m), L = LEVELS[lv - 1], pts = sentences(c.lv[lv - 1]);
    var key = 'c-' + c.id;
    return '<div class="gs-row">' + numBtn(c) + '<div class="gs-b"><p class="gs-title" dir="auto">' + esc(c.ar) + '</p>' +
      '<p class="gs-g l' + lv + '"><b>' + L.ar + '</b> <span class="en">' + L.en + ' (' + L.letter + ') · ' + m + ' out of ' + c.max + '</span></p>' +
      '<details data-sk="' + key + '"' + (sumOpen[key] ? ' open' : '') + '><summary>ماذا يقول المعيار لهذا المستوى <span class="en">What the rubric says for this grade</span></summary><ul>' +
      pts.map(function (p) { return '<li dir="auto">' + esc(p) + '.</li>'; }).join('') + '</ul>' +
      '<div class="gs-act"><button type="button" class="btn ghost sm" data-act="addword" data-cid="' + c.id + '"' + (F.locked ? ' disabled' : '') + '>＋ أضفه إلى تعليقات ' + s.ar + ' <span class="en">Add to my comment</span></button></div></details></div></div>';
  }).join('');
  var fk = 'sec-' + s.id;
  h += '<details class="gs-fold" data-sk="' + fk + '"' + (sumOpen[fk] ? ' open' : '') + '><summary>كل معيار بالكلمات <span class="en">Each criterion in words · ' + f.marked.length + '</span></summary>' + rows + '</details>';
  h += '<div class="gs-act"><button type="button" class="btn ghost sm" data-act="addover" data-sec="' + s.id + '"' + (F.locked ? ' disabled' : '') + '>＋ أضف النظرة العامة إلى تعليقاتي <span class="en">Add this overview to my comment</span></button></div>';
  return h;
}
function overallSummaryHTML(d) {
  var facts = SECTIONS.map(function (s) { return secFacts(d, s); }), n = 0, sum = 0, by = [0, 0, 0, 0, 0, 0];
  facts.forEach(function (f) { f.marked.forEach(function (x) { n++; sum += x.lv; by[x.lv]++; }); });
  if (!n) return '';
  var V = verdictOf(sum / n), pct = function (f) { return f.total / f.max; };
  var h = '<p class="gs-v"><span class="gs-t" dir="ltr">' + total(d) + '/100</span> غالبًا <b class="l' + V.n + '">' + V.ar + '</b> <span class="en">Overall: mostly ' + V.en + ' · ' + n + ' of 10 criteria marked</span></p>';
  h += '<p class="gs-line" dir="ltr">' + LEVELS.map(function (L, i) { return by[i + 1] ? '<span class="gs-c l' + (i + 1) + '">' + L.en + ' × ' + by[i + 1] + '</span>' : ''; }).join(' ') + '</p>';
  var done = facts.filter(function (f) { return f.missing.length === 0; });
  if (done.length > 1) {
    var hi = done.slice().sort(function (a, b) { return pct(b) - pct(a); }), lo = hi[hi.length - 1];
    if (pct(hi[0]) !== pct(lo)) h += '<p class="gs-line">الأقوى <span class="en">Strongest part</span> <b>' + hi[0].s.ar + '</b> · الأضعف <span class="en">Weakest part</span> <b>' + lo.s.ar + '</b></p>';
  }
  h += '<div class="gs-act"><button type="button" class="btn ghost sm" data-act="addall"' + (F.locked ? ' disabled' : '') + '>＋ أضف المجموع إلى تعليقي العام <span class="en">Add the total to my overall comment</span></button></div>';
  return h;
}
function renderSummary(d) {
  var key = JSON.stringify([d.marks, F.locked]);
  if (key === sumKey) return;
  sumKey = key;
  SECTIONS.forEach(function (s) { var el = $('#gs-' + s.id); if (el) { el.innerHTML = sectionSummaryHTML(d, s); } });
  var all = $('#gs-all'); if (all) { var ah = overallSummaryHTML(d); all.innerHTML = ah; all.hidden = !ah; }
}
function addToComment(field, text) {
  if (!text) return;
  var cur = field === 'comment' ? (F.D.comment || '') : secComment(F.D, field), v = cur + (cur.trim() ? '\n' : '') + text;
  var el = $(field === 'comment' ? '#f-comment' : '#sc-' + field); if (el) el.value = v;
  edit(field === 'comment' ? { comment: v } : { sec: o1(field, v) });
  if (!F.locked) MQ.toast('Added to your comment — edit it as you like');
}
/** Ten numbered dots in the header: the grade colour once a criterion is marked, a tap jumps to that criterion. */
function buildDots() {
  var h = '';
  CRIT.forEach(function (c) { h += '<button type="button" class="cdot" data-act="godot" data-cid="' + c.id + '" aria-label="Criterion ' + c.n + ', not marked yet">' + c.n + '</button>'; });
  $('#cdots').innerHTML = h;
}
function renderDots(d) {
  CRIT.forEach(function (c) {
    var b = $('#cdots [data-cid="' + c.id + '"]'); if (!b) return;
    var m = mk(d, c.id), lv = m == null ? 0 : levelOf(c, m);
    b.className = 'cdot' + (lv ? ' on l' + lv : '');
    b.setAttribute('aria-label', 'Criterion ' + c.n + (m == null ? ', not marked yet' : ', marked ' + m + ' out of ' + c.max));
    b.title = m == null ? 'Criterion ' + c.n + ': not marked' : 'Criterion ' + c.n + ': ' + m + '/' + c.max;
  });
}
function gotoCriterion(cid) {
  if (tab !== 'score') api.setTab('score');
  var el = $('#card-' + cid); if (!el) return;
  var box = $('#pbodyL'), top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 6;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { box.scrollTo({ top: top, behavior: calm ? 'auto' : 'smooth' }); } catch (e) { box.scrollTop = top; }
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function renderHeader() {
  var d = F.D;
  $('#s-tk').innerHTML = MQ.tkChip(F.student.takhassus); $('#s-tk').hidden = !F.student.takhassus;
  $('#rtot').textContent = total(d); $('#ctot').textContent = total(d);
  renderDots(d);
  $('#rprog').style.width = (markedCount(d) * 10) + '%';
  $('#rprog').parentNode.setAttribute('aria-valuenow', String(markedCount(d) * 10));
}
function applyLock() {
  $('#reader').classList.toggle('locked', !!F.locked);
  $$('#fv-score input, #fv-score textarea, #fv-score button[data-act=mark], #fv-score button[data-act=sub], #fv-comments textarea, #fv-comments .mics button, #fv-comments button[data-act=addword], #fv-comments button[data-act=addover], #fv-comments button[data-act=addall], #btn-submit').forEach(function (el) { el.disabled = !!F.locked; });
  $('#btn-insert').disabled = !!F.locked || !collatedHTML(F.D, false);
  $('#lockbanner').hidden = !F.locked;
  $('#lockbanner').textContent = F.lockReason === 'closed' ? 'أُغلقت هذه السنة · This year has been closed. Marks are locked.' : 'انتهى الموعد · The deadline has passed. Marks are locked.';
}
function renderAll() {
  if (!F) return;
  renderHeader(); renderScore(F.D);
  if (tab === 'result') renderResult();
  applyLock(); setSync();
}

/* ================= saving ================= */
function pkey() { return 'mq.pending.' + F.student.its + '.' + F.evaluator.its; }
function persistPending() { if (Object.keys(F.pending).length) MQ.lsSet(pkey(), JSON.stringify(F.pending)); else MQ.lsDel(pkey()); }
function setSync() {
  var el = $('#sync'); if (!el) return;
  var k, t;
  if (!F) { k = 'wait'; t = ''; }
  else if (F.locked) { k = 'bad'; t = F.lockReason === 'closed' ? 'Locked · year closed' : 'Locked · deadline passed'; }
  else if (F.inflight || Object.keys(F.pending).length) { k = F.lastErr && F.lastErr.code === 'network' ? 'bad' : 'busy'; t = F.lastErr && F.lastErr.code === 'network' ? 'Offline · will retry' : 'Saving…'; }
  else if (F.lastErr) { k = 'bad'; t = 'Not saved'; }
  else { k = 'ok'; t = F.savedAt ? 'Saved ' + String(F.savedAt).slice(-5) : 'Saved'; }
  el.setAttribute('data-k', k); $('span', el).textContent = t;
  var c = $('#csync'); if (c) { c.setAttribute('data-k', k); $('span', c).textContent = k === 'ok' ? 'Saved' : t; }
}
function schedule() { clearTimeout(F.timer); F.timer = setTimeout(function () { flush().catch(function () {}); }, 900); setSync(); }
function flush(opt) {
  var mine = F;
  var p = mine.chain.then(function () { return doFlush(mine, opt || {}); });
  mine.chain = p.catch(function () {});
  return p;
}
async function doFlush(f, opt) {
  clearTimeout(f.timer);
  var keys = Object.keys(f.pending);
  if (!keys.length && !opt.submit) { setSync(); return null; }
  var snap = f.pending; f.pending = {}; f.inflight = true; setSync();
  try {
    var r = await MQ.api('saveEvaluation', { studentIts: f.student.its, evaluatorIts: f.evaluator.its, patch: snap, submit: !!opt.submit }, { keepalive: !!opt.keepalive });
    f.lastErr = null; f.retry = 0; f.savedAt = r.savedAt; f.status = r.status;
    if (r.status === 'complete' && opt.submit) f.submittedAt = r.savedAt;
    if (F === f) {
      persistPending();
      if (Object.keys(f.pending).length) f.timer = setTimeout(function () { flush().catch(function () {}); }, 300);
      if (tab === 'result') renderResult();
    }
    return r;
  } catch (e) {
    f.lastErr = e;
    if (e.code === 'locked') { f.locked = true; f.lockReason = /closed/.test(e.message || '') ? 'closed' : 'deadline'; f.pending = {}; }
    else if (e.code === 'network' || e.code === 'server' || e.code === 'auth') {
      Object.keys(snap).forEach(function (k) { if (!(k in f.pending)) f.pending[k] = snap[k]; });
      f.retry = (f.retry || 0) + 1;
      clearTimeout(f.timer);
      f.timer = setTimeout(function () { if (F === f) flush().catch(function () {}); }, Math.min(30000, 3000 * f.retry));
    } else if (e.code !== 'incomplete') { f.pending = {}; }       // the server refused these values; do not resend them
    if (F === f) {
      persistPending();
      if (e.code === 'locked') applyLock();
      if (e.code !== 'incomplete' && (e.code === 'locked' || e.code === 'forbidden' || e.code === 'bad_request' || e.code === 'not_found')) {
        MQ.toast(e.message, 'bad');
        if (e.code !== 'locked') refresh(true);
      }
    }
    throw e;
  } finally {
    f.inflight = false; if (F === f) setSync();
  }
}
function edit(patch) {
  if (!F) return;
  if (F.locked) { MQ.toast(F.lockReason === 'closed' ? 'This year has been closed. Marks are locked.' : 'The deadline has passed. Marks are locked.', 'bad'); renderAll(); return; }
  var f = flat(patch, '', {});
  applyFlat(F.D, f);
  Object.assign(F.pending, f);
  F.rev++;
  persistPending();
  renderAll(); schedule();
}

/* ================= pulling changes made on another device ================= */
async function refresh(force) {
  if (!F || F.refreshing) return;
  var f = F, rev = f.rev;
  if (!force && (f.inflight || Object.keys(f.pending).length)) return;
  f.refreshing = true;
  try {
    var r = await MQ.api('evaluation', { studentIts: f.student.its, evaluatorIts: f.evaluator.its });
    if (F !== f) return;
    MQ.skew = r.serverNow - Date.now();
    f.deadline = r.deadline; f.locked = !!r.locked && !MQ.session.user.isAdmin; f.lockReason = r.lockReason || '';
    if (!force && (f.rev !== rev || f.inflight || Object.keys(f.pending).length)) { applyLock(); return; }
    if (force || r.savedAt !== f.savedAt || r.status !== f.status) {
      f.D = normData(r.data); applyFlat(f.D, f.pending);
      f.savedAt = r.savedAt; f.status = r.status;
      f.lastErr = null;
      renderAll();
    } else applyLock();
  } catch (e) { /* offline: try again next time */ } finally { f.refreshing = false; }
}

/* ================= dictation (the browser's own speech recognition) ================= */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var rec = null, dictTarget = null, dictOn = false, dictLang = MQ.lsGet('maqala.lang') || 'ar';
var LANGS = ['ar', 'en'], LCODE = { ar: 'ar-SA', en: 'en-US' };
function fieldValue(id) { return id === 'f-comment' ? (F.D.comment || '') : secComment(F.D, id.slice(3)); }
function fieldPatch(id, v) { return id === 'f-comment' ? { comment: v } : { sec: o1(id.slice(3), v) }; }
function renderMics() {
  $$('.mics').forEach(function (m) { m.hidden = !SR; });
  $$('.mic').forEach(function (b) { var on = dictOn && dictTarget === b.getAttribute('data-mic'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); $('span', b).textContent = on ? 'Stop' : 'Dictate'; });
  $$('.lang').forEach(function (b) { b.textContent = dictLang.toUpperCase(); });
}
function stopDict() { if (rec && dictOn) { try { rec.stop(); } catch (e) { /* ignore */ } } }
function toggleMic(id) {
  if (!SR) return;
  if (dictOn) { var same = dictTarget === id; stopDict(); if (same) return; }
  if (F.locked) return;
  dictTarget = id;
  rec = new SR();
  rec.lang = LCODE[dictLang]; rec.continuous = true; rec.interimResults = true;
  rec.onstart = function () { dictOn = true; renderMics(); };
  rec.onend = function () { dictOn = false; var p = $('#pt-' + dictTarget); if (p) p.textContent = ''; renderMics(); };
  rec.onerror = function (e) {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') MQ.toast('Microphone access is blocked for this page. You can keep typing.', 'bad');
    else if (e.error === 'language-not-supported') MQ.toast('This browser cannot dictate in ' + dictLang.toUpperCase() + '. Tap the language button to try the other.', 'bad');
    else if (e.error !== 'no-speech' && e.error !== 'aborted') MQ.toast('Dictation stopped. Try again.', 'bad');
  };
  rec.onresult = function (ev) {
    var interim = '';
    for (var i = ev.resultIndex; i < ev.results.length; i++) {
      var r = ev.results[i], text = r[0].transcript;
      if (r.isFinal) {
        text = text.trim(); if (!text) continue;
        var cur = fieldValue(dictTarget), v = cur ? cur + (/\s$/.test(cur) ? '' : ' ') + text : text;
        var el = $('#' + dictTarget); if (el) el.value = v;
        edit(fieldPatch(dictTarget, v));
      } else interim += text;
    }
    var p = $('#pt-' + dictTarget); if (p) p.textContent = interim;
  };
  try { rec.start(); } catch (e) { MQ.toast('Dictation did not start. Try again.', 'bad'); }
}

/* ================= events ================= */
function onClick(e) {
  if (!F) return;
  var mb = e.target.closest('button[data-mic]'); if (mb) { toggleMic(mb.getAttribute('data-mic')); return; }
  if (e.target.closest('button[data-lang]')) { dictLang = LANGS[(LANGS.indexOf(dictLang) + 1) % LANGS.length]; MQ.lsSet('maqala.lang', dictLang); renderMics(); return; }
  var fb = e.target.closest('#fv-rubric button[data-f]'); if (fb) { rubricFilter = +fb.getAttribute('data-f'); renderRubric(); return; }
  var b = e.target.closest('button[data-act]');
  if (b) {
    var act = b.getAttribute('data-act');
    if (act === 'gocm') { if (callbacks.openComments) callbacks.openComments(b.getAttribute('data-sec')); return; }
    if (act === 'godot') { gotoCriterion(b.getAttribute('data-cid')); return; }
    if (act === 'addword') { var wc = CR[b.getAttribute('data-cid')]; if (wc) addToComment(wc.sec, wordingText(wc, F.D)); return; }
    if (act === 'addover') { var so = SECTIONS.filter(function (x) { return x.id === b.getAttribute('data-sec'); })[0]; if (so) addToComment(so.id, overviewText(F.D, so)); return; }
    if (act === 'addall') {
      var lines = ['المجموع: ' + total(F.D) + '/100'];
      SECTIONS.forEach(function (s) { var f = secFacts(F.D, s); if (f.marked.length) lines.push(s.ar + ': ' + f.total + '/' + f.max + ' — غالبًا ' + f.verdict.ar); });
      addToComment('comment', lines.join('\n')); return;
    }
    var card = b.closest('.crit'), cid = card && card.getAttribute('data-cid'), d = F.D;
    if (act === 'lvl') { preview[cid] = +b.getAttribute('data-l'); renderCard(CR[cid], d); }
    else if (act === 'mark') {
      var m = +b.getAttribute('data-m');
      if (mk(d, cid) === m) edit({ marks: o1(cid, null) });
      else { preview[cid] = +b.getAttribute('data-l'); edit({ marks: o1(cid, m) }); }
    } else if (act === 'sub') {
      var k = b.getAttribute('data-key'), v = b.getAttribute('data-v');
      edit({ subs: o1(k, d.subs[k] === v ? null : v) });
    }
    return;
  }
  var id = e.target.id;
  if (id === 'btn-result' || e.target.closest('#btn-result')) { api.setTab('result'); return; }
  if (e.target.closest('#btn-back')) { api.setTab('score'); return; }
  if (e.target.closest('#btn-insert')) {
    var t = collatedText(F.D); if (!t) return;
    var cur = F.D.comment || '', v2 = cur + (cur.trim() ? '\n\n' : '') + t;
    $('#f-comment').value = v2; edit({ comment: v2 }); MQ.toast('Added to your overall comment');
    return;
  }
  if (e.target.closest('#btn-copy')) {
    var text = summaryText();
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { MQ.toast('Summary copied'); }, function () {
      var ta = $('#copybox'); ta.hidden = false; ta.value = text; ta.focus(); ta.select(); MQ.toast('Select all and copy');
    });
    return;
  }
  if (e.target.closest('#btn-submit')) { submit(); }
}
function onInput(e) {
  if (!F) return;
  var t = e.target;
  if (t.id === 'f-topic') edit({ topic: t.value });
  else if (t.id === 'f-wc') {
    var raw = t.value, idx = CR.c10.subs.findIndex(function (s) { return s.wc; }), p = { wc: raw === '' ? '' : +raw };
    if (raw !== '') { var n = +raw; p.subs = o1('c10_' + idx, (n >= WC_MIN && n <= WC_MAX) ? 'Y' : 'N'); }
    edit(p);
  } else if (t.getAttribute && t.getAttribute('data-sec')) edit({ sec: o1(t.getAttribute('data-sec'), t.value) });
  else if (t.id === 'f-comment') edit({ comment: t.value });
}
async function submit() {
  var miss = CRIT.filter(function (c) { return mk(F.D, c.id) == null; }).map(function (c) { return c.n; });
  if (miss.length) { MQ.toast('Mark every criterion first. Still missing: ' + miss.join(', '), 'bad'); api.setTab('score'); return; }
  var ok = await MQ.confirm('Submit your final evaluation for ' + (F.student.name || F.student.its) + '? You can still change it until the deadline.', 'Submit', false);
  if (!ok) return;
  try {
    await flush({ submit: true });
    renderResult(); MQ.toast('Submitted. Thank you.');
  } catch (e) { MQ.toast(e.message, 'bad'); }
}

/* ================= public API ================= */
var api = MQ.form = {
  mounted: false,
  mount: function (cb) {
    callbacks = cb || {};
    if (api.mounted) return;
    api.mounted = true;
    buildScore(); buildDots(); buildComments(); buildResult(); renderRubric(); renderMics();
    var root = $('#reader');
    root.addEventListener('click', onClick);
    root.addEventListener('toggle', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-sk')) sumOpen[t.getAttribute('data-sk')] = t.open; }, true);
    root.addEventListener('input', onInput);
    window.addEventListener('beforeunload', function (e) { if (F && (F.inflight || Object.keys(F.pending).length)) { e.preventDefault(); e.returnValue = ''; } });
    function bg() { if (F && Object.keys(F.pending).length) flush({ keepalive: true }).catch(function () {}); }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') bg(); else refresh(); });
    window.addEventListener('pagehide', bg);
    window.addEventListener('focus', function () { refresh(); });
    setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, 25000);
    setInterval(function () {
      if (!F) return;
      if (F.deadline && !MQ.session.user.isAdmin && MQ.now() > F.deadline.ms && !F.locked) { F.locked = true; renderAll(); }
      callbacks.tick && callbacks.tick();
    }, 20000);
  },
  load: async function (studentIts, evIts) {
    if (F) await api.unload();
    var r = await MQ.api('evaluation', { studentIts: studentIts, evaluatorIts: evIts || undefined });
    MQ.skew = r.serverNow - Date.now();
    F = {
      student: r.student, evaluator: r.evaluator, D: normData(r.data), status: r.status, savedAt: r.savedAt, submittedAt: '',
      deadline: r.deadline, locked: !!r.locked && !MQ.session.user.isAdmin, lockReason: r.lockReason || '', pending: {}, inflight: false, lastErr: null, timer: null, retry: 0,
      chain: Promise.resolve(), rev: 0, refreshing: false
    };
    preview = {}; sumKey = ''; sumOpen = {};
    // changes typed on this device that never reached the server (closed tab, lost connection)
    var raw = MQ.lsGet(pkey());
    if (raw) {
      try {
        var p = JSON.parse(raw);
        if (isObj(p) && Object.keys(p).length && !F.locked) {
          Object.assign(F.pending, p); applyFlat(F.D, p); F.rev++;
          MQ.toast('Restored changes that had not been saved yet.');
          schedule();
        } else MQ.lsDel(pkey());
      } catch (e) { MQ.lsDel(pkey()); }
    }
    renderAll();
    if (tab === 'result') renderResult();
    return r;
  },
  unload: async function () {
    stopDict();
    if (F && (Object.keys(F.pending).length || F.inflight)) { try { await flush(); } catch (e) { /* kept in local storage */ } }
    F = null;
  },
  flushNow: function () { return F ? flush() : Promise.resolve(); },
  state: function () { return F; },
  busy: function () {
    var a = document.activeElement;
    return dictOn || !!(a && /^(TEXTAREA|INPUT)$/.test(a.tagName) && a.closest('.panel'));
  },
  setTab: function (t) {
    tab = t;
    $$('#panelL .fview').forEach(function (v) { v.hidden = v.id !== 'fv-' + t; });
    $$('#panelL .ptabs button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === t ? 'true' : 'false'); });
    if (t === 'result' && F) renderResult();
    var body = $('#pbodyL'); if (body) body.scrollTop = 0;
  },
  currentTab: function () { return tab; },
  focusComment: function (sec) { var el = $('#sc-' + sec); if (el) { el.focus(); } },
  total: function () { return F ? total(F.D) : 0; },
  stopDictation: stopDict,
  renderMics: renderMics,
  tab: function () { return tab; }
};
})();
