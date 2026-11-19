(window.MQ_BUILD = window.MQ_BUILD || {}).reader = '2026-11-19d';
/* The reader: the thesis fills the window. The rubric slides in from the right (temporary), the marks and comments from the left. */
(function () {
'use strict';
var MQ = window.MQ, $ = MQ.$, $$ = MQ.$$, esc = MQ.esc, CFG = MQ.CFG;
var P = null;                 // the open PDF
var layout = 'pdf';           // 'pdf' | 'form'
var openT = {}, state = { R: { open: false, pin: false, eng: false }, L: { open: false, pin: false, eng: false } };
var lastPointer = 'mouse', myOpen = 0, barT = 0;
var OPEN = null;              // what is open: { r, its, ev, token, started } (started = the PDF download has begun)

/* ---------------- pdf.js, loaded only when a PDF is opened ---------------- */
var pdfjsP = null;
function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsP) return pdfjsP;
  pdfjsP = new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = CFG.PDFJS_BASE + 'pdf.min.js';
    s.onload = function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = CFG.PDFJS_BASE + 'pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror = function () { pdfjsP = null; rej(new Error('The PDF viewer could not be loaded. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return pdfjsP;
}

/* ---------------- local cache of downloaded PDFs (so reopening is instant) ---------------- */
function idb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('maqala-pdf', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('pdf'); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
async function cacheGet(key) {
  try {
    var db = await idb();
    return await new Promise(function (res) { var q = db.transaction('pdf').objectStore('pdf').get(key); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; });
  } catch (e) { return null; }
}
async function cachePut(key, buf) {
  try {
    var db = await idb();
    await new Promise(function (res, rej) { var tx = db.transaction('pdf', 'readwrite'); tx.objectStore('pdf').put(buf, key); tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; });
    var idx = []; try { idx = JSON.parse(MQ.lsGet('mq.pdfcache') || '[]'); } catch (e) { idx = []; }
    idx = idx.filter(function (x) { return x.k !== key; }); idx.unshift({ k: key, at: Date.now() });
    var drop = idx.splice(6);
    if (drop.length) { var tx2 = db.transaction('pdf', 'readwrite'); drop.forEach(function (x) { tx2.objectStore('pdf').delete(x.k); }); }
    MQ.lsSet('mq.pdfcache', JSON.stringify(idx));
  } catch (e) { /* cache is optional */ }
}
function clearCache() { try { indexedDB.deleteDatabase('maqala-pdf'); } catch (e) { /* ignore */ } MQ.lsDel('mq.pdfcache'); }

function b64ToBytes(b64) {
  var bin = atob(b64), n = bin.length, out = new Uint8Array(n);
  for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** Downloads the PDF in 3 MB pieces through the web app, three at a time. */
async function fetchPdf(studentIts, evIts, info, token, onProgress) {
  var key = info.name + '|' + info.size;
  var hit = await cacheGet(key);
  if (hit && hit.byteLength === info.size) { onProgress(info.chunks, info.chunks); return new Uint8Array(hit); }
  var out = new Uint8Array(info.size), done = 0, next = 0, failed = null;
  async function worker() {
    while (!failed && next < info.chunks) {
      var i = next++;
      for (var attempt = 0; ; attempt++) {
        try {
          var r = await MQ.api('pdfChunk', { studentIts: studentIts, evaluatorIts: evIts || undefined, index: i });
          var bytes = b64ToBytes(r.b64);
          if (token !== myOpen) return;
          out.set(bytes, i * info.chunkBytes);
          done++; onProgress(done, info.chunks);
          break;
        } catch (e) {
          if (attempt >= 2 || e.code === 'forbidden' || e.code === 'not_found') { failed = e; return; }
          await MQ.sleep(1200 * (attempt + 1));
        }
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (failed) throw failed;
  if (token === myOpen) cachePut(key, out.buffer.slice(0));
  return out;
}

/* ---------------- drawing pages ---------------- */
function areaWidth() { var a = $('#pdfarea'); return Math.max(260, a.clientWidth - 28); }
/* the right-hand hover strip sits just left of the PDF's scroll bar, so the bar stays usable */
function fitEdge() { var a = $('#pdfarea'); $('#rmain').style.setProperty('--sbw', Math.max(0, a.offsetWidth - a.clientWidth) + 'px'); }
function pageCssWidth() { return Math.round(Math.min(1100, areaWidth()) * P.zoom); }
function buildPages() {
  var host = $('#pdfpages'); host.innerHTML = '';
  if (P.io) P.io.disconnect();
  var w = pageCssWidth(), h = Math.round(w * P.ratio);
  P.els = [];
  for (var i = 1; i <= P.doc.numPages; i++) {
    var d = document.createElement('div');
    d.className = 'pg'; d.setAttribute('data-n', i); d.style.width = w + 'px'; d.style.height = h + 'px';
    d.innerHTML = '<canvas></canvas><div class="textLayer"></div><span class="pgn">' + i + '</span>';
    host.appendChild(d); P.els.push(d);
  }
  P.io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var n = +en.target.getAttribute('data-n');
      if (en.isIntersecting) renderPage(n, P.gen); else unrenderPage(n);
    });
  }, { root: $('#pdfarea'), rootMargin: '1400px 0px' });
  P.els.forEach(function (el) { P.io.observe(el); });
  P.gen++;
}
async function renderPage(n, gen) {
  var el = P.els[n - 1]; if (!el || el._r) return;
  el._r = true;
  try {
    var page = await P.doc.getPage(n);
    if (gen !== P.gen || !el._r) return;
    var vp1 = page.getViewport({ scale: 1 }), w = pageCssWidth(), scale = w / vp1.width;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (vp1.width * scale * dpr * vp1.height * scale * dpr > 16e6) dpr = 1;
    var vp = page.getViewport({ scale: scale * dpr });
    var cv = $('canvas', el), ctx = cv.getContext('2d');
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    cv.style.width = w + 'px'; cv.style.height = Math.round(vp.height / dpr) + 'px';
    el.style.width = w + 'px'; el.style.height = Math.round(vp.height / dpr) + 'px';
    el.classList.add('has');
    el._task = page.render({ canvasContext: ctx, viewport: vp });
    await el._task.promise;
    if (gen !== P.gen || !el._r) return;
    var tl = $('.textLayer', el);
    tl.innerHTML = ''; tl.style.width = w + 'px'; tl.style.height = Math.round(vp.height / dpr) + 'px';
    tl.style.setProperty('--scale-factor', String(scale));
    try {
      var tc = await page.getTextContent();
      if (gen === P.gen && el._r && window.pdfjsLib.renderTextLayer) {
        window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: page.getViewport({ scale: scale }), textDivs: [] });
      }
    } catch (e) { /* selectable text is a nicety */ }
  } catch (e) {
    if (!e || e.name !== 'RenderingCancelledException') { el._r = false; }
  }
}
function unrenderPage(n) {
  var el = P && P.els[n - 1]; if (!el || !el._r) return;
  el._r = false;
  try { if (el._task) el._task.cancel(); } catch (e) { /* ignore */ }
  var cv = $('canvas', el); cv.width = 0; cv.height = 0;
  $('.textLayer', el).innerHTML = '';
  el.classList.remove('has');
}
function currentPage() {
  var a = $('#pdfarea'), y = a.scrollTop + a.clientHeight * 0.3, lo = 0, hi = P.els.length - 1;
  while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (P.els[mid].offsetTop <= y) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
var scrollRaf = 0;
function onScroll() {
  if (!P || !P.doc || scrollRaf) return;
  scrollRaf = requestAnimationFrame(function () {
    scrollRaf = 0;
    var pp = P;
    if (!pp || !pp.doc || !pp.els.length) return;          // the reader may have been closed meanwhile
    var n = currentPage(), inp = $('#pgno');
    if (document.activeElement !== inp) inp.value = n;
    $('#cpg').textContent = 'p. ' + n + ' / ' + pp.doc.numPages;
    clearTimeout(pp.saveT); pp.saveT = setTimeout(function () { MQ.lsSet('mq.page.' + pp.key, String(n)); }, 600);
  });
}
function goTo(n) {
  if (!P || !P.doc) return;
  n = Math.max(1, Math.min(P.doc.numPages, n | 0));
  $('#pdfarea').scrollTop = P.els[n - 1].offsetTop - 10;
  $('#pgno').value = n;
}
function relayout(keepZoom) {
  if (!P || !P.doc) return;
  var a = $('#pdfarea'), frac = a.scrollHeight ? a.scrollTop / a.scrollHeight : 0;
  buildPages(); fitEdge();
  a.scrollTop = frac * a.scrollHeight;
  onScroll();
}
function setZoom(z) {
  if (!P || !P.doc) return;
  P.zoom = Math.max(0.5, Math.min(3, Math.round(z * 100) / 100));
  $('#zoomv').textContent = Math.round(P.zoom * 100) + '%';
  relayout();
}
var resizeT = 0;
window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { if (P && P.doc && !$('#reader').hidden) relayout(); }, 250); });

