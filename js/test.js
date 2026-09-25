/* Test Simulator — oral, self-graded practice using the same 128-question
   bank as flash cards. English-only stems and answers; recorded Q/A audio;
   student marks right/wrong. Full exam: 20 random, 12 to pass, stops at 12
   correct or 9 wrong. Topic drills and missed-question review kept. */
window.TestApp = (function () {
  "use strict";
  var C = window.CIV;
  var EXAM_SIZE = 20, PASS_NEEDED = 12, MAX_WRONG = EXAM_SIZE - PASS_NEEDED + 1, TTL = 7 * 24 * 60 * 60 * 1000;
  var SESSION_VER = 2;
  var container = null, pendingMode = null, pendingCat = null, session = null, revealed = false;

  function answerList(q) {
    var pairs = q.dynamic ? C.dynamicAnswers(q) : (q.acceptable || []);
    return pairs.map(function (p) { return p.en; }).filter(Boolean);
  }
  function joinAnswers(q) { return answerList(q).join("; "); }
  function buildQuestion(id) {
    var q = C.DATA.byId[id];
    return {
      id: id,
      cat: q.cat,
      dynamic: q.dynamic,
      prompt: q.q.en,
      answersEn: answerList(q)
    };
  }

  function buildQueue(mode, cat) {
    if (mode === "full") return C.sample(C.DATA.questions.map(function (q) { return q.id; }), EXAM_SIZE);
    if (mode === "category") return C.shuffle(C.DATA.questions.filter(function (q) { return q.cat === cat; }).map(function (q) { return q.id; }));
    if (mode === "missed") return C.shuffle(C.getMissed());
    return [];
  }
  function newSession(mode, cat) {
    return { version: SESSION_VER, mode: mode, cat: cat || null, state: C.prefs.state, district: C.prefs.district, lang: C.prefs.lang, queue: buildQueue(mode, cat), idx: 0, answers: {}, correct: 0, wrong: 0, finished: false, passed: null, createdAt: Date.now() };
  }
  function isGraded(s) { return s.mode === "full"; }
  function persist() { if (session) C.saveJSON(C.LS.session, session); }
  function examDecided(s) { return s.mode === "full" && (s.correct >= PASS_NEEDED || s.wrong >= MAX_WRONG); }
  function finishSession() { session.finished = true; if (session.mode === "full") session.passed = session.correct >= PASS_NEEDED; persist(); renderResults(); }
  function savedUsable(saved) {
    return saved && saved.version === SESSION_VER && !saved.finished && (Date.now() - saved.createdAt) < TTL && saved.queue && saved.queue.length;
  }

  var el = C.el, t = C.t;

  function renderStart() {
    C.cancelSpeech(); session = null; revealed = false; container.innerHTML = "";
    var head = el("div", "panel-head"); head.appendChild(el("div", "panel-title", t("tabTest"))); container.appendChild(head);

    var saved = C.loadJSON(C.LS.session, null);
    if (savedUsable(saved)) {
      var rc = el("div", "card"); rc.appendChild(el("div", "section-title", t("resumeTitle"))); rc.appendChild(el("p", "help", t("resumeBody")));
      var row = el("div", "btn-row");
      var yes = el("button", "btn primary", t("resume")); yes.onclick = function () { session = saved; renderQuestion(); };
      var no = el("button", "btn ghost", t("startNew")); no.onclick = function () { C.delKey(C.LS.session); renderStart(); };
      row.appendChild(yes); row.appendChild(no); rc.appendChild(row); container.appendChild(rc);
    } else if (saved) { C.delKey(C.LS.session); }

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
    C.cancelSpeech(); persist(); revealed = false;
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
    var qRow = el("div", "q-row");
    var qBtn = C.clipButton(q.id, "q", q.prompt);
    if (qBtn) qRow.appendChild(qBtn);
    qRow.appendChild(el("div", "qtext", q.prompt)); card.appendChild(qRow);
    card.appendChild(el("p", "help say-first", t("sayAnswerFirst")));

    if (C.TTS && C.loadJSON(C.LS.soundHint, null) !== 1) {
      var hint = el("div", "sound-hint"); hint.appendChild(el("span", null, "🔇 " + t("noSoundHint")));
      var x = el("button", "hint-x", "×"); x.type = "button"; x.setAttribute("aria-label", t("dismiss"));
      x.onclick = function () { C.saveJSON(C.LS.soundHint, 1); hint.remove(); }; hint.appendChild(x); card.appendChild(hint);
    }

    var revealHost = el("div"); revealHost.id = "test-reveal";
    var show = el("button", "btn primary", t("revealAnswer"));
    show.onclick = function () { renderAnswerPhase(revealHost, card, q); };
    revealHost.appendChild(el("div", "btn-row")).appendChild(show);
    card.appendChild(revealHost);
    container.appendChild(card); window.scrollTo(0, 0);
  }

  function renderAnswerPhase(host, card, q) {
    if (revealed) return; revealed = true;
    C.cancelSpeech();
    host.innerHTML = "";
    var block = el("div", "answer-block");
    var aRow = el("div", "q-row");
    var aText = q.answersEn.join("; ") || "—";
    var aBtn = C.clipButton(q.id, "a", aText);
    if (aBtn) aRow.appendChild(aBtn);
    var lab = el("div");
    lab.appendChild(el("div", "answer-label", t("allAcceptable")));
    lab.appendChild(el("div", "answer-en", aText));
    aRow.appendChild(lab);
    block.appendChild(aRow);
    host.appendChild(block);

    var grade = el("div", "grade-row");
    var yes = el("button", "btn grade-right", t("markRight"));
    var no = el("button", "btn grade-wrong", t("markWrong"));
    yes.onclick = function () { yes.disabled = no.disabled = true; recordAndAdvance(q, true); };
    no.onclick = function () { yes.disabled = no.disabled = true; recordAndAdvance(q, false); };
    grade.appendChild(yes); grade.appendChild(no);
    host.appendChild(grade);
  }

  function recordAndAdvance(q, ok) {
    session.answers[q.id] = { correct: ok, prompt: q.prompt, correctText: q.answersEn.join("; ") };
    if (ok) { session.correct++; C.removeMissed(q.id); }
    else { session.wrong++; C.addMissed(q.id); }
    persist();
    if (examDecided(session) || session.idx >= session.queue.length - 1) { finishSession(); return; }
    session.idx++;
    renderQuestion();
  }

  function renderResults() {
    C.cancelSpeech(); C.delKey(C.LS.session); container.innerHTML = "";
    var card = el("div", "card"), total = session.queue.length, answered = Object.keys(session.answers).length;
    if (session.mode === "full") {
      var hero = el("div", "result-hero " + (session.passed ? "pass" : "fail"));
      hero.appendChild(el("div", "big", session.passed ? t("passTitle") : t("failTitle")));
      var sn = el("div", "score-num"); sn.appendChild(document.createTextNode(session.correct)); var sm = el("small"); sm.textContent = " / " + total; sn.appendChild(sm); hero.appendChild(sn);
      hero.appendChild(el("p", "help", session.passed ? t("passBody") : t("failBody"))); card.appendChild(hero);
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
      var a = session.answers[id], item = el("div", "review-item"), q = C.DATA.byId[id];
      item.appendChild(el("div", "rq", (i + 1) + ". " + q.q.en));
      var ra = el("div", "ra");
      if (!a) ra.appendChild(el("span", "tag skip", t("skipped")));
      else {
        ra.appendChild(el("span", "tag " + (a.correct ? "ok" : "no"), (a.correct ? "✓ " : "✕ ") + (a.correct ? t("correct") : t("incorrect"))));
        ra.appendChild(el("div", null, t("allAcceptable") + ": " + (a.correctText || joinAnswers(q))));
      }
      item.appendChild(ra); rev.appendChild(item);
    });
    container.appendChild(rev); window.scrollTo(0, 0);
  }

  function init(elm) {
    container = elm;
    C.on(function () {
      if (session && !session.finished) { session.lang = C.prefs.lang; renderQuestion(); }
      else if (session && session.finished) renderResults();
      else renderStart();
    });
    renderStart();
  }
  return { init: init };
})();
