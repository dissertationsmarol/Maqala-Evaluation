(window.MQ_BUILD = window.MQ_BUILD || {}).app = '2026-11-19c';
/* Start-up, routing, the evaluator's home page. */
/* All site files must be from the same build. A half-updated GitHub folder (or a cached old file) would otherwise crash with a
   cryptic "is not a function" message, so say plainly which file is old. Uses only plain DOM calls on purpose. */
(function () {
  var b = window.MQ_BUILD || {}, want = b.app, old = [];
  ['rubric', 'core', 'form', 'reader', 'admin'].forEach(function (f) { if (b[f] !== want) old.push(f + '.js'); });
  if (!old.length) return;
  window.MQ_STALE = true;
  var d = document.createElement('div');
  d.setAttribute('role', 'alert'); d.setAttribute('dir', 'ltr'); d.id = 'stale-files';
  d.style.cssText = 'position:relative;z-index:99999;margin:0;padding:18px 22px;background:#7a1c2a;color:#fff;font:17px/1.5 Arial,sans-serif';
  d.textContent = 'The website files are not all from the same version. Out of date or missing: ' + old.join(', ') +
    '. Upload every file from the site folder to GitHub (replace the old ones), wait a minute, then reload this page with Ctrl+Shift+R.';
  document.body.insertBefore(d, document.body.firstChild);
})();
(function () {
'use strict';
if (window.MQ_STALE) return;
var MQ = window.MQ, $ = MQ.$, $$ = MQ.$$, esc = MQ.esc;
var current = '';           // home | admin | reader
var lastPlain = '';         // last non-reader address, for the Back button

function show(v) {
  current = v;
  ['home', 'admin', 'reader'].forEach(function (id) { $('#' + id).hidden = id !== v; });
  $('#appbar').hidden = v === 'reader';
  document.body.classList.toggle('in-reader', v === 'reader');
  window.scrollTo(0, 0);
}

/* ---------- top bar ---------- */
function setNav() {
  var u = MQ.session.user, links = [];
  if (u.isAdmin) links.push(['#/admin', 'Dashboard', 'admin']);
  if (u.teacher) links.push([u.isAdmin ? '#/mine' : '#/', 'My evaluations', 'home']);
  $('#nav').innerHTML = links.map(function (l) { return '<a href="' + l[0] + '" data-v="' + l[2] + '">' + l[1] + '</a>'; }).join('');
  // an administrator who also evaluates: remember which of the two pages they last chose
  if (u.isAdmin && u.teacher) $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { MQ.lsSet('mq.land.' + u.email, a.getAttribute('data-v') === 'admin' ? 'admin' : 'mine'); }); });
  $('#who-name').textContent = u.name || u.email;
  $('#who-role').textContent = u.isAdmin ? 'Administrator' : 'Evaluator';
  $('#who-mail').textContent = u.email;
}
function markNav() { $$('#nav a').forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('data-v') === current ? 'page' : 'false'); }); }