/* ---------------- state messages over the PDF area ---------------- */
function pdfState(html) { var s = $('#pdfstate'); s.innerHTML = html || ''; s.hidden = !html; }
function progressHtml(done, total, name) {
  var pct = total ? Math.round(done * 100 / total) : 0;
  return '<div class="pst"><div class="spin" aria-hidden="true"></div><p dir="auto"><b>جارٍ تحميل المقالة…</b><br><span class="en">Loading the thesis PDF · ' + done + ' / ' + total + ' parts</span></p><div class="bar2" role="progressbar" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' + (name ? '<p class="en fn">' + esc(name) + '</p>' : '') + '</div>';
}

async function loadPdf(info, studentIts, evIts, token, pdfError) {
  if (!info) {
    pdfState('<div class="pst"><p><b>لم يُعثر على ملف المقالة</b><br><span class="en">No PDF was found for this student in the Drive folder yet.</span></p>' +
      (pdfError ? '<p class="en err">' + esc(pdfError) + '</p>' : '') +
      '<p class="en">You can still mark using the panel on the left. Ask the dissertations office to check the file name: <i>Student Pdf Copy_[ITS]_TRNO_[TRNO]_[timestamp].pdf</i></p></div>');
    return;
  }
  pdfState(progressHtml(0, info.chunks, info.name));
  try {
    var lib = await loadPdfjs();
    var bytes = await fetchPdf(studentIts, evIts, info, token, function (d, t) { if (token === myOpen) pdfState(progressHtml(d, t, info.name)); });
    if (token !== myOpen) return;
    var doc = await lib.getDocument({ data: bytes }).promise;
    if (token !== myOpen) { doc.destroy(); return; }
    var p1 = await doc.getPage(1), v1 = p1.getViewport({ scale: 1 });
    P = { doc: doc, ratio: v1.height / v1.width, zoom: 1, els: [], io: null, gen: 0, key: studentIts, saveT: 0 };
    pdfState('');
    $('#pdfctl').hidden = false; $('#pgno').value = 1; $('#pgtot').textContent = '/ ' + doc.numPages; $('#zoomv').textContent = '100%';
    buildPages(); fitEdge();
    var saved = +MQ.lsGet('mq.page.' + studentIts) || 1;
    if (saved > 1) setTimeout(function () { goTo(saved); }, 60);
    onScroll();
  } catch (e) {
    if (token !== myOpen) return;
    pdfState('<div class="pst"><p><b>تعذّر تحميل الملف</b><br><span class="en">' + esc(e.message || 'The PDF could not be opened.') + '</span></p><button type="button" class="btn gold" id="pdf-retry">Try again</button></div>');
    var b = $('#pdf-retry'); if (b) b.onclick = function () { loadPdf(info, studentIts, evIts, token, pdfError); };
  }
}

