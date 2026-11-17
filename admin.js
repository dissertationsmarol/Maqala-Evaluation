/* Dissertations office dashboard: progress, analysis, files and checks, settings. */
(function () {
'use strict';
var MQ = window.MQ, $ = MQ.$, $$ = MQ.$$, esc = MQ.esc;
var D = null, loadedAt = 0, sub = 'progress', derived = null, filter = { q: '', st: 'all' };
var SUBS = [['progress', 'Progress'], ['analysis', 'Analysis'], ['files', 'Files & checks'], ['settings', 'Settings']];

/* ---------- derived numbers ---------- */
function derive() {
  var rowBy = {};
  D.rows.forEach(function (r) { rowBy[r.its + '|' + r.ev] = r; });
  var tBy = {}; D.teachers.forEach(function (t) { tBy[t.its] = t; });
  var list = [];
  D.students.forEach(function (s) {
    s.ev.forEach(function (ev, i) {
      if (!ev) return;
      var r = rowBy[s.its + '|' + ev] || null;
      list.push({ s: s, ev: ev, slot: i + 1, t: tBy[ev] || null, r: r, st: r ? (r.status === 'complete' ? 'complete' : 'in_progress') : 'not_started' });
    });
  });
  var done = list.filter(function (a) { return a.st === 'complete'; });
  var byStu = {};
  list.forEach(function (a) { (byStu[a.s.its] = byStu[a.s.its] || []).push(a); });
  var fully = D.students.filter(function (s) { var l = byStu[s.its]; return l && l.length && l.every(function (a) { return a.st === 'complete'; }); }).length;
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
    tile('Students', D.students.length, derived.fully + ' fully evaluated') +
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
    h += '<tr><td><b>' + esc(e.t ? e.t.name : 'Unknown') + '</b><br><span class="en">' + esc(e.its) + (e.t ? ' · ' + esc(e.t.email) : ' · not in teachers tab') + '</span></td><td class="nm">' + e.n + '</td><td class="nm">' + e.c + '</td><td class="nm">' + e.p + '</td><td class="nm">' + e.z + '</td><td class="en">' + esc(e.saved || '–') + '</td><td>' +
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
  D.students.forEach(function (s) {
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
    h += '<tr><td><b dir="auto">' + esc(s.name || '—') + '</b><br><span class="en">' + esc(s.its) + '</span></td><td class="en">' + esc(s.trno || '–') + '</td>' +
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
  D.students.forEach(function (s) {
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
  h += list('PDFs that match no student', 'The ITS in the file name is not in the students tab. Add the student, or ignore the file.', f.unmatched, function (x) { return '<li><span class="en">' + esc(x.name) + '</span></li>'; });
  h += list('PDFs with a name the portal cannot read', 'Expected: Student Pdf Copy_[ITS]_TRNO_[TRNO]_[timestamp].pdf. These files are ignored.', f.unparsed, function (x) { return '<li><span class="en">' + esc(typeof x === 'string' ? x : x.name) + '</span></li>'; });
  h += list('Students with more than one PDF', 'The newest timestamp is used.', f.duplicates, function (x) { return '<li>' + esc(x.its) + ' · ' + x.count + ' files · using <span class="en">' + esc(x.using) + '</span></li>'; });
  h += list('TRNO in the file name differs from the sheet', 'Check which one is right.', f.trnoMismatch, function (x) { return '<li>' + esc(x.its) + ' · file ' + esc(x.fileTrno) + ' · sheet ' + esc(x.sheetTrno) + '</li>'; });
  var nopdf = D.students.filter(function (s) { return !s.pdf; });
  h += list('Students with no PDF yet', 'Evaluators see “no PDF found” for these students.', nopdf, function (s) { return '<li>' + esc(s.name) + ' <span class="en">' + esc(s.its) + ' · TRNO ' + esc(s.trno) + '</span></li>'; });
  $('#adm-body').innerHTML = h;
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
    '<h3 class="h3 sp">Drive folder</h3><p class="note">The folder that holds the thesis PDFs. Paste the folder ID (the last part of its address) or the whole address.</p><input type="text" id="s-folder" dir="ltr" value="' + esc(s.driveFolder || '') + '" placeholder="1AbCdEfGh…">' +
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
  var h = '<div class="rep"><div class="rowh"><div><h2 dir="auto">' + esc(s.name) + '</h2><p class="en">ITS ' + esc(s.its) + ' · TRNO ' + esc(s.trno || '–') + (r.pdf ? ' · ' + esc(r.pdf) : ' · no PDF found') + '</p></div><button type="button" class="btn ghost" data-close-modal>Close</button></div>';
  if (s.topic) h += '<p dir="auto" class="rtopic">' + esc(s.topic) + '</p>';
  h += '<h3 class="h3 sp">Evaluators</h3><p class="note">Change who evaluates this student. The change is written to the students tab.</p><div class="slots">';
  [1, 2, 3].forEach(function (slot) {
    var cur = s.ev[slot - 1] || '';
    h += '<label>Evaluator ' + slot + '<select data-slot="' + slot + '" data-its="' + esc(s.its) + '"><option value="">— none —</option>' + D.teachers.filter(function (t) { return t.active || t.its === cur; }).map(function (t) { return '<option value="' + esc(t.its) + '"' + (t.its === cur ? ' selected' : '') + '>' + esc(t.name) + ' · ' + esc(t.its) + '</option>'; }).join('') + (cur && !tBy[cur] ? '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (not in teachers tab)</option>' : '') + '</select></label>';
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
    var r = await MQ.api('notify', its ? { evaluatorIts: its } : {});
    var h = '<h3 class="h3">Reminders sent: ' + r.sent.length + '</h3>' + (r.sent.length ? '<ul class="plain">' + r.sent.map(function (x) { return '<li>' + esc(x.name) + ' <span class="en">' + esc(x.email) + ' · ' + x.count + ' pending</span></li>'; }).join('') + '</ul>' : '');
    if (r.skipped.length) h += '<h3 class="h3 sp">Not sent: ' + r.skipped.length + '</h3><ul class="plain">' + r.skipped.map(function (x) { return '<li>' + esc(x.name || x.its) + ' <span class="bad">' + esc(x.reason) + '</span></li>'; }).join('') + '</ul>';
    b.innerHTML = h + '<div class="mact"><button class="btn gold" data-close-modal>Done</button></div>';
  } catch (e) { b.innerHTML = '<p class="bad">' + esc(e.message) + '</p><div class="mact"><button class="btn ghost" data-close-modal>Close</button></div>'; }
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCsv() {
  var head = ['student_its', 'trno', 'student_name', 'evaluator_its', 'evaluator_name', 'status'].concat(CRIT.map(function (c) { return 'c' + c.n; }), ['methodology', 'content', 'language', 'total', 'last_saved']);
  var lines = [head.join(',')];
  derived.list.forEach(function (a) {
    var r = a.r;
    lines.push([a.s.its, a.s.trno, a.s.name, a.ev, a.t ? a.t.name : '', a.st].concat(CRIT.map(function (c, i) { return r && r.marks[i] != null ? r.marks[i] : ''; }), r ? [r.t.m, r.t.c, r.t.f, r.t.t, r.saved] : ['', '', '', '', '']).map(csvCell).join(','));
  });
  var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'maqala-results-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- shell ---------- */
function drawSub() {
  $$('#adm-tabs a').forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('data-sub') === sub ? 'page' : 'false'); });
  if (!D) return;
  derived = derive();
  ({ progress: renderProgress, analysis: renderAnalysis, files: renderFiles, settings: renderSettings })[sub]();
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
    else if (a === 'reload') load();
    else if (a === 'refresh-files') { b.disabled = true; MQ.api('refreshFiles').then(function (d) { D = d; drawSub(); MQ.toast('Folder re-read.'); }, function (err) { MQ.toast(err.message, 'bad'); b.disabled = false; }); }
  });
  $('#admin').addEventListener('input', function (e) { if (e.target.id === 'stq') { filter.q = e.target.value; renderStudents(); } });
  $('#admin').addEventListener('change', function (e) { if (e.target.id === 'stf') { filter.st = e.target.value; renderStudents(); } });
  $('#adm-refresh').addEventListener('click', function () { load(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !$('#admin').hidden && Date.now() - loadedAt > 60000 && sub !== 'settings') load(true); });
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