/* ---------- evaluator home ---------- */
var STATUS = { complete: ['Submitted', 'مُرسَل'], in_progress: ['In progress', 'قيد العمل'], not_started: ['Not started', 'لم يبدأ'] };
var homeData = null, homeYear = '';
async function renderHome() {
  var box = $('#home-body');
  box.innerHTML = '<div class="pst"><div class="spin"></div><p class="en">Loading your evaluations…</p></div>';
  try { homeData = await MQ.api('assignments'); }
  catch (e) { box.innerHTML = '<div class="card"><p class="bad">' + esc(e.message) + '</p><button type="button" class="btn gold" id="home-retry">Try again</button></div>'; $('#home-retry').onclick = renderHome; return; }
  MQ.skew = homeData.serverNow - Date.now();
  if (!homeYear) homeYear = homeData.currentYear || '*';
  drawHome();
}
function drawHome() {
  var box = $('#home-body'), r = homeData;
  var years = [];
  r.assignments.forEach(function (x) { if (x.year && years.indexOf(x.year) < 0) years.push(x.year); });
  years.sort().reverse();
  var pick = years.length > 1;
  if (pick && homeYear !== '*' && years.indexOf(homeYear) < 0) homeYear = '*';
  var a = pick && homeYear !== '*' ? r.assignments.filter(function (x) { return x.year === homeYear; }) : r.assignments;
  var done = a.filter(function (x) { return x.status === 'complete'; }).length;
  var h = '<div class="hhead"><div><h2>تقييماتي</h2><p class="en">My evaluations</p></div>';
  if (r.deadline) {
    var tl = MQ.timeLeft(r.deadline.ms);
    h += '<div class="dlchip ' + (r.locked ? 'over' : tl.urgent ? 'urgent' : '') + '">' + (r.locked ? 'Locked · ' : 'Deadline ') + esc(r.deadline.text) + (r.locked ? '' : ' · ' + esc(tl.text)) + '</div>';
  } else h += '<div class="dlchip">No deadline set</div>';
  h += '</div>';
  if (r.locked) h += '<div class="banner bad">The deadline has passed. You can open your evaluations to read them, but marks can no longer be changed.</div>';
  if (pick) h += '<label class="homeyear" dir="ltr">Year <select id="home-year" aria-label="Year"><option value="*">All years</option>' + years.map(function (y) { return '<option value="' + esc(y) + '">' + esc(y) + (y === r.currentYear ? ' (current)' : '') + '</option>'; }).join('') + '</select></label>';
  if (!a.length) {
    h += '<div class="card"><p>No student has been assigned to you yet' + (pick && homeYear !== '*' ? ' for ' + esc(homeYear) : '') + '.</p><p class="en">If you expected to see students here, please contact the dissertations office.</p></div>';
  } else {
    h += '<p class="summ" dir="ltr"><b>' + done + '</b> of <b>' + a.length + '</b> submitted</p><div class="alist">';
    a.forEach(function (x) {
      var st = STATUS[x.status] || STATUS.not_started;
      var nm = esc(x.name || ('ITS ' + x.its));
      h += '<div class="acard ' + x.status + '" data-its="' + esc(x.its) + '"><div class="ahead"><h3 dir="auto">' + esc(x.name || ('ITS ' + x.its)) + '</h3><span class="stc ' + x.status + '">' + st[0] + '</span></div>' +
        '<p class="en">ITS ' + esc(x.its) + (x.trno ? ' · TRNO ' + esc(x.trno) : '') + (pick && x.year ? ' · <span class="yrchip">' + esc(x.year) + '</span>' : '') + (x.lockReason === 'closed' ? ' · <span class="yrchip cls">Closed</span>' : '') + (x.slot === 6 ? ' · <span class="yrchip idr">Idara evaluator</span>' : '') + '</p>' +
        (x.takhassus ? '<p class="tkrow">' + MQ.tkChip(x.takhassus) + '</p>' : '') +
        (x.topic ? '<p class="atopic" dir="auto">' + esc(x.topic) + '</p>' : '<p class="atopic none">Topic not entered yet</p>') +
        '<div class="ameta"><span dir="ltr">' + x.marks + ' of 10 marked' + (x.marks ? ' · total <b>' + x.total + '</b>' : '') + '</span><span dir="ltr" class="' + (x.hasPdf ? 'ok' : 'bad') + '">' + (x.hasPdf ? 'PDF ready' : 'No PDF yet') + '</span></div>' +
        '<div class="pbar" aria-hidden="true"><i style="width:' + x.marks * 10 + '%"></i></div>' +
        (x.savedAt ? '<p class="en saved">Saved ' + esc(x.savedAt) + '</p>' : '') +
        '<div class="aacts"><a class="btn gold go-pdf" href="#/eval/' + esc(x.its) + '" aria-label="Read the PDF and mark: ' + nm + '"><span class="bl"><span aria-hidden="true">📄</span> قراءة المقالة</span><span class="en">Read PDF</span></a>' +
        '<a class="btn ghost go-marks" href="#/marks/' + esc(x.its) + '" aria-label="Marks entry only, without the PDF: ' + nm + '"><span class="bl"><span aria-hidden="true">✎</span> إدخال الدرجات</span><span class="en">Marks entry only</span></a></div></div>';
    });
    h += '</div>';
  }
  box.innerHTML = h;
  var ys = $('#home-year'); if (ys) { ys.value = homeYear; ys.onchange = function () { homeYear = ys.value; drawHome(); }; }
}

