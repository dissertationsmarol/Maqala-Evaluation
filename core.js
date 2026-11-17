/* Core: helpers, sign-in (Google Identity Services), API client, toast and dialogs. */
(function () {
'use strict';
var MQ = window.MQ = {};
var CFG = MQ.CFG = window.MAQALA_CONFIG || {};

/* ---------- helpers ---------- */
MQ.$ = function (s, r) { return (r || document).querySelector(s); };
MQ.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
MQ.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
MQ.isObj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
MQ.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
MQ.lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
MQ.lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
MQ.lsDel = function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };
MQ.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var $ = MQ.$, $$ = MQ.$$, esc = MQ.esc;

/* ---------- clock (the server's clock decides the deadline) ---------- */
MQ.skew = 0;
MQ.now = function () { return Date.now() + MQ.skew; };
MQ.timeLeft = function (ms) {
  var d = ms - MQ.now();
  if (d <= 0) return { over: true, text: 'Deadline passed' };
  var m = Math.floor(d / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
  if (days >= 2) return { over: false, text: days + ' days left' };
  if (h >= 1) return { over: false, text: h + ' h ' + (m % 60) + ' min left' };
  return { over: false, text: m + ' min left', urgent: true };
};

/* ---------- toast + dialogs ---------- */
var toastT = null;
MQ.toast = function (msg, kind) {
  var el = $('#toast');
  el.textContent = msg; el.setAttribute('data-k', kind || ''); el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, kind === 'bad' ? 6000 : kind === 'hint' ? 11000 : 2600);
};
MQ.modal = function (html, opt) {
  var m = $('#modal');
  $('.mbox', m).className = 'mbox' + (opt && opt.wide ? ' wide' : '');
  $('.mbody', m).innerHTML = html;
  m.hidden = false;
  var f = $('.mbody [autofocus]', m) || $('.mbody button', m); if (f) f.focus();
  return $('.mbody', m);
};
MQ.closeModal = function () { $('#modal').hidden = true; $('#modal .mbody').innerHTML = ''; };
MQ.confirm = function (msg, okLabel, danger) {
  return new Promise(function (res) {
    var b = MQ.modal('<p class="mp">' + esc(msg) + '</p><div class="mact"><button type="button" class="btn ghost" data-r="0">Cancel</button><button type="button" class="btn ' + (danger ? 'danger' : 'gold') + '" data-r="1" autofocus>' + esc(okLabel || 'OK') + '</button></div>');
    b.addEventListener('click', function h(e) {
      var x = e.target.closest('button[data-r]'); if (!x) return;
      b.removeEventListener('click', h); MQ.closeModal(); res(x.getAttribute('data-r') === '1');
    });
  });
};
document.addEventListener('click', function (e) {
  if (e.target.id === 'modal' || e.target.closest('[data-close-modal]')) MQ.closeModal();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#modal').hidden) MQ.closeModal(); });

/* ---------- sign-in ---------- */
var token = null, tokenExp = 0, waiters = [], requesting = false, gisInit = false;

function parseJwt(t) {
  try {
    var b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch (e) { return null; }
}
function setToken(t) {
  token = t;
  var p = parseJwt(t);
  tokenExp = p && p.exp ? p.exp * 1000 : Date.now() + 55 * 60000;
  try { sessionStorage.setItem('mq.tok', JSON.stringify({ t: t, e: tokenExp })); } catch (e) { /* ignore */ }
}
function tokenOk() { return !!token && tokenExp > Date.now() + 90000; }
MQ.restoreToken = function () {
  try {
    var o = JSON.parse(sessionStorage.getItem('mq.tok'));
    if (o && o.e > Date.now() + 120000) { token = o.t; tokenExp = o.e; return true; }
  } catch (e) { /* ignore */ }
  return false;
};
MQ.hasToken = tokenOk;

function gisReady() {
  return new Promise(function (res) {
    var n = 0;
    (function poll() {
      if (window.google && google.accounts && google.accounts.id) return res(true);
      if (++n > 120) return res(false);
      setTimeout(poll, 100);
    })();
  });
}
MQ.initGis = async function () {
  if (gisInit) return true;
  if (!CFG.GOOGLE_CLIENT_ID || /^PASTE/.test(CFG.GOOGLE_CLIENT_ID)) return false;
  if (!(await gisReady())) return false;
  google.accounts.id.initialize({
    client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: true,
    hd: CFG.HOSTED_DOMAIN || undefined, cancel_on_tap_outside: false
  });
  gisInit = true;
  return true;
};
function onCredential(resp) {
  if (!resp || !resp.credential) return;
  setToken(resp.credential);
  requesting = false;
  var w = waiters; waiters = [];
  w.forEach(function (x) { x.res(token); });
  if (MQ.onSignedIn) MQ.onSignedIn();
}
/** The sign-in overlay. `msg` explains why it is showing. */
MQ.showLogin = async function (msg, bad) {
  var box = $('#login');
  box.hidden = false;
  var m = $('#login-msg');
  m.textContent = msg || ''; m.className = 'lmsg' + (bad ? ' bad' : '');
  var cfgOk = await MQ.initGis();
  var holder = $('#gbtn');
  holder.innerHTML = '';
  if (!cfgOk) {
    m.className = 'lmsg bad';
    m.textContent = (!CFG.GOOGLE_CLIENT_ID || /^PASTE/.test(CFG.GOOGLE_CLIENT_ID))
      ? 'This site is not set up yet: GOOGLE_CLIENT_ID is missing in config.js.'
      : 'Google sign-in could not load. Check your connection and reload the page.';
    return;
  }
  google.accounts.id.renderButton(holder, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
};
MQ.hideLogin = function () { $('#login').hidden = true; };
MQ.signOut = function () {
  try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
  token = null; tokenExp = 0;
  try { sessionStorage.removeItem('mq.tok'); } catch (e) { /* ignore */ }
  location.hash = '';
  location.reload();
};
/** Forget the current account so another can be chosen. */
MQ.forgetToken = function () {
  token = null; tokenExp = 0;
  try { sessionStorage.removeItem('mq.tok'); } catch (e) { /* ignore */ }
  try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
};
function getToken() {
  if (tokenOk()) return Promise.resolve(token);
  return new Promise(function (res, rej) {
    waiters.push({ res: res, rej: rej });
    if (requesting) return;
    requesting = true;
    MQ.initGis().then(function (ok) {
      if (!ok) { requesting = false; MQ.showLogin('Please sign in again.', true); return; }
      try {
        google.accounts.id.prompt(function (n) {
          var skipped = (n.isNotDisplayed && n.isNotDisplayed()) || (n.isSkippedMoment && n.isSkippedMoment()) || (n.isDismissedMoment && n.isDismissedMoment() && n.getDismissedReason && n.getDismissedReason() !== 'credential_returned');
          if (skipped) { requesting = false; MQ.showLogin('Your session ended. Please sign in again to keep working. Nothing you typed is lost.'); }
        });
      } catch (e) { requesting = false; MQ.showLogin('Please sign in again.'); }
      setTimeout(function () { if (waiters.length && $('#login').hidden) { requesting = false; MQ.showLogin('Your session ended. Please sign in again to keep working. Nothing you typed is lost.'); } }, 9000);
    });
  });
}

/* ---------- API ---------- */
function fail(code, msg) { var e = new Error(msg); e.code = code; return e; }
MQ.api = async function (action, body, opt) {
  opt = opt || {};
  for (var attempt = 0; attempt < 2; attempt++) {
    var tok = await getToken();
    var res, text;
    try {
      res = await fetch(CFG.API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', keepalive: !!opt.keepalive,
        body: JSON.stringify(Object.assign({}, body || {}, { action: action, token: tok }))
      });
      text = await res.text();
    } catch (e) {
      throw fail('network', 'Can’t reach the server. Check your internet connection.');
    }
    var j;
    try { j = JSON.parse(text); } catch (e) {
      throw fail('server', 'The server sent an unexpected reply. Check that the web app is deployed with access set to “Anyone”.');
    }
    if (j.ok) return j.data;
    if (j.error === 'auth' && attempt === 0) { token = null; tokenExp = 0; continue; }
    throw fail(j.error || 'server', j.message || 'Something went wrong.');
  }
  throw fail('auth', 'Please sign in.');
};
})();