/* ---------------- the two hover panels ----------------
   Right = the rubric, a temporary look. Left = marks, comments, result.
   A panel opens when the pointer rests on its edge (or the tab is tapped). It closes again when the pointer leaves,
   unless the person has started to use it (clicked or typed in it) or has pinned it. Clicking on the PDF always closes
   whatever is not pinned, so focus going back to the thesis hides the form again. */
function pushed(side) { return state[side].open && state[side].pin; }
function reflow() { clearTimeout(resizeT); resizeT = setTimeout(function () { if (P && P.doc) { relayout(); } }, 260); }
function paint(side) {
  var s = state[side], root = $('#reader');
  $('#panel' + side).classList.toggle('open', s.open);
  $('#edge' + side).classList.toggle('on', s.open);
  $('#h' + side).setAttribute('aria-expanded', s.open ? 'true' : 'false');
  $('#panel' + side).setAttribute('aria-hidden', s.open ? 'false' : 'true');
  root.classList.toggle('open' + side, s.open);
  root.classList.toggle('pin' + side, pushed(side));
  $('#pin' + side).setAttribute('aria-pressed', s.pin ? 'true' : 'false');
}
function setPanel(side, open) {
  var s = state[side], before = pushed(side);
  clearTimeout(openT[side]);
  s.open = open;
  if (!open) {
    s.eng = false;
    var ae = document.activeElement, pn = $('#panel' + side);
    if (ae && pn.contains(ae) && ae.blur) ae.blur();
    MQ.form.stopDictation();
  }
  paint(side);
  if (before !== pushed(side)) reflow();
}
function setPin(side, pin) {
  var before = pushed(side);
  state[side].pin = pin;
  if (pin) state[side].eng = true;
  paint(side);
  if (before !== pushed(side)) reflow();
}
function unpinAll() { ['R', 'L'].forEach(function (s) { state[s].pin = false; state[s].eng = false; state[s].open = false; paint(s); }); }
function wantOpen(side, delay) { clearTimeout(openT[side]); openT[side] = setTimeout(function () { setPanel(side, true); }, delay); }
function wantClose(side, delay) {
  clearTimeout(openT[side]);
  openT[side] = setTimeout(function () {
    var s = state[side];
    if (s.pin || s.eng || MQ.form.busy()) return;       // in use, or kept open on purpose
    setPanel(side, false);
  }, delay);
}
function engage(side) { clearTimeout(openT[side]); state[side].eng = true; }
function closeUnpinned() { var tt = $('#toast'); if (tt.getAttribute('data-k') === 'hint') tt.hidden = true; ['R', 'L'].forEach(function (s) { if (state[s].open && !state[s].pin) setPanel(s, false); }); }