/* ---------- routing ---------- */
async function route() {
  if (!MQ.session) return;
  var hash = location.hash || '';
  if (!/^#\/(eval|marks)\//.test(hash)) { lastPlain = hash; MQ.prevHash = lastPlain; }
  else MQ.prevHash = lastPlain;
  var p = hash.replace(/^#\/?/, '').split('/'), u = MQ.session.user;
  if (current === 'reader' && p[0] !== 'eval' && p[0] !== 'marks') await MQ.reader.close();
  if ((p[0] === 'eval' || p[0] === 'marks') && p[1]) {
    // #/eval/ITS = the thesis with the form beside it; #/marks/ITS = the form alone, the PDF is not downloaded unless asked for
    show('reader');
    MQ.reader.open(decodeURIComponent(p[1]), p[2] ? decodeURIComponent(p[2]) : '', { mode: p[0] === 'marks' ? 'marks' : 'pdf' });
    return;
  }
  if (u.isAdmin && u.teacher && !p[0]) {
    // landing page of an administrator who is also an evaluator: their last choice, else their own students if they have any
    var land = MQ.lsGet('mq.land.' + u.email);
    if (land !== 'admin' && land !== 'mine') {
      land = 'admin';
      try { var as = await MQ.api('assignments'); if (as.assignments && as.assignments.length) land = 'mine'; } catch (e) { /* fall back to the dashboard */ }
    }
    location.replace('#/' + land); return;
  }
  if (u.isAdmin && p[0] !== 'mine') {
    if (p[0] !== 'admin') { location.replace('#/admin'); return; }
    show('admin'); markNav(); MQ.admin.show(p[1] || 'progress');
    return;
  }
  if (!u.teacher) { location.replace('#/admin'); return; }
  show('home'); markNav(); renderHome();
}
window.addEventListener('hashchange', route);

/* ---------- sign-in and start ---------- */
var starting = false;
async function startSession() {
  if (starting) return; starting = true;
  try {
    var s = await MQ.api('session');
    MQ.session = s; MQ.skew = s.serverNow - Date.now();
    MQ.hideLogin(); setNav();
    await route();
  } catch (e) {
    if (e.code === 'auth' || e.code === 'forbidden') { MQ.forgetToken(); MQ.showLogin(e.message, true); }
    else MQ.showLogin(e.message + ' Reload the page to try again.', true);
  } finally { starting = false; }
}
MQ.onSignedIn = function () { if (!MQ.session) startSession(); else MQ.hideLogin(); };

$('#signout').addEventListener('click', function () { if (MQ.reader && MQ.reader.clearCache) MQ.reader.clearCache(); MQ.signOut(); });
$('#whobtn').addEventListener('click', function () { var m = $('#whomenu'); m.hidden = !m.hidden; $('#whobtn').setAttribute('aria-expanded', m.hidden ? 'false' : 'true'); });
document.addEventListener('click', function (e) { if (!e.target.closest('.who')) { $('#whomenu').hidden = true; $('#whobtn').setAttribute('aria-expanded', 'false'); } });
$('#theme').addEventListener('click', function () {
  var cur = document.documentElement.getAttribute('data-theme');
  var dark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  var next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next); MQ.lsSet('mq.theme', next);
});
(function () { var t = MQ.lsGet('mq.theme'); if (t) document.documentElement.setAttribute('data-theme', t); })();

(async function boot() {
  if (!MQ.CFG.API_URL || /^PASTE/.test(MQ.CFG.API_URL)) { MQ.showLogin('', true); $('#login-msg').textContent = 'This site is not set up yet: API_URL is missing in config.js.'; $('#login-msg').className = 'lmsg bad'; return; }
  if (MQ.restoreToken()) { await startSession(); if (MQ.session) return; }
  else MQ.showLogin('');
  // GIS may sign the person in automatically (one-tap) once it has loaded
  MQ.initGis().then(function (ok) { if (ok && !MQ.hasToken()) { try { google.accounts.id.prompt(); } catch (e) { /* ignore */ } } });
})();
})();
