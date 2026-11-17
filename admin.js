/* Dissertations office dashboard: progress, analysis, years, evaluator assignment, files and checks, settings. */
(function () {
'use strict';
var MQ = window.MQ, $ = MQ.$, $$ = MQ.$$, esc = MQ.esc;
var D = null, V = null, loadedAt = 0, sub = 'progress', derived = null, filter = { q: '', st: 'all' };
var yearSel = MQ.lsGet('mq.admyear') || '';                 // '' = the current year, '*' = every year, otherwise one year
var asg = { q: '', st: 'all', same: false, limit: 50, sel: {} };
var SUBS = [['progress', 'Progress'], ['analysis', 'Analysis'], ['years', 'Years'], ['assign', 'Assign'], ['files', 'Files & checks'], ['settings', 'Settings']];
var BY_YEAR = { progress: 1, analysis: 1, assign: 1 };      // the tabs the year picker applies to

/* ---------- the year picker: the dashboard shows one year at a time ---------- */
function activeYear() {
  if (!D || !D.years || !D.years.length) return '';
  if (yearSel === '*') return '';
  if (yearSel && D.years.some(function (y) { return y.year === yearSel; })) return yearSel;
  return D.settings.currentYear || '';
}
function makeView() {
  var y = activeYear();
  var st = y ? D.students.filter(function (x) { return x.year === y; }) : D.students, set = {};
  st.forEach(function (x) { set[x.its] = 1; });
  V = { students: st, rows: y ? D.rows.filter(function (r) { return set[r.its]; }) : D.rows };
}
function drawYearPick() {
  var box = $('#adm-yearbox'), sel = $('#adm-year');
  var show = !!(D && D.years && D.years.length) && !!BY_YEAR[sub];
  box.hidden = !show;
  if (!show) return;
  sel.innerHTML = '<option value="*">All years</option>' + D.years.map(function (y) { return '<option value="' + esc(y.year) + '">' + esc(y.year) + (y.current ? ' (current)' : '') + (y.closed ? ' · closed' : '') + '</option>'; }).join('');
  sel.value = activeYear() || '*';
}
function tInfo(t) {
  var bits = [];
  if (t.gender) bits.push(t.gender === 'F' ? 'F' : 'M');
  if (t.age) bits.push(t.age + 'y');
  return bits.length ? ' · ' + bits.join(' ') : '';
}

/* ---------- derived numbers ---------- */
function derive() {
  var rowBy = {};
  V.rows.forEach(function (r) { rowBy[r.its + '|' + r.ev] = r; });
  var tBy = {}; D.teachers.forEach(function (t) { tBy[t.its] = t; });
  var list = [];
  V.students.forEach(function (s) {
    s.ev.forEach(function (ev, i) {
      if (!ev) return;
      var r = rowBy[s.its + '|' + ev] || null;
      list.push({ s: s, ev: ev, slot: i + 1, t: tBy[ev] || null, r: r, st: r ? (r.status === 'complete' ? 'complete' : 'in_progress') : 'not_started' });
    });
  });
  var done = list.filter(function (a) { return a.st === 'complete'; });
  var byStu = {};
  list.forEach(function (a) { (byStu[a.s.its] = byStu[a.s.its] || []).push(a); });
  var fully = V.students.filter(function (s) { var l = byStu[s.its]; return l && l.length && l.every(function (a) { return a.st === 'complete'; }); }).length;
  return { rowBy: rowBy, tBy: tBy, list: list, done: done, byStu: byStu, fully: fully,
    counts: { complete: done.length, in_progress: list.filter(function (a) { return a.st === 'in_progress'; }).length, not_started: list.filter(function (a) { return a.st === 'not_started'; }).length } };
}
function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
function f1(n) { return n == null ? '–' : (Math.round(n * 10) / 10).toString(); }
function pct(n, d) { return d ? Math.round(n * 100 / d) : 0; }

/* ---------- small building blocks ---------- */
function tile(label, value, note, kind) { return '<div class="tile ' + (kind || '') + '"><b>' + value + '</b><span>' + label + '</span>' + (note ? '<small>' + note + '</small>' : '') + '</div>'; }
function chip(st, text) {
  var t = text || ({ complete: 'Complete', in_progress: 'In progress', not_started: 'Not started' })[st];
  return '<span class="stc ' + st + '">' + esc(t) + '</span>';
}
function stackBar(parts, total) {
  if (!total) return '<div class="stack empty"></div>';
  return '<div class="stack" role="img" aria-label="' + parts.map(function (p) { return p.n + ' ' + p.label; }).join(', ') + '">' + parts.filter(function (p) { return p.n > 0; }).map(function (p) {
    return '<i class="' + p.cls + '" style="width:' + (p.n * 100 / total) + '%" title="' + esc(p.label) + ': ' + p.n + '">' + (p.n * 100 / total > 9 ? p.n : '') + '</i>';
  }).join('') + '</div>';
}
function legend(parts) { return '<p class="legend">' + parts.map(function (p) { return '<span><i class="' + p.cls + '"></i>' + esc(p.label) + ' ' + p.n + '</span>'; }).join('') + '</p>'; }
function statusParts(c) {
  return [{ n: c.complete, label: 'Complete', cls: 'sc-done' }, { n: c.in_progress, label: 'In progress', cls: 'sc-prog' }, { n: c.not_started, label: 'Not started', cls: 'sc-none' }];
}

/* ---------- progress ---------- */
function pendingEvaluators() {
  var m = {};
  derived.list.forEach(function (a) { if (a.st !== 'complete') { var o = m[a.ev] = m[a.ev] || { its: a.ev, n: 0 }; o.n++; } });
  return m;
}
function renderProgress() {
  var c = derived.counts, total = derived.list.length, dl = D.settings.deadline;
  var h = '<div class="tiles">' +
    tile('Students', V.students.length, derived.fully + ' fully evaluated') +
    tile('Evaluations assigned', total, D.teachers.filter(function (t) { return pendingCountOf(t.its, true); }).length + ' evaluators') +
    tile('Complete', c.complete, pct(c.complete, total) + '%', 'good') +
    tile('In progress', c.in_progress, '', 'warn') +
    tile('Not started', c.not_started, '', c.not_started ? 'bad' : '') +
    '</div>';
  h += '<div class="card">' + stackBar(statusParts(c), total) + legend(statusParts(c)) + '</div>';
  var tl = dl ? MQ.timeLeft(dl.ms) : null;
  h += '<div class="card dlcard"><div><b>Deadline</b><p>' + (dl ? esc(dl.text) + ' <span class="en">(' + esc(dl.tz) + ') · ' + esc(tl.text) + '</span>' : 'None set. Marks never lock.') + '</p></div><a class="btn ghost" href="#/admin/settings">Change</a></div>';

  var pend = pendingEvaluators(), pn = Object.keys(pend).length, pc = Object.keys(pend).reduce(function (a, k) { return a + pend[k].n; }, 0);
  h += '<div class="card"><div class="rowh"><h3 class="h3">Evaluators</h3><div class="acts">' +
    '<button type="button" class="btn gold" data-a="notify-all"' + (pn ? '' : ' disabled') + '>Notify all pending (' + pn + ')</button>' +
    '<button type="button" class="btn ghost" data-a="csv">Export CSV</button></div></div>' +
    '<p class="note">' + (pn ? pn + ' evaluator' + (pn === 1 ? ' has ' : 's have ') + pc + ' evaluation' + (pc === 1 ? '' : 's') + ' still to finish. A reminder email lists their pending students and the deadline.' : 'Every assigned evaluation is complete.') + '</p>';
  var byEv = {};
  derived.list.forEach(function (a) { var o = byEv[a.ev] = byEv[a.ev] || { its: a.ev, t: a.t, n: 0, c: 0, p: 0, z: 0, saved: '' }; o.n++; if (a.st === 'complete') o.c++; else if (a.st === 'in_progress') o.p++; else o.z++; if (a.r && a.r.saved > o.saved) o.saved = a.r.saved; });
  var evs = Object.keys(byEv).map(function (k) { return byEv[k]; }).sort(function (a, b) { return (b.n - b.c) - (a.n - a.c) || a.its.localeCompare(b.its); });
  h += '<div class="tw"><table class="tb"><thead><tr><th>Evaluator</th><th class="nm">Assigned</th><th class="nm">Done</th><th class="nm">In progress</th><th class="nm">Not started</th><th>Last saved</th><th></th></tr></thead><tbody>';
  evs.forEach(function (e) {
    h += '<tr><td><b>' + esc(e.t ? e.t.name : 'Unknown') + '</b><br><span class="en">' + esc(e.its) + (e.t ? ' · ' + esc(e.t.email) : ' · not in teachers tab') + (e.t && e.t.mobile ? ' · <a href="tel:' + esc(e.t.mobile.replace(/[^\d+]/g, '')) + '">' + esc(e.t.mobile) + '</a>' : '') + '</span></td><td class="nm">' + e.n + '</td><td class="nm">' + e.c + '</td><td class="nm">' + e.p + '</td><td class="nm">' + e.z + '</td><td class="en">' + esc(e.saved || '–') + '</td><td>' +
      (e.n - e.c ? '<button type="button" class="btn sm ghost" data-a="notify" data-its="' + esc(e.its) + '">Notify</button>' : '<span class="ok">✓</span>') + '</td></tr>';
  });
  if (!evs.length) h += '<tr><td colspan="7" class="empty">No evaluator is assigned to any student yet. Fill evaluator_1_its, evaluator_2_its and evaluator_3_its in the students tab.</td></tr>';
  h += '</tbody></table></div></div>';

  h += '<div class="card"><div class="rowh"><h3 class="h3">Students</h3><div class="acts"><input type="search" id="stq" placeholder="Search name, ITS or TRNO" value="' + esc(filter.q) + '" aria-label="Search students"><select id="stf" aria-label="Filter"><option value="all">All</option><option value="pending">Anything pending</option><option value="complete">All complete</option><option value="nopdf">No PDF</option><option value="noev">No evaluator</option></select></div></div><div id="stlist"></div></div>';
  $('#adm-body').innerHTML = h;
  $('#stf').value = filter.st;
  renderStudents();
}
function pendingCountOf(its, anyState) { return derived.list.some(function (a) { return a.ev === its; }); }
function renderStudents() {
  var q = filter.q.trim().toLowerCase(), out = [];
  V.students.forEach(function (s) {
    var l = derived.byStu[s.its] || [];
    if (q && (s.name + ' ' + s.its + ' ' + s.trno).toLowerCase().indexOf(q) < 0) return;
    if (filter.st === 'pending' && !l.some(function (a) { return a.st !== 'complete'; })) return;
    if (filter.st === 'complete' && !(l.length && l.every(function (a) { return a.st === 'complete'; }))) return;
    if (filter.st === 'nopdf' && s.pdf) return;
    if (filter.st === 'noev' && l.length) return;
    out.push(s);
  });
  var shown = out.slice(0, 200);
  var h = '<div class="tw"><table class="tb"><thead><tr><th>Student</th><th>TRNO</th><th>PDF</th><th>Evaluators</th><th class="nm">Average</th><th></th></tr></thead><tbody>';
  shown.forEach(function (s) {
    var l = derived.byStu[s.its] || [], totals = l.filter(function (a) { return a.st === 'complete'; }).map(function (a) { return a.r.t.t; });
    h += '<tr><td><b dir="auto">' + esc(s.name || '—') + '</b><br><span class="en">' + esc(s.its) + (activeYear() ? '' : (s.year ? ' · ' + esc(s.year) : '')) + '</span></td><td class="en">' + esc(s.trno || '–') + '</td>' +
      '<td>' + (s.pdf ? '<span class="ok" title="' + esc(s.pdf) + '">✓</span>' + (s.pdfCount > 1 ? ' <span class="en">×' + s.pdfCount + '</span>' : '') : '<span class="bad">✗</span>') + '</td><td>' +
      (l.length ? l.map(function (a) {
        return '<span class="evpill ' + a.st + '" title="' + esc((a.t ? a.t.name : a.ev) + ' · ' + a.st.replace('_', ' ')) + '"><em>' + esc(a.t && a.t.name ? a.t.name : a.ev) + '</em>' + (a.st === 'not_started' ? '–' : a.r.t.t) + '</span>';
      }).join('') : '<span class="note">none</span>') + '</td><td class="nm">' + (totals.length ? f1(avg(totals)) : '–') + '</td>' +
      '<td><button type="button" class="btn sm ghost" data-a="report" data-its="' + esc(s.its) + '">Open</button></td></tr>';
  });
  if (!shown.length) h += '<tr><td colspan="6" class="empty">No student matches.</td></tr>';
  h += '</tbody></table></div>' + (out.length > shown.length ? '<p class="note">Showing the first ' + shown.length + ' of ' + out.length + '. Search to narrow the list.</p>' : '');
  $('#stlist').innerHTML = h;
}

/* ---------- analysis ---------- */
function renderAnalysis() {
  var done = derived.done, th = D.settings.threshold;
  var h = '';
  if (!done.length) {
    $('#adm-body').innerHTML = '<div class="card"><p class="note">The analysis appears once evaluators submit their first evaluations. It uses completed evaluations only.</p></div>';
    return;
  }
  var totals = done.map(function (a) { return a.r.t.t; });
  h += '<div class="tiles">' + tile('Completed evaluations', done.length) + tile('Average total', f1(avg(totals)), 'out of 100') + tile('Highest', Math.max.apply(null, totals)) + tile('Lowest', Math.min.apply(null, totals)) + '</div>';

  // distribution of totals
  var bins = [['Below 50', 0, 49], ['50–59', 50, 59], ['60–69', 60, 69], ['70–79', 70, 79], ['80–89', 80, 89], ['90–100', 90, 100]];
  var counts = bins.map(function (b) { return totals.filter(function (t) { return t >= b[1] && t <= b[2]; }).length; }), mx = Math.max.apply(null, counts);
  h += '<div class="card"><h3 class="h3">How the totals are spread</h3><p class="note">Number of completed evaluations in each range of the 100 marks.</p><div class="hbars">' +
    bins.map(function (b, i) { return '<div class="hb"><span>' + b[0] + '</span><div><i style="width:' + (mx ? counts[i] * 100 / mx : 0) + '%"></i></div><b>' + counts[i] + '</b></div>'; }).join('') + '</div></div>';

  // sections
  var secs = [['m', 'Methodology', 'منهجية', SECMAX.m], ['c', 'Content', 'مضمون', SECMAX.c], ['f', 'Language & form', 'لغة وشكليات', SECMAX.f]];
  h += '<div class="card"><h3 class="h3">Average by part</h3><div class="hbars">' + secs.map(function (s) {
    var a = avg(done.map(function (x) { return x.r.t[s[0]]; }));
    return '<div class="hb wide"><span>' + s[1] + ' <em class="en">' + s[2] + '</em></span><div><i style="width:' + (a / s[3] * 100) + '%"></i></div><b>' + f1(a) + ' / ' + s[3] + '</b></div>';
  }).join('') + '</div></div>';

  // criteria
  h += '<div class="card"><h3 class="h3">Criterion by criterion</h3><p class="note">Average mark as a share of the maximum, and how the grades were given.</p><div class="crit-an">';
  CRIT.forEach(function (c, i) {
    var ms = done.map(function (a) { return a.r.marks[i]; }).filter(function (m) { return m != null; });
    var gc = { A: 0, B: 0, C: 0, D: 0 };
    done.forEach(function (a) { var g = a.r.grades[i]; if (gc[g] !== undefined) gc[g]++; });
    var a = avg(ms);
    h += '<div class="cr"><div class="cl"><span class="num">' + c.n + '</span><span dir="auto">' + esc(c.ar) + '</span></div><div class="hb thin"><div><i style="width:' + (a == null ? 0 : a / c.max * 100) + '%"></i></div><b>' + f1(a) + '/' + c.max + '</b></div>' +
      stackBar([{ n: gc.A, label: 'A', cls: 'g1' }, { n: gc.B, label: 'B', cls: 'g2' }, { n: gc.C, label: 'C', cls: 'g3' }, { n: gc.D, label: 'D', cls: 'g4' }], ms.length) + '</div>';
  });
  h += '</div><p class="legend"><span><i class="g1"></i>A</span><span><i class="g2"></i>B</span><span><i class="g3"></i>C</span><span><i class="g4"></i>D (weak or unacceptable)</span></p></div>';

  // evaluators
  var byEv = {};
  done.forEach(function (a) { (byEv[a.ev] = byEv[a.ev] || []).push(a.r.t.t); });
  var allAvg = avg(totals);
  h += '<div class="card"><h3 class="h3">Evaluator averages</h3><p class="note">A big gap from the overall average (' + f1(allAvg) + ') can mean an evaluator is stricter or more generous than the rest.</p><div class="tw"><table class="tb"><thead><tr><th>Evaluator</th><th class="nm">Completed</th><th class="nm">Average</th><th class="nm">Lowest</th><th class="nm">Highest</th><th class="nm">Vs overall</th></tr></thead><tbody>';
  Object.keys(byEv).sort().forEach(function (k) {
    var t = derived.tBy[k], v = byEv[k], a = avg(v), d = a - allAvg;
    h += '<tr><td><b>' + esc(t ? t.name : k) + '</b><br><span class="en">' + esc(k) + '</span></td><td class="nm">' + v.length + '</td><td class="nm">' + f1(a) + '</td><td class="nm">' + Math.min.apply(null, v) + '</td><td class="nm">' + Math.max.apply(null, v) + '</td><td class="nm ' + (Math.abs(d) >= th ? 'bad' : '') + '">' + (d > 0 ? '+' : '') + f1(d) + '</td></tr>';
  });
  h += '</tbody></table></div></div>';

  // disagreement
  var dis = [];
  V.students.forEach(function (s) {
    var l = (derived.byStu[s.its] || []).filter(function (a) { return a.st === 'complete'; });
    if (l.length < 2) return;
    var t = l.map(function (a) { return a.r.t.t; }), gap = Math.max.apply(null, t) - Math.min.apply(null, t);
    if (gap >= th) dis.push({ s: s, l: l, gap: gap });
  });
  dis.sort(function (a, b) { return b.gap - a.gap; });
  h += '<div class="card"><h3 class="h3">Where evaluators disagree</h3><p class="note">Students with two or more completed evaluations whose totals differ by ' + th + ' marks or more. You can change this limit in Settings.</p>';
  if (!dis.length) h += '<p class="ok">No student reaches that gap.</p>';
  else {
    h += '<div class="tw"><table class="tb"><thead><tr><th>Student</th><th>Totals</th><th class="nm">Gap</th><th></th></tr></thead><tbody>';
    dis.forEach(function (d) {
      h += '<tr><td><b dir="auto">' + esc(d.s.name) + '</b><br><span class="en">' + esc(d.s.its) + '</span></td><td>' + d.l.map(function (a) { return '<span class="evpill complete"><em>' + esc(a.t && a.t.name ? a.t.name : a.ev) + '</em>' + a.r.t.t + '</span>'; }).join('') + '</td><td class="nm bad">' + d.gap + '</td><td><button type="button" class="btn sm ghost" data-a="report" data-its="' + esc(d.s.its) + '">Compare</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div>';
  $('#adm-body').innerHTML = h;
}

/* ---------- files and checks ---------- */
function renderFiles() {
  var f = D.files, h = '';
  var errs = D.checks.filter(function (c) { return c.level === 'error'; }), warns = D.checks.filter(function (c) { return c.level === 'warn'; });
  h += '<div class="tiles">' + tile('Files in the folder', f.total) + tile('Students with a PDF', D.students.filter(function (s) { return s.pdf; }).length, 'of ' + D.students.length) + tile('Errors', errs.length, '', errs.length ? 'bad' : 'good') + tile('Warnings', warns.length, '', warns.length ? 'warn' : 'good') + '</div>';
  h += '<div class="card"><div class="rowh"><h3 class="h3">Checks on the spreadsheet</h3><button type="button" class="btn ghost" data-a="refresh-files">Re-read the Drive folder</button></div>';
  if (!D.checks.length) h += '<p class="ok">✓ Everything checks out.</p>';
  else h += '<ul class="checks">' + errs.concat(warns).map(function (c) { return '<li class="' + c.level + '"><b>' + (c.level === 'error' ? 'Fix' : 'Note') + '</b> <span class="en">' + esc(c.where) + '</span><span>' + esc(c.msg) + '</span></li>'; }).join('') + '</ul>';
  h += '</div>';
  function list(title, note, items, fn) {
    if (!items.length) return '';
    return '<div class="card"><h3 class="h3">' + title + ' (' + items.length + ')</h3><p class="note">' + note + '</p><ul class="plain">' + items.slice(0, 100).map(fn).join('') + '</ul>' + (items.length > 100 ? '<p class="note">…and ' + (items.length - 100) + ' more.</p>' : '') + '</div>';
  }
  if (f.error) h += '<div class="card"><h3 class="h3">Drive</h3><p class="bad">' + esc(f.error) + '</p></div>';
  h += list('PDFs that match no student', 'The ITS in the file name is not in the students tab. Add the student, or ignore the file.', f.unmatched, function (x) { return '<li><span class="en">' + esc(x.name) + (x.year ? ' · year ' + esc(x.year) : '') + '</span>' + (x.note ? ' <span class="note">' + esc(x.note) + '</span>' : '') + '</li>'; });
  h += list('PDFs with a name the portal cannot read', 'Expected: Student Pdf Copy_[ITS]_TRNO_[TRNO]_[timestamp].pdf. These files are ignored.', f.unparsed, function (x) { return '<li><span class="en">' + esc(typeof x === 'string' ? x : x.name) + '</span></li>'; });
  h += list('Students with more than one PDF', 'The newest timestamp is used.', f.duplicates, function (x) { return '<li>' + esc(x.its) + ' · ' + x.count + ' files · using <span class="en">' + esc(x.using) + '</span></li>'; });
  h += list('TRNO in the file name differs from the sheet', 'Check which one is right.', f.trnoMismatch, function (x) { return '<li>' + esc(x.its) + ' · file ' + esc(x.fileTrno) + ' · sheet ' + esc(x.sheetTrno) + '</li>'; });
  var nopdf = D.students.filter(function (s) { return !s.pdf; });
  h += list('Students with no PDF yet', 'Evaluators see “no PDF found” for these students.', nopdf, function (s) { return '<li>' + esc(s.name) + ' <span class="en">' + esc(s.its) + ' · TRNO ' + esc(s.trno) + (s.year ? ' · ' + esc(s.year) : '') + '</span></li>'; });
  $('#adm-body').innerHTML = h;
}

/* ---------- years: one Drive folder per year ---------- */
function driveLink(id) { return 'https://drive.google.com/drive/folders/' + encodeURIComponent(id); }
function renderYears() {
  var ys = D.years || [], owner = D.settings.owner || 'the dissertations account';
  var h = '<div class="card"><h3 class="h3">Years and their Drive folders</h3>' +
    '<p class="note">Keep each year’s theses in a Drive folder of its own and register the folder here. The portal then reads each student’s PDF from the folder of that student’s year (the <i>year</i> column of the students tab). A student whose year is empty belongs to the current year. Anyone who can add files to the folder can upload; the portal reads them as <span class="en">' + esc(owner) + '</span>, so that account must be able to open the folder.</p>';
  if (!ys.length) h += '<p class="note"><b>No year is registered yet.</b> Until you add one, the single Drive folder from Settings is used for everybody.</p>';
  else {
    h += '<div class="tw"><table class="tb"><thead><tr><th>Year</th><th class="nm">Students</th><th class="nm">With a PDF</th><th class="nm">PDFs in folder</th><th>Folder</th><th></th></tr></thead><tbody>';
    ys.forEach(function (y) {
      var miss = y.students - y.withPdf;
      h += '<tr><td><b>' + esc(y.year) + '</b>' + (y.current ? ' <span class="badge cur">Current</span>' : '') + (y.closed ? ' <span class="badge cls">Closed</span>' : '') + (y.note ? '<br><span class="en">' + esc(y.note) + '</span>' : '') + '</td>' +
        '<td class="nm">' + y.students + '</td><td class="nm ' + (miss ? 'bad' : '') + '">' + y.withPdf + (miss ? '<small> · ' + miss + ' missing</small>' : '') + '</td><td class="nm">' + y.files + '</td>' +
        '<td>' + (y.folder ? '<a href="' + driveLink(y.folder) + '" target="_blank" rel="noopener">Open in Drive ↗</a>' : '<span class="bad">no folder</span>') + (y.error ? '<br><span class="bad en">' + esc(y.error) + '</span>' : '') + '</td>' +
        '<td class="yacts">' + (y.current ? '' : '<button type="button" class="btn sm ghost" data-a="year-current" data-year="' + esc(y.year) + '">Make current</button> ') +
        '<button type="button" class="btn sm ghost" data-a="year-closed" data-year="' + esc(y.year) + '" data-closed="' + (y.closed ? '0' : '1') + '">' + (y.closed ? 'Reopen' : 'Close year') + '</button> ' +
        '<button type="button" class="btn sm ghost" data-a="year-remove" data-year="' + esc(y.year) + '">Remove</button></td></tr>';
    });
    h += '</tbody></table></div>' +
      '<p class="note"><b>Close year</b> makes that year read-only for evaluators (administrators can still edit) and stops reminders for it, so you can set a new deadline for the next year without reopening old marks. <b>Remove</b> only takes the year off this list. Nothing in Drive is deleted.</p>';
  }
  if (D.legacyFolder) h += '<p class="note">The older single folder from Settings is still read as well. Its files fit any year.</p>';
  h += '</div>';
  h += '<div class="card"><h3 class="h3">Add a year, or change its folder</h3>' +
    '<div class="yform"><label>Year<input type="text" id="y-name" dir="ltr" maxlength="20" placeholder="' + esc(String(new Date().getFullYear())) + '" autocomplete="off"></label>' +
    '<label>Drive folder (address or ID)<input type="text" id="y-folder" dir="ltr" placeholder="https://drive.google.com/drive/folders/…" autocomplete="off"></label></div>' +
    '<label class="chk"><input type="checkbox" id="y-cur"' + (ys.length ? '' : ' checked') + '> Make it the current year</label>' +
    '<div class="acts" style="margin-top:10px"><button type="button" class="btn gold" data-a="year-save">Save year</button>' +
    '<button type="button" class="btn ghost" data-a="year-create">Create a new Drive folder for this year</button></div>' +
    '<p class="note">With <b>Create</b> the portal makes a folder named “Maqala <i>year</i>” in the Drive of <span class="en">' + esc(owner) + '</span> and registers it. Open it, share it with whoever uploads the PDFs, and drop the files in. Files must be named like <span class="en">Student Pdf Copy_[ITS]_TRNO_[TRNO]_[timestamp].pdf</span>. After you upload, press <i>Re-read the Drive folder</i> on the Files &amp; checks page, or wait five minutes.</p></div>';
  $('#adm-body').innerHTML = h;
}
async function yearAction(act, b) {
  var year = b.getAttribute('data-year');
  try {
    if (act === 'year-current') { await MQ.api('saveSettings', { currentYear: year }); MQ.toast(year + ' is now the current year.'); }
    else if (act === 'year-closed') {
      var close = b.getAttribute('data-closed') === '1';
      if (close && !(await MQ.confirm('Close year ' + year + '? Evaluators will still be able to open their evaluations but not change marks, and reminders for this year stop. You can reopen it at any time.', 'Close year', true))) return;
      await MQ.api('setYearClosed', { year: year, closed: close }); MQ.toast(year + (close ? ' is closed.' : ' is open again.'));
    } else if (act === 'year-remove') {
      if (!(await MQ.confirm('Remove ' + year + ' from the list? Students of that year will then be looked up in the older single folder from Settings. Nothing in Drive is deleted.', 'Remove', true))) return;
      await MQ.api('removeYear', { year: year }); MQ.toast(year + ' removed from the list.');
    } else if (act === 'year-save' || act === 'year-create') {
      var name = $('#y-name').value.trim(), folder = $('#y-folder').value.trim(), cur = $('#y-cur').checked;
      if (!name) { MQ.toast('Type the year first, for example ' + new Date().getFullYear() + '.', 'bad'); $('#y-name').focus(); return; }
      b.disabled = true;
      if (act === 'year-save') {
        if (!folder) { MQ.toast('Paste the Drive folder address, or press “Create a new Drive folder”.', 'bad'); $('#y-folder').focus(); b.disabled = false; return; }
        var r = await MQ.api('saveYear', { year: name, folder: folder, makeCurrent: cur });
        MQ.toast('Saved: ' + name + ' reads from “' + r.folderName + '”.');
      } else {
        var c = await MQ.api('createYearFolder', { year: name, makeCurrent: cur });
        MQ.modal('<h3 class="h3">Folder created</h3><p>“' + esc(c.folderName) + '” now exists in Drive and is registered for ' + esc(c.year) + '.</p><p><a class="btn gold" href="' + esc(c.url) + '" target="_blank" rel="noopener">Open the folder in Drive ↗</a></p><p class="note">Upload the PDFs there. Share the folder (Drive > Share) with anyone else who uploads. They need to be able to add files, not to edit the portal.</p><div class="mact"><button class="btn ghost" data-close-modal>Done</button></div>');
      }
    }
    await load(true);
  } catch (e) { MQ.toast(e.message, 'bad'); b.disabled = false; }
}

/* ---------- assign evaluators ---------- */
function tLoad() {
  var n = {};
  V.students.forEach(function (st) { st.ev.forEach(function (e) { if (e) n[e] = (n[e] || 0) + 1; }); });
  return n;
}
function teacherOptions(cur, st, load, same) {
  var taken = st ? st.ev.filter(function (e) { return e && e !== cur; }) : [];
  var list = D.teachers.filter(function (t) { return t.active || t.its === cur; });
  if (same && st && st.gender) list = list.filter(function (t) { return !t.gender || t.gender === st.gender || t.its === cur; });
  list = list.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  var h = '<option value="">' + (st ? '— none —' : '— clear the slot —') + '</option>';
  list.forEach(function (t) {
    h += '<option value="' + esc(t.its) + '"' + (t.its === cur ? ' selected' : '') + (taken.indexOf(t.its) >= 0 ? ' disabled' : '') + '>' + esc(t.name || t.its) + esc(tInfo(t)) + ' · ' + (load[t.its] || 0) + ' student' + ((load[t.its] || 0) === 1 ? '' : 's') + '</option>';
  });
  if (cur && !D.teachers.some(function (t) { return t.its === cur; })) h += '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (not in teachers tab)</option>';
  return h;
}
function asgList() {
  var q = asg.q.trim().toLowerCase();
  return V.students.filter(function (st) {
    if (q && (st.name + ' ' + st.its + ' ' + st.trno).toLowerCase().indexOf(q) < 0) return false;
    var n = st.ev.filter(Boolean).length;
    if (asg.st === 'none' && n) return false;
    if (asg.st === 'few' && n >= 2) return false;
    if (asg.st === 'two' && n < 2) return false;
    return true;
  });
}
function renderAssign() {
  var y = activeYear(), hasG = D.teachers.some(function (t) { return t.gender; }) && V.students.some(function (st) { return st.gender; });
  var h = '<div class="card"><div class="rowh"><h3 class="h3">Assign evaluators' + (y ? ' · ' + esc(y) : '') + '</h3><div class="acts">' +
    '<input type="search" id="asq" placeholder="Search name, ITS or TRNO" value="' + esc(asg.q) + '" aria-label="Search students">' +
    '<select id="asf" aria-label="Filter"><option value="all">All students</option><option value="none">No evaluator yet</option><option value="few">Fewer than two evaluators</option><option value="two">Two or more</option></select>' +
    (hasG ? '<label class="chk"><input type="checkbox" id="asg"' + (asg.same ? ' checked' : '') + '> Same gender only</label>' : '') + '</div></div>' +
    '<p class="note">Choose from the teachers tab. Every choice is saved to the students tab at once. The number after each name is how many students that evaluator already has' + (y ? ' in ' + esc(y) : '') + '. Tick students to give them the same evaluator in one go.</p>' +
    '<div class="bulk" id="asbulk"></div><div id="asrows"></div></div>';
  $('#adm-body').innerHTML = h;
  $('#asf').value = asg.st;
  renderBulk(); renderAsgRows();
}
function renderBulk() {
  var n = Object.keys(asg.sel).length, load = tLoad();
  $('#asbulk').innerHTML = '<span><b>' + n + '</b> selected</span>' +
    '<label>Slot<select id="bk-slot"><option value="1">Evaluator 1</option><option value="2">Evaluator 2</option><option value="3">Evaluator 3</option></select></label>' +
    '<label class="grow">Evaluator<select id="bk-ev">' + teacherOptions(null, null, load, false) + '</select></label>' +
    '<button type="button" class="btn gold" data-a="assign-apply"' + (n ? '' : ' disabled') + '>Apply to selected</button>' +
    '<button type="button" class="btn ghost" data-a="assign-all">Select all matching (' + asgList().length + ')</button>' +
    '<button type="button" class="btn ghost" data-a="assign-none"' + (n ? '' : ' disabled') + '>Clear selection</button>';
}
function renderAsgRows() {
  var list = asgList(), shown = list.slice(0, asg.limit), load = tLoad(), showYear = !activeYear();
  var h = '<div class="tw"><table class="tb"><thead><tr><th></th><th>Student</th><th>Evaluator 1</th><th>Evaluator 2</th><th>Evaluator 3</th></tr></thead><tbody>';
  shown.forEach(function (st) {
    h += '<tr class="asrow"><td><input type="checkbox" data-sel="' + esc(st.its) + '"' + (asg.sel[st.its] ? ' checked' : '') + ' aria-label="Select ' + esc(st.name || st.its) + '"></td>' +
      '<td><b dir="auto">' + esc(st.name || '—') + '</b><br><span class="en">' + esc(st.its) + (st.trno ? ' · TRNO ' + esc(st.trno) : '') + (showYear && st.year ? ' · ' + esc(st.year) : '') + (st.gender ? ' · ' + (st.gender === 'F' ? 'female' : 'male') : '') + (st.age ? ' · ' + esc(st.age) + 'y' : '') + '</span></td>';
    [1, 2, 3].forEach(function (slot) {
      var cur = st.ev[slot - 1] || '';
      h += '<td><select data-slot="' + slot + '" data-its="' + esc(st.its) + '" aria-label="Evaluator ' + slot + ' for ' + esc(st.name || st.its) + '">' + teacherOptions(cur, st, load, asg.same) + '</select></td>';
    });
    h += '</tr>';
  });
  if (!shown.length) h += '<tr><td colspan="5" class="empty">No student matches.</td></tr>';
  h += '</tbody></table></div>';
  if (list.length > shown.length) h += '<p class="note">Showing ' + shown.length + ' of ' + list.length + '. <button type="button" class="btn sm ghost" data-a="assign-more">Show 50 more</button> or search to narrow the list.</p>';
  $('#asrows').innerHTML = h;
}
async function assignOne(sel) {
  var its = sel.getAttribute('data-its'), slot = +sel.getAttribute('data-slot'), val = sel.value;
  try {
    await MQ.api('setAssignment', { studentIts: its, slot: slot, teacherIts: val });
    var st = D.students.filter(function (x) { return x.its === its; })[0]; if (st) st.ev[slot - 1] = val;
    MQ.toast('Saved.');
  } catch (e) { MQ.toast(e.message, 'bad'); }
  renderBulk(); renderAsgRows();
}
async function assignBulk(b) {
  var ids = Object.keys(asg.sel), slot = +$('#bk-slot').value, ev = $('#bk-ev').value;
  if (!ids.length) return;
  var who = ev ? (derived.tBy[ev] ? derived.tBy[ev].name : ev) : null;
  if (!(await MQ.confirm(who ? 'Make ' + who + ' evaluator ' + slot + ' for ' + ids.length + ' student' + (ids.length === 1 ? '' : 's') + '?' : 'Clear evaluator ' + slot + ' for ' + ids.length + ' student' + (ids.length === 1 ? '' : 's') + '?', 'Apply', !who))) return;
  b.disabled = true;
  try {
    var r = await MQ.api('setAssignments', { slot: slot, teacherIts: ev, studentIts: ids });
    asg.sel = {};
    await load(true);
    MQ.toast(r.changed + ' changed' + (r.unchanged ? ', ' + r.unchanged + ' already set' : '') + (r.skipped.length ? ', ' + r.skipped.length + ' skipped' : '') + '.');
    if (r.skipped.length) MQ.modal('<h3 class="h3">Not changed: ' + r.skipped.length + '</h3><ul class="plain">' + r.skipped.map(function (x) { return '<li>' + esc(x.name || x.its) + ' <span class="bad">' + esc(x.reason) + '</span></li>'; }).join('') + '</ul><div class="mact"><button class="btn gold" data-close-modal>Close</button></div>');
  } catch (e) { MQ.toast(e.message, 'bad'); b.disabled = false; }
}

/* ---------- settings ---------- */
function tzMs(ms, tz) {
  var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }), p = {};
  f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
function wallToMs(local, tz) {          // 'yyyy-MM-ddTHH:mm' written in the script's time zone -> real instant
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local); if (!m) return NaN;
  var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  var ms = guess - (tzMs(guess, tz) - guess);
  return guess - (tzMs(ms, tz) - ms);
}
function renderSettings() {
  var s = D.settings, dl = s.deadline;
  var h = '<form id="setform" class="card" autocomplete="off">' +
    '<h3 class="h3">Deadline for marking</h3><p class="note">Until this moment evaluators can change their marks. After it, their forms lock. Administrators can still edit. Time zone: <b>' + esc(s.tz) + '</b> (set in the Apps Script project).</p>' +
    '<div class="frow"><input type="datetime-local" id="s-dl" value="' + (dl ? esc(dl.text.replace(' ', 'T')) : '') + '" aria-label="Deadline"><button type="button" class="btn ghost" id="s-dl-clear">No deadline</button></div>' +
    '<h3 class="h3 sp">Administrators</h3><p class="note">These accounts see the dashboard and can edit anything. One email per line or separated by commas. The Google account that deployed the web app (<span class="en">' + esc(s.owner || '') + '</span>) is always an administrator and is not listed here. You can also set <i>role = admin</i> for a teacher in the teachers tab.</p>' +
    '<textarea id="s-admins" rows="4" dir="ltr" spellcheck="false">' + esc((s.adminEmails || []).join('\n')) + '</textarea>' +
    '<h3 class="h3 sp">Portal address</h3><p class="note">The GitHub Pages address, used for the link in reminder emails.</p><input type="url" id="s-portal" dir="ltr" value="' + esc(s.portalUrl || '') + '" placeholder="https://yourname.github.io/maqala/">' +
    '<h3 class="h3 sp">Reminder email</h3><p class="note">Reminders use the Jamea Saifiyah email layout. For the campus picture at the top, upload it to the same GitHub repository (for example as <i>email-banner.jpg</i>) and paste its web address here. Leave it blank for a plain navy banner. Save first, then send yourself a test.</p><input type="url" id="s-banner" dir="ltr" value="' + esc(s.emailBannerUrl || '') + '" placeholder="https://yourname.github.io/maqala/email-banner.jpg"><div class="acts" style="margin-top:10px"><button type="button" class="btn ghost" id="s-test">Send me a test email</button></div>' +
    '<h3 class="h3 sp">Older single Drive folder</h3><p class="note">Only needed if all your PDFs are in one folder. For one folder per year use the <a href="#/admin/years">Years</a> page. Paste the folder ID (the last part of its address) or the whole address.</p><input type="text" id="s-folder" dir="ltr" value="' + esc(s.driveFolder || '') + '" placeholder="1AbCdEfGh…">' +
    '<h3 class="h3 sp">Disagreement limit</h3><p class="note">Flag a student when two evaluators’ totals differ by at least this many marks.</p><input type="number" id="s-th" min="1" max="100" value="' + esc(s.threshold) + '" style="max-width:120px">' +
    '<div class="actbar"><button type="submit" class="btn gold">Save settings</button></div></form>';
  $('#adm-body').innerHTML = h;
  $('#s-dl-clear').onclick = function () { $('#s-dl').value = ''; };
  $('#s-test').onclick = async function () {
    var b = this; b.disabled = true;
    try { var r = await MQ.api('testEmail'); MQ.toast('A test email was sent to ' + r.to + '.'); }
    catch (e) { MQ.toast(e.message, 'bad'); }
    b.disabled = false;
  };
  $('#setform').onsubmit = async function (e) {
    e.preventDefault();
    var body = { adminEmails: $('#s-admins').value, portalUrl: $('#s-portal').value.trim(), emailBannerUrl: $('#s-banner').value.trim(), driveFolder: $('#s-folder').value.trim(), threshold: $('#s-th').value };
    var v = $('#s-dl').value;
    if (v) { var ms = wallToMs(v, s.tz); if (isNaN(ms)) { MQ.toast('That deadline is not a valid date and time.', 'bad'); return; } body.deadlineIso = new Date(ms).toISOString(); }
    else body.deadlineIso = '';
    var btn = $('#setform button[type=submit]'); btn.disabled = true;
    try { D.settings = await MQ.api('saveSettings', body); MQ.toast('Settings saved.'); await load(true); }
    catch (err) { MQ.toast(err.message, 'bad'); }
    btn.disabled = false;
  };
}

/* ---------- student report ---------- */
async function openReport(its) {
  var b = MQ.modal('<p class="en">Loading…</p>', { wide: true });
  try {
    var r = await MQ.api('studentReport', { studentIts: its });
    renderReport(r);
  } catch (e) { b.innerHTML = '<p class="bad">' + esc(e.message) + '</p><div class="mact"><button class="btn ghost" data-close-modal>Close</button></div>'; }
}
function renderReport(r) {
  var s = r.student, tBy = derived.tBy;
  var h = '<div class="rep"><div class="rowh"><div><h2 dir="auto">' + esc(s.name) + '</h2><p class="en">ITS ' + esc(s.its) + ' · TRNO ' + esc(s.trno || '–') + (s.year ? ' · year ' + esc(s.year) : '') + (s.gender ? ' · ' + (s.gender === 'F' ? 'female' : 'male') : '') + (s.age ? ' · ' + esc(s.age) + ' years' : '') + (s.mobile ? ' · ' + esc(s.mobile) : '') + (r.pdf ? ' · ' + esc(r.pdf) : ' · no PDF found') + '</p></div><button type="button" class="btn ghost" data-close-modal>Close</button></div>';
  if (s.topic) h += '<p dir="auto" class="rtopic">' + esc(s.topic) + '</p>';
  h += '<h3 class="h3 sp">Evaluators</h3><p class="note">Change who evaluates this student. The change is written to the students tab.</p><div class="slots">';
  [1, 2, 3].forEach(function (slot) {
    var cur = s.ev[slot - 1] || '';
    h += '<label>Evaluator ' + slot + '<select data-slot="' + slot + '" data-its="' + esc(s.its) + '"><option value="">— none —</option>' + D.teachers.filter(function (t) { return t.active || t.its === cur; }).map(function (t) { return '<option value="' + esc(t.its) + '"' + (t.its === cur ? ' selected' : '') + '>' + esc(t.name) + ' · ' + esc(t.its) + esc(tInfo(t)) + '</option>'; }).join('') + (cur && !tBy[cur] ? '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (not in teachers tab)</option>' : '') + '</select></label>';
  });
  h += '</div>';
  var evs = r.evaluations;
  var assigned = s.ev.filter(Boolean);
  h += '<h3 class="h3 sp">Marks side by side</h3>';
  if (!evs.length) h += '<p class="note">No evaluator has started yet.</p>';
  else {
    h += '<div class="tw"><table class="tb cmp"><thead><tr><th>Criterion</th>' + evs.map(function (e) { return '<th class="nm">' + esc(e.name || e.evaluatorIts) + '<br>' + chip(e.status === 'complete' ? 'complete' : 'in_progress') + '</th>'; }).join('') + (evs.length > 1 ? '<th class="nm">Average</th>' : '') + '</tr></thead><tbody>';
    SECTIONS.forEach(function (sec) {
      h += '<tr class="srow"><th colspan="' + (evs.length + 1 + (evs.length > 1 ? 1 : 0)) + '">' + sec.ar + ' <span class="en">' + sec.en + '</span></th></tr>';
      CRIT.forEach(function (c, i) {
        if (c.sec !== sec.id) return;
        var vals = evs.map(function (e) { return e.data.marks[c.id]; });
        var nums = vals.filter(function (v) { return v != null; });
        h += '<tr><td><span class="en">' + c.n + '</span> ' + esc(c.ar) + '</td>' + evs.map(function (e, k) { return '<td class="nm">' + (vals[k] == null ? '–' : '<b>' + vals[k] + '</b> <span class="gl g' + ('ABCD'.indexOf(e.grades[i] || 'D') + 1) + '">' + esc(e.grades[i]) + '</span>') + '<small>/' + c.max + '</small></td>'; }).join('') + (evs.length > 1 ? '<td class="nm">' + (nums.length ? f1(avg(nums)) : '–') + '</td>' : '') + '</tr>';
      });
    });
    h += '<tr class="trow"><th>Total</th>' + evs.map(function (e) { return '<td class="nm">' + e.totals.t + '<small>/100</small></td>'; }).join('') + (evs.length > 1 ? '<td class="nm">' + f1(avg(evs.map(function (e) { return e.totals.t; }))) + '</td>' : '') + '</tr></tbody></table></div>';
    evs.forEach(function (e) {
      var d = e.data, parts = [['المنهجية · Methodology', d.sec.m], ['المضمون · Content', d.sec.c], ['اللغة والشكليات · Language and form', d.sec.f], ['تعليقات عامة · Overall', d.comment]].filter(function (p) { return (p[1] || '').trim(); });
      h += '<div class="evrep"><h4>' + esc(e.name || e.evaluatorIts) + ' <span class="en">' + esc(e.email || '') + ' · saved ' + esc(e.savedAt) + (e.submittedAt ? ' · submitted ' + esc(e.submittedAt) : '') + '</span></h4>' +
        (d.topic ? '<p class="note">Topic written by evaluator: <span dir="auto">' + esc(d.topic) + '</span></p>' : '') +
        (parts.length ? parts.map(function (p) { return '<h5>' + p[0] + '</h5><p class="cmt" dir="auto">' + esc(p[1]) + '</p>'; }).join('') : '<p class="note">No comments written.</p>') + '</div>';
    });
  }
  h += '<h3 class="h3 sp">Open the PDF</h3><p class="note">Opens the thesis with the evaluator’s form so you can read, or mark on their behalf.</p><div class="acts">' +
    assigned.map(function (its) { return '<a class="btn ghost" href="#/eval/' + esc(s.its) + '/' + esc(its) + '" data-close-modal>' + esc(tBy[its] ? tBy[its].name : its) + '</a>'; }).join('') + (assigned.length ? '' : '<span class="note">No evaluator is assigned.</span>') + '</div></div>';
  var body = $('#modal .mbody'); body.innerHTML = h;
  $$('select[data-slot]', body).forEach(function (sel) {
    sel.onchange = async function () {
      try {
        await MQ.api('setAssignment', { studentIts: sel.getAttribute('data-its'), slot: +sel.getAttribute('data-slot'), teacherIts: sel.value });
        MQ.toast('Assignment saved.');
        await load(true); openReport(sel.getAttribute('data-its'));
      } catch (e) { MQ.toast(e.message, 'bad'); openReport(sel.getAttribute('data-its')); }
    };
  });
}

/* ---------- notify + CSV ---------- */
async function notify(its) {
  var pend = pendingEvaluators(), names = Object.keys(pend).filter(function (k) { return !its || k === its; });
  if (!names.length) { MQ.toast('Nothing pending.'); return; }
  var who = its ? (derived.tBy[its] ? derived.tBy[its].name : its) : names.length + ' evaluator' + (names.length === 1 ? '' : 's');
  if (!(await MQ.confirm('Send a reminder email to ' + who + '? Each email lists that evaluator’s pending students and the deadline.', 'Send', false))) return;
  var b = MQ.modal('<p class="en">Sending…</p>');
  try {
    var ay = activeYear(), r = await MQ.api('notify', its ? { evaluatorIts: its, year: ay } : { year: ay });
    var h = '<h3 class="h3">Reminders sent: ' + r.sent.length + '</h3>' + (r.sent.length ? '<ul class="plain">' + r.sent.map(function (x) { return '<li>' + esc(x.name) + ' <span class="en">' + esc(x.email) + ' · ' + x.count + ' pending</span></li>'; }).join('') + '</ul>' : '');
    if (r.skipped.length) h += '<h3 class="h3 sp">Not sent: ' + r.skipped.length + '</h3><ul class="plain">' + r.skipped.map(function (x) { return '<li>' + esc(x.name || x.its) + ' <span class="bad">' + esc(x.reason) + '</span></li>'; }).join('') + '</ul>';
    b.innerHTML = h + '<div class="mact"><button class="btn gold" data-close-modal>Done</button></div>';
  } catch (e) { b.innerHTML = '<p class="bad">' + esc(e.message) + '</p><div class="mact"><button class="btn ghost" data-close-modal>Close</button></div>'; }
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCsv() {
  var head = ['year', 'student_its', 'trno', 'student_name', 'evaluator_its', 'evaluator_name', 'status'].concat(CRIT.map(function (c) { return 'c' + c.n; }), ['methodology', 'content', 'language', 'total', 'last_saved']);
  var lines = [head.join(',')];
  derived.list.forEach(function (a) {
    var r = a.r;
    lines.push([a.s.year, a.s.its, a.s.trno, a.s.name, a.ev, a.t ? a.t.name : '', a.st].concat(CRIT.map(function (c, i) { return r && r.marks[i] != null ? r.marks[i] : ''; }), r ? [r.t.m, r.t.c, r.t.f, r.t.t, r.saved] : ['', '', '', '', '']).map(csvCell).join(','));
  });
  var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'maqala-results-' + (activeYear() ? activeYear() + '-' : '') + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- shell ---------- */
function drawSub() {
  $$('#adm-tabs a').forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('data-sub') === sub ? 'page' : 'false'); });
  if (!D) return;
  makeView(); drawYearPick();
  derived = derive();
  ({ progress: renderProgress, analysis: renderAnalysis, years: renderYears, assign: renderAssign, files: renderFiles, settings: renderSettings })[sub]();
}
async function load(quiet) {
  if (!quiet) $('#adm-body').innerHTML = '<div class="pst"><div class="spin"></div><p class="en">Loading the dashboard…</p></div>';
  try { D = await MQ.api('dashboard'); loadedAt = Date.now(); MQ.skew = D.serverNow - Date.now(); drawSub(); $('#adm-time').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch (e) { $('#adm-body').innerHTML = '<div class="card"><p class="bad">' + esc(e.message) + '</p><button type="button" class="btn gold" data-a="reload">Try again</button></div>'; }
}
var mounted = false;
function mount() {
  if (mounted) return; mounted = true;
  $('#adm-tabs').innerHTML = SUBS.map(function (s) { return '<a href="#/admin/' + s[0] + '" data-sub="' + s[0] + '">' + s[1] + '</a>'; }).join('');
  $('#admin').addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.getAttribute('data-a');
    if (a === 'notify-all') notify(''); else if (a === 'notify') notify(b.getAttribute('data-its'));
    else if (a === 'report') openReport(b.getAttribute('data-its'));
    else if (a === 'csv') exportCsv();
    else if (/^year-/.test(a)) yearAction(a, b);
    else if (a === 'assign-apply') assignBulk(b);
    else if (a === 'assign-all') { asgList().forEach(function (st) { asg.sel[st.its] = true; }); renderBulk(); renderAsgRows(); }
    else if (a === 'assign-none') { asg.sel = {}; renderBulk(); renderAsgRows(); }
    else if (a === 'assign-more') { asg.limit += 50; renderAsgRows(); }
    else if (a === 'reload') load();
    else if (a === 'refresh-files') { b.disabled = true; MQ.api('refreshFiles').then(function (d) { D = d; drawSub(); MQ.toast('Folder re-read.'); }, function (err) { MQ.toast(err.message, 'bad'); b.disabled = false; }); }
  });
  $('#admin').addEventListener('input', function (e) {
    if (e.target.id === 'stq') { filter.q = e.target.value; renderStudents(); }
    else if (e.target.id === 'asq') { asg.q = e.target.value; asg.limit = 50; renderBulk(); renderAsgRows(); }
  });
  $('#admin').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'stf') { filter.st = t.value; renderStudents(); }
    else if (t.id === 'asf') { asg.st = t.value; asg.limit = 50; renderBulk(); renderAsgRows(); }
    else if (t.id === 'asg') { asg.same = t.checked; renderAsgRows(); }
    else if (t.id === 'adm-year') { yearSel = t.value; MQ.lsSet('mq.admyear', yearSel); asg.sel = {}; asg.limit = 50; drawSub(); }
    else if (t.matches && t.matches('select[data-slot][data-its]') && $('#asrows').contains(t)) assignOne(t);
    else if (t.matches && t.matches('input[data-sel]')) { if (t.checked) asg.sel[t.getAttribute('data-sel')] = true; else delete asg.sel[t.getAttribute('data-sel')]; renderBulk(); }
  });
  $('#adm-refresh').addEventListener('click', function () { load(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !$('#admin').hidden && Date.now() - loadedAt > 60000 && ['settings', 'years', 'assign'].indexOf(sub) < 0) load(true); });
}
MQ.admin = {
  show: function (s) {
    mount();
    sub = SUBS.some(function (x) { return x[0] === s; }) ? s : 'progress';
    if (D && Date.now() - loadedAt < 120000) drawSub(); else load(!!D);
  },
  refresh: function () { return load(true); }
};
})();