/* the toolbar: slides away on a mouse screen, comes back when the pointer visits the top-centre tab */
function barShow(on) { $('#reader').classList.toggle('barhide', !on); $('#hT').setAttribute('aria-expanded', on ? 'true' : 'false'); }
function barHideSoon(ms) {
  clearTimeout(barT);
  barT = setTimeout(function () {
    var a = document.activeElement;
    if (a && $('#rbar').contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
    barShow(false);
  }, ms);
}

function wirePanels() {
  ['R', 'L'].forEach(function (side) {
    var edge = $('#edge' + side), panel = $('#panel' + side), handle = $('#h' + side);
    edge.addEventListener('pointerenter', function (e) { lastPointer = e.pointerType; if (layout === 'pdf' && e.pointerType === 'mouse') wantOpen(side, 140); });
    edge.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') wantClose(side, 400); });
    panel.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') clearTimeout(openT[side]); });
    panel.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && layout === 'pdf') wantClose(side, 450); });
    panel.addEventListener('pointerdown', function () { engage(side); });          // started using it: it stays until the PDF is clicked
    panel.addEventListener('focusin', function () { engage(side); });
    handle.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
    handle.addEventListener('click', function () {                                 // tap / Enter on the tab
      if (layout !== 'pdf') return;
      if (state[side].open && state[side].eng) setPanel(side, false);
      else { setPanel(side, true); engage(side); }
    });
    $('#pin' + side).addEventListener('click', function () {
      setPin(side, !state[side].pin);
    });
    $('#close' + side).addEventListener('click', function () { state[side].pin = false; setPanel(side, false); paint(side); reflow(); });
  });
  // focus going back to the thesis hides every panel that is not pinned
  $('#pdfarea').addEventListener('pointerdown', closeUnpinned);
  $('#pdfstate').addEventListener('pointerdown', closeUnpinned);
  document.addEventListener('keydown', function (e) {
    if ($('#reader').hidden || !$('#modal').hidden || layout !== 'pdf') return;
    if (e.key === 'Escape') ['R', 'L'].forEach(function (s) { if (state[s].open) { state[s].pin = false; setPanel(s, false); paint(s); reflow(); } });
  });
  $('#panelL .ptabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    MQ.form.setTab(b.getAttribute('data-tab'));
  });
  // the status chip opens the marks panel
  $('#rchip').addEventListener('click', function () { setPanel('L', true); engage('L'); });
  // toolbar reveal
  $('#edgeT').addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; clearTimeout(barT); barShow(true); });
  $('#edgeT').addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') barHideSoon(900); });
  $('#rbar').addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') clearTimeout(barT); });
  $('#rbar').addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') barHideSoon(900); });
  $('#rbar').addEventListener('focusin', function () { clearTimeout(barT); barShow(true); });
  $('#hT').addEventListener('click', function () { barShow(true); });
  // whole-screen mode (F11 does the same)
  var fs = $('#rfull');
  if (document.fullscreenEnabled) {
    fs.hidden = false;
    fs.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {});
    });
    document.addEventListener('fullscreenchange', function () { fs.textContent = document.fullscreenElement ? '⛶ Exit full screen' : '⛶ Full screen'; setTimeout(function () { if (P && P.doc) relayout(); }, 200); });
  }
}

