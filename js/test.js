/* Test Simulator module — the graded practice exam + topic drills + missed review.
   Renders into its panel; uses the shared core (CIV) for data, prefs, TTS, and
   dynamic-question resolution. State/district are set once in the shared location bar. */
window.TestApp = (function () {
  "use strict";
  var C = window.CIV;
  var EXAM_SIZE = 20, PASS_NEEDED = 12, MAX_WRONG = EXAM_SIZE - PASS_NEEDED + 1, TTL = 7 * 24 * 60 * 60 * 1000;
  var container = null, pendingMode = null, pendingCat = null, session = null;

  // ---- distractors ----
  var NUM_DURATIONS = [{ en: "2 years", es: "2 años" }, { en: "4 years", es: "4 años" }, { en: "6 years", es: "6 años" }, { en: "8 years", es: "8 años" }, { en: "10 years", es: "10 años" }];
  var NUM_YEARS = ["1776", "1787", "1865", "1870", "1920", "1929", "1941", "2001"].map(function (n) { return { en: n, es: n }; });
  var NUM_COUNTS = ["2", "5", "9", "13", "25", "50", "100", "435"].map(function (n) { return { en: n, es: n }; });
  function numShape(s) { s = String(s).trim(); if (/\d+\s*(years?|años?)/i.test(s)) return "dur"; if (/^\d{4}$/.test(s)) return "year"; if (/^\d{1,3}$/.test(s)) return "count"; return null; }
  function distractorPool(q) {
    var ex = {}; q.acceptable.forEach(function (a) { ex[a.en.toLowerCase()] = true; });
    var seen = {}, pool = [];
    (C.DATA.poolByCat[q.cat] || []).forEach(function (p) { var k = p.en.toLowerCase(); if (p.qid === q.id || ex[k] || seen[k]) return; seen[k] = true; pool.push({ en: p.en, es: p.es }); });
    return pool;
  }
  function autoDistractors(q) {
    var ex = {}; q.acceptable.forEach(function (a) { ex[a.en.toLowerCase()] = true; });
    var shape = (q.acceptable.length === 1) ? numShape(q.acceptable[0].en) : null;
    if (shape) {
      var seenN = {}, poolN = [];
      function addN(p) { var k = p.en.toLowerCase(); if (ex[k] || seenN[k]) return; seenN[k] = true; poolN.push({ en: p.en, es: p.es }); }
      (C.DATA.poolByCat[q.cat] || []).forEach(function (p) { if (p.qid !== q.id && numShape(p.en) === shape) addN(p); });
      (shape === "dur" ? NUM_DURATIONS : shape === "year" ? NUM_YEARS : NUM_COUNTS).forEach(addN);
      return C.sample(poolN, 3);
    }
    return C.sample(distractorPool(q), 3);
  }

  // ---- "name N" grouping ----
  var COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  function parseCount(stemEn) { var m = String(stemEn).toLowerCase().match(/(?:name|mention|give|describe|list|what are(?: the)?)\s+(one|two|three|four|five|six)\b/); return m ? COUNT_WORDS[m[1]] : 1; }
  function combineGroup(items) { return { en: items.map(function (x) { return x.en; }).join("; "), es: items.map(function (x) { return x.es; }).join("; ") }; }

  function optionObj(pair) { var showAlt = (C.prefs.lang === "es"); return { en: pair.en, es: pair.es, text: pair[C.prefs.lang], alt: (showAlt && pair.en !== pair.es) ? pair.en : null }; }

  function buildQuestion(id) {
    var q = C.DATA.byId[id], showAlt = (C.prefs.lang === "es"), correct, opts;
    if (q.dynamic) { var r = C.resolveDynamic(q); correct = r.correct; opts = [correct].concat(C.sample(r.distractors, 3)).map(optionObj); }
    else {
      var n = parseCount(q.q.en);
      if (n >= 2 && q.acceptable.length >= 2) {
        var groupN = Math.min(n, q.acceptable.length);
        correct = combineGroup(C.sample(q.acceptable, groupN));
        var pool = C.shuffle(distractorPool(q)), groups = [];
        for (var g = 0; g < 3 && pool.length; g++) groups.push(combineGroup(pool.splice(0, Math.min(groupN, pool.length))));
        opts = [correct].concat(groups).map(optionObj);
      } else { correct = C.pick(q.acceptable); opts = [correct].concat(C.sample(autoDistractors(q), 3)).map(optionObj); }
    }
    opts = C.shuffle(opts);
    var answer = 0; for (var i = 0; i < opts.length; i++) if (opts[i].en === correct.en) { answer = i; break; }
    return { id: id, cat: q.cat, dynamic: q.dynamic, prompt: q.q[C.prefs.lang], promptAlt: showAlt ? q.q.en : null, options: opts, answer: answer, correctText: correct[C.prefs.lang], correctAlt: showAlt ? correct.en : null, acceptableAll: q.acceptable };
  }

  // ---- session ----
  function buildQueue(mode, cat) {
    if (mode === "full") return C.sample(C.DATA.questions.map(function (q) { return q.id; }), EXAM_SIZE);
    if (mode === "category") return C.shuffle(C.DATA.questions.filter(function (q) { return q.cat === cat; }).map(function (q) { return q.id; }));
    if (mode === "missed") return C.shuffle(C.getMissed());
    return [];
  }
  function newSession(mode, cat) { return { mode: mode, cat: cat || null, state: C.prefs.state, district: C.prefs.district, lang: C.prefs.lang, queue: buildQueue(mode, cat), idx: 0, answers: {}, correct: 0, wrong: 0, finished: false, passed: null, createdAt: Date.now() }; }
  function isGraded(s) { return s.mode === "full"; }
  function persist() { if (session) C.saveJSON(C.LS.session, session); }
  function examDecided(s) { return s.mode === "full" && (s.correct >= PASS_NEEDED || s.wrong >= MAX_WRONG); }
  function finishSession() { session.finished = true; if (session.mode === "full") session.passed = session.correct >= PASS_NEEDED; persist(); renderResults(); }

  var el = C.el, t = C.t;

  function renderStart() {
    C.cancelSpeech(); session = null; container.innerHTML = "";
    var head = el("div", "panel-head"); head.appendChild(el("div", "panel-title", t("tabTest"))); container.appendChild(head);

    var saved = C.loadJSON(C.LS.session, null);
    if (saved && !saved.finished && (Date.now() - saved.createdAt) < TTL && saved.queue && saved.queue.length) {
      var rc = el("div", "card"); rc.appendChild(el("div", "section-title", t("resumeTitle"))); rc.appendChild(el("p", "help", t("resumeBody")));
      var row = el("div", "btn-row");
      var yes = el("button", "btn primary", t("resume")); yes.onclick = function () { session = saved; renderQuestion(); };
      var no = el("button", "btn ghost", t("startNew")); no.onclick = function () { C.delKey(C.LS.session); renderStart(); };
      row.appendChild(yes); row.appendChild(no); rc.appendChild(row); container.appendChild(rc);
    } else if (saved && saved.finished) { C.delKey(C.LS.session); }

    var card = el("div", "card"); card.appendChild(el("div", "section-title", t("chooseMode")));
    var modes = el("div", "modes");
    [{ key: "full", ico: "📝", title: "fullExam", desc: "fullExamDesc" }, { key: "category", ico: "📚", title: "categoryDrill", desc: "categoryDrillDesc" }, { key: "missed", ico: "🔁", title: "missedReview", desc: "missedReviewDesc" }].forEach(function (d) {
      var b = el("button", "mode-btn"); b.dataset.mode = d.key;
      var h = el("h3"); h.appendChild(el("span", "ico", d.ico)); h.appendChild(document.createTextNode(t(d.title))); b.appendChild(h);
      b.appendChild(el("p", null, t(d.desc)));
      b.onclick = function () { pendingMode = d.key; renderStart2(); };
      if (pendingMode === d.key) b.classList.add("selected");
      modes.appendChild(b);
    });
    card.appendChild(modes); container.appendChild(card);
    start2Host = el("div"); start2Host.id = "test-start2"; container.appendChild(start2Host);
    if (pendingMode) renderStart2();
  }

  var start2Host;
  function renderStart2() {
    document.querySelectorAll("#test-panel .mode-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.mode === pendingMode); });
    start2Host.innerHTML = "";
    if (pendingMode === "missed") {
      var m = C.getMissed(), c0 = el("div", "card");
      if (!m.length) c0.appendChild(el("p", "help", t("noMissed")));
      else { c0.appendChild(el("p", "help", t("missedReviewDesc"))); var b0 = el("button", "btn primary", t("startMissed")); b0.onclick = function () { session = newSession("missed"); persist(); renderQuestion(); }; c0.appendChild(b0); }
      start2Host.appendChild(c0); return;
    }
    var card = el("div", "card");
    if (pendingMode === "category") {
      card.appendChild(el("div", "section-title", t("pickCategory")));
      var grid = el("div", "cat-grid");
      C.DATA.categories.forEach(function (c) {
        var b = el("button", "mode-btn"); var count = C.DATA.questions.filter(function (q) { return q.cat === c.key; }).length;
        b.appendChild(el("h3", null, c[C.prefs.lang] || c.en));
        b.appendChild(el("p", null, c.range.replace("-", "–") + " · " + count + (C.prefs.lang === "es" ? " preguntas" : " questions")));
        b.onclick = function () { pendingCat = c.key; renderStart2(); };
        if (pendingCat === c.key) b.classList.add("selected");
        grid.appendChild(b);
      });
      card.appendChild(grid);
    }
    var needsState = (pendingMode === "full") || (pendingMode === "category" && pendingCat === "system");
    if (needsState && !C.prefs.district) card.appendChild(el("p", "help warn", t("needLocation")));
    var startBtn = el("button", "btn primary"); startBtn.id = "test-startBtn";
    startBtn.textContent = pendingMode === "category" ? t("startDrill") : t("startExam");
    startBtn.onclick = function () { session = newSession(pendingMode, pendingCat); persist(); renderQuestion(); };
    var ok = !(pendingMode === "category" && !pendingCat) && !(needsState && !C.prefs.district);
    startBtn.disabled = !ok;
    var row = el("div", "btn-row"); row.appendChild(startBtn); card.appendChild(row);
    start2Host.appendChild(card);
  }

  function renderQuestion() {
    C.cancelSpeech(); persist();
    if (session.idx >= session.queue.length) { finishSession(); return; }
    var q = buildQuestion(session.queue[session.idx]); container.innerHTML = "";
    var total = session.queue.length, card = el("div", "card");

    var topbar = el("div", "q-topbar");
    var back = el("button", "btn ghost tiny", "← " + t("backHome"));
    back.onclick = function () { if (window.confirm(t("backConfirm"))) { C.cancelSpeech(); C.delKey(C.LS.session); session = null; pendingMode = null; pendingCat = null; renderStart(); } };
    var endB = el("button", "btn ghost tiny", t("endExam")); endB.onclick = function () { if (window.confirm(t("endConfirm"))) finishSession(); };
    topbar.appendChild(back); topbar.appendChild(endB); card.appendChild(topbar);

    var ph = el("div", "progress-head"); ph.appendChild(el("span", "qnum", t("questionOf", { n: session.idx + 1, total: total })));
    if (isGraded(session)) ph.appendChild(el("span", "score", t("scoreSoFar", { c: session.correct }))); card.appendChild(ph);
    var bar = el("div", "bar"); var span = el("span"); span.style.width = (session.idx / total * 100) + "%"; bar.appendChild(span); card.appendChild(bar);

    if (q.dynamic) card.appendChild(el("span", "badge dyn", t("dynamicBadge")));
    var englishPrompt = q.promptAlt || q.prompt;
    var qRow = el("div", "q-row");
    if (C.TTS) qRow.appendChild(C.speakButton(englishPrompt));
    qRow.appendChild(el("div", "qtext", q.prompt)); card.appendChild(qRow);
    if (q.promptAlt) card.appendChild(el("div", "qsub alt-en", q.promptAlt));

    if (C.TTS && C.loadJSON(C.LS.soundHint, null) !== 1) {
      var hint = el("div", "sound-hint"); hint.appendChild(el("span", null, "🔇 " + t("noSoundHint")));
      var x = el("button", "hint-x", "×"); x.type = "button"; x.setAttribute("aria-label", t("dismiss"));
      x.onclick = function () { C.saveJSON(C.LS.soundHint, 1); hint.remove(); }; hint.appendChild(x); card.appendChild(hint);
    }
    renderMC(card, q); container.appendChild(card); window.scrollTo(0, 0);
  }

  function feedbackBlock(correct, q) {
    var fb = el("div", "feedback " + (correct ? "ok" : "no"));
    var v = el("div", "verdict"); v.appendChild(document.createTextNode((correct ? "✓ " : "✕ ") + (correct ? t("correct") : t("incorrect")))); fb.appendChild(v);
    if (q.correctText) { var off = el("div", "official"); off.appendChild(el("b", null, t("correctAnswer") + ": ")); off.appendChild(document.createTextNode(q.correctText)); fb.appendChild(off); if (q.correctAlt) fb.appendChild(el("div", "official alt-en", q.correctAlt)); }
    if (q.acceptableAll && q.acceptableAll.length > 1) {
      var all = el("div", "official all-acc"); all.appendChild(el("b", null, t("allAcceptable") + ": ")); all.appendChild(document.createTextNode(q.acceptableAll.map(function (a) { return a[C.prefs.lang]; }).join("; "))); fb.appendChild(all);
      if (C.prefs.lang === "es") fb.appendChild(el("div", "official alt-en", q.acceptableAll.map(function (a) { return a.en; }).join("; ")));
    }
    return fb;
  }
  function recordAnswer(q, ok, choice) { session.answers[q.id] = { correct: ok, choice: choice, prompt: q.prompt, correctText: q.correctText }; if (ok) session.correct++; else session.wrong++; if (ok) C.removeMissed(q.id); else C.addMissed(q.id); persist(); }
  function advanceControls(card) {
    var row = el("div", "btn-row"), last = session.idx >= session.queue.length - 1, decided = examDecided(session);
    var b = el("button", "btn primary", (last || decided) ? t("finish") : t("next"));
    b.onclick = function () { if (decided) { finishSession(); return; } session.idx++; if (session.idx >= session.queue.length) finishSession(); else renderQuestion(); };
    row.appendChild(b); card.appendChild(row);
  }
  function renderMC(card, q) {
    var opts = el("div", "options"), answered = false;
    q.options.forEach(function (opt, i) {
      var b = el("button", "opt"); b.appendChild(el("span", "mark", String.fromCharCode(65 + i)));
      var body = el("div", "opt-body"); body.appendChild(el("span", null, opt.text)); if (opt.alt) body.appendChild(el("span", "alt-en", opt.alt)); b.appendChild(body);
      b.onclick = function () {
        if (answered) return; answered = true;
        var correct = (i === q.answer);
        Array.prototype.forEach.call(opts.children, function (child, ci) { child.disabled = true; if (ci === q.answer) child.classList.add("correct"); if (ci === i && !correct) child.classList.add("wrong"); });
        recordAnswer(q, correct, i); card.appendChild(feedbackBlock(correct, q)); advanceControls(card);
      };
      opts.appendChild(b);
    });
    card.appendChild(opts);
  }

  function renderResults() {
    C.cancelSpeech(); C.delKey(C.LS.session); container.innerHTML = "";
    var card = el("div", "card"), total = session.queue.length, answered = Object.keys(session.answers).length;
    if (session.mode === "full") {
      var hero = el("div", "result-hero " + (session.passed ? "pass" : "fail"));
      hero.appendChild(el("div", "big", session.passed ? t("passTitle") : t("failTitle")));
      var sn = el("div", "score-num"); sn.appendChild(document.createTextNode(session.correct)); var sm = el("small"); sm.textContent = " / " + total; sn.appendChild(sm); hero.appendChild(sn);
      hero.appendChild(el("p", "help", t("passNeeded"))); card.appendChild(hero);
      if (examDecided(session) && answered < total) { var note = el("div", "info-card"); note.textContent = t("endedEarly"); card.appendChild(note); }
    } else {
      var h2 = el("div", "result-hero"); h2.appendChild(el("div", "big", session.mode === "category" ? t("drillDone") : t("missedDone")));
      var s2 = el("div", "score-num"); s2.appendChild(document.createTextNode(session.correct)); var m2 = el("small"); m2.textContent = " / " + answered; s2.appendChild(m2); h2.appendChild(s2); card.appendChild(h2);
      if (session.mode === "missed" && !C.getMissed().length) { var cl = el("div", "feedback ok"); cl.appendChild(el("div", "verdict", "✓ " + t("missedCleared"))); card.appendChild(cl); }
    }
    var row = el("div", "btn-row");
    if (session.mode === "full") { var again = el("button", "btn primary", t("retake")); again.onclick = function () { session = newSession("full"); persist(); renderQuestion(); }; row.appendChild(again); }
    if (C.getMissed().length) { var rm = el("button", "btn secondary", t("reviewMissedBtn")); rm.onclick = function () { pendingMode = "missed"; session = newSession("missed"); persist(); renderQuestion(); }; row.appendChild(rm); }
    var home = el("button", "btn ghost", t("home")); home.onclick = function () { pendingMode = null; pendingCat = null; renderStart(); }; row.appendChild(home);
    card.appendChild(row); container.appendChild(card);

    var rev = el("div", "card"); rev.appendChild(el("div", "section-title", t("reviewAnswers")));
    session.queue.forEach(function (id, i) {
      var a = session.answers[id], item = el("div", "review-item"), q = C.DATA.byId[id], showAlt = (C.prefs.lang === "es");
      item.appendChild(el("div", "rq", (i + 1) + ". " + q.q[C.prefs.lang])); if (showAlt) item.appendChild(el("div", "alt-en", q.q.en));
      var ra = el("div", "ra");
      if (!a) ra.appendChild(el("span", "tag skip", t("skipped")));
      else {
        ra.appendChild(el("span", "tag " + (a.correct ? "ok" : "no"), (a.correct ? "✓ " : "✕ ") + (a.correct ? t("correct") : t("incorrect"))));
        if (q.acceptable && q.acceptable.length > 1) { ra.appendChild(el("div", null, t("allAcceptable") + ": " + q.acceptable.map(function (x) { return x[C.prefs.lang]; }).join("; "))); if (showAlt) ra.appendChild(el("div", "alt-en", q.acceptable.map(function (x) { return x.en; }).join("; "))); }
        else ra.appendChild(el("div", null, t("correctAnswer") + ": " + (a.correctText || "")));
      }
      item.appendChild(ra); rev.appendChild(item);
    });
    container.appendChild(rev); window.scrollTo(0, 0);
  }

  function init(elm) {
    container = elm;
    C.on(function () { // lang/state change: re-render whichever screen is active
      if (session && !session.finished) { session.lang = C.prefs.lang; renderQuestion(); }
      else if (session && session.finished) renderResults();
      else renderStart();
    });
    renderStart();
  }
  return { init: init };
})();