/* ---------------- layout: the PDF with hover panels, or the form on its own (phone beside a PC) ---------------- */
function moveRubric() {
  // beside the PDF the rubric lives in the right panel; with the form on its own it becomes the first tab of the only panel
  var ru = $('#fv-rubric'), alone = layout === 'form';
  var dest = alone ? $('#pbodyL') : $('#pbodyR');
  if (ru.parentNode !== dest) { if (alone) dest.insertBefore(ru, dest.firstChild); else dest.appendChild(ru); }
}
function setLayout(l, remember) {
  layout = l;
  var root = $('#reader');
  root.classList.toggle('formonly', l === 'form');
  moveRubric();
  if (l === 'form') { unpinAll(); barShow(true); reflow(); }
  var t = MQ.form.currentTab();
  if (l === 'pdf' && t === 'rubric') t = 'score';
  MQ.form.setTab(t);
  $('#rlayout').textContent = l === 'pdf' ? 'Form only' : 'Show PDF';
  $('#rlayout').title = l === 'pdf' ? 'Hide the PDF and show the form full width (useful on a phone)' : 'Show the PDF full screen with the hover panels';
  MQ.form.renderMics();
  if (l === 'pdf') startPdf();
  if (P && P.doc && l === 'pdf') setTimeout(relayout, 50);
}
/** Starts the PDF download once. Marks entry only does not call this until the person asks for the PDF. */
function startPdf() {
  if (!OPEN || OPEN.started) return;
  OPEN.started = true;
  loadPdf(OPEN.r.pdf, OPEN.its, OPEN.ev, OPEN.token, OPEN.r.pdfError);
}

/* ---------------- header ---------------- */
function tick() {
  var F = MQ.form.state(); if (!F) return;
  var chip = $('#rdl'), dl = F.deadline;
  if (!dl) { chip.textContent = 'No deadline set'; chip.className = 'dlchip'; return; }
  var tl = MQ.timeLeft(dl.ms);
  chip.className = 'dlchip' + (F.locked ? ' over' : tl.urgent ? ' urgent' : '');
  chip.textContent = F.locked ? 'Locked · ' + dl.text : 'Deadline ' + dl.text + ' · ' + tl.text;
}
function fillBar(r) {
  var F = MQ.form.state();
  $('#rname').textContent = F.student.name || ('ITS ' + F.student.its);
  $('#rsub').textContent = 'ITS ' + F.student.its + (F.student.trno ? ' · TRNO ' + F.student.trno : '');
  $('#rtk').textContent = F.student.takhassus ? '\u0627\u0644\u062a\u062e\u0635\u0635 \u00b7 ' + F.student.takhassus : '';
  var u = MQ.session.user, obo = $('#obo');
  var mine = u.teacher && u.teacher.its === F.evaluator.its;
  obo.hidden = !!mine;
  $('#rchip').classList.toggle('obo', !mine); $('#cobo').textContent = mine ? '' : 'for ' + (F.evaluator.name || F.evaluator.its);
  if (!mine) obo.textContent = 'You are editing on behalf of ' + (F.evaluator.name || F.evaluator.its) + ' (administrator access).';
  tick();
}

/* ---------------- open / close ---------------- */
var api = MQ.reader = {
  mounted: false,
  mount: function () {
    if (api.mounted) return; api.mounted = true;
    MQ.form.mount({
      openComments: function (sec) {
        MQ.form.setTab('comments');
        if (layout === 'pdf') { setPanel('L', true); engage('L'); }
        setTimeout(function () { MQ.form.focusComment(sec); }, layout === 'pdf' ? 260 : 50);
      },
      tick: tick
    });
    wirePanels();
    $('#rlayout').addEventListener('click', function () { setLayout(layout === 'pdf' ? 'form' : 'pdf', true); });
    $('#pdfarea').addEventListener('scroll', onScroll, { passive: true });
    $('#zin').addEventListener('click', function () { setZoom((P ? P.zoom : 1) + 0.15); });
    $('#zout').addEventListener('click', function () { setZoom((P ? P.zoom : 1) - 0.15); });
    $('#zfit').addEventListener('click', function () { setZoom(1); });
    $('#pgno').addEventListener('change', function () { goTo(+this.value); });
    $('#pgno').addEventListener('keydown', function (e) { if (e.key === 'Enter') { goTo(+this.value); this.blur(); } });
    $('#rback').addEventListener('click', function () { api.back(); });
  },
  back: function () {
    var h = MQ.prevHash && !/^#\/(eval|marks)\//.test(MQ.prevHash) ? MQ.prevHash : (MQ.session.user.isAdmin ? '#/admin' : '#/');
    location.hash = h;
  },
  open: async function (studentIts, evIts, opts) {
    api.mount();
    var token = ++myOpen, mode = opts && opts.mode === 'marks' ? 'marks' : 'pdf';
    OPEN = null;
    $('#reader').classList.remove('showstate');
    P = null; closePdfDoc();
    $('#pdfpages').innerHTML = ''; $('#pdfctl').hidden = true; $('#rname').textContent = 'Loading…'; $('#rsub').textContent = ''; $('#rtk').textContent = '';
    $('#obo').hidden = true; $('#lockbanner').hidden = true;
    pdfState('<div class="pst"><div class="spin" aria-hidden="true"></div><p class="en">Opening the evaluation…</p></div>');
    var r;
    try { r = await MQ.form.load(studentIts, evIts); }
    catch (e) {
      if (token !== myOpen) return;
      $('#reader').classList.add('showstate');
      pdfState('<div class="pst"><p><b>تعذّر فتح التقييم</b><br><span class="en">' + esc(e.message) + '</span></p><button type="button" class="btn gold" id="rerr-back">Go back</button></div>');
      $('#rerr-back').onclick = function () { api.back(); };
      $('#rname').textContent = '—';
      return;
    }
    if (token !== myOpen) return;
    unpinAll(); clearTimeout(barT);
    OPEN = { r: r, its: studentIts, ev: evIts, token: token, started: false };
    layout = null;
    setLayout(mode === 'marks' ? 'form' : 'pdf', false);            // the button the person pressed decides; the PDF is fetched only when it is shown
    MQ.form.setTab('score');
    fillBar(r);
    // the toolbar greets the person for a moment, then slides away; a one-time hint explains the two sides
    barShow(true);
    if (layout === 'pdf') {
      barHideSoon(3500);
      if (!MQ.lsGet('mq.seen.hint2')) { MQ.lsSet('mq.seen.hint2', '1'); MQ.toast(window.matchMedia && window.matchMedia('(pointer:coarse)').matches ? 'Tap the side tabs, or the total at the bottom, to open the marks and the rubric. Tap the PDF to hide them again. 📌 keeps them open while you read.' : 'Move the pointer to the right edge for the rubric and to the left edge for marks and comments. Click the PDF to hide them again. 📌 keeps the marks open while you read.', 'hint'); }
    }
  },
  close: async function () {
    myOpen++; OPEN = null;
    closePdfDoc(); P = null;
    clearTimeout(barT); unpinAll();
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
    await MQ.form.unload();
  },
  clearCache: clearCache,
  goTo: goTo,
  page: function () { return P && P.doc ? currentPage() : 0; },
  pages: function () { return P && P.doc ? P.doc.numPages : 0; },
  layout: function () { return layout; }
};
function closePdfDoc() {
  if (P && P.io) P.io.disconnect();
  if (P && P.doc) { try { P.doc.destroy(); } catch (e) { /* ignore */ } }
}
})();
