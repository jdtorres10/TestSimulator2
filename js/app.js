/* USCIS Civics Test Simulator 2 — exam engine (vanilla JS, no build).
   Multiple-choice only. Correct answer rotates among the source's acceptable answers;
   distractors are auto-generated from other same-category answers. Scope: VA / NC / MD. */
(function () {
  "use strict";

  // ---- Config ----
  var EXAM_SIZE = 20;
  var PASS_NEEDED = 12;
  var MAX_WRONG = EXAM_SIZE - PASS_NEEDED + 1; // 9 wrong -> can't reach 12
  var SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
  var LS = { session: "civics_session", missed: "civics_missed", prefs: "civics_prefs", soundHint: "civics_soundhint" };

  var STATES = [
    { key: "virginia", label: "Virginia", districts: 11 },
    { key: "north_carolina", label: "North Carolina", districts: 14 },
    { key: "maryland", label: "Maryland", districts: 8 }
  ];
  function stateByKey(k) { return STATES.filter(function (s) { return s.key === k; })[0] || STATES[0]; }

  // Distractor pools for nationwide current-officeholder questions.
  var NAME_POOLS = {
    president: ["Joe Biden", "Barack Obama", "George W. Bush", "Kamala Harris"],
    vice_president: ["Kamala Harris", "Mike Pence", "Joe Biden", "Al Gore"],
    speaker: ["Nancy Pelosi", "Hakeem Jeffries", "Kevin McCarthy", "Paul Ryan"],
    chief_justice: ["Clarence Thomas", "Sonia Sotomayor", "Samuel Alito", "Neil Gorsuch"]
  };
  var CAPITAL_EXTRA = ["Charlotte", "Baltimore", "Norfolk", "Arlington", "Columbia", "Wilmington"];
  var GOVERNOR_EXTRA = ["Glenn Youngkin (Republican)", "Larry Hogan (Republican)", "Ralph Northam (Democrat)", "Pat McCrory (Republican)"];

  // ---- App state ----
  var DATA = { questions: [], categories: [], byId: {}, officeholders: null, stateLocal: null, poolByCat: {} };
  var ZIPDB = {}; // { stateKey: { "22301": 8, ... } } — optional, loaded if present
  var lang = "en";
  var prefs = { lang: "en", state: "virginia", zip: "", district: null, voiceURI: null };
  var pendingMode = null, pendingCat = null, session = null;

  // ---- Utilities ----
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function t(key, vars) { var s = (window.I18N[lang] && window.I18N[lang][key]) || key; if (vars) for (var k in vars) s = s.replace("{" + k + "}", vars[k]); return s; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; } return a; }
  function sample(a, n) { return shuffle(a).slice(0, n); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function loadJSON(key, fallback) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function delKey(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function getMissed() { var m = loadJSON(LS.missed, []); return Array.isArray(m) ? m : []; }
  function addMissed(id) { var m = getMissed(); if (m.indexOf(id) === -1) { m.push(id); saveJSON(LS.missed, m); } }
  function removeMissed(id) { saveJSON(LS.missed, getMissed().filter(function (x) { return x !== id; })); }

  // ---- Text-to-speech (Web Speech API, always English for oral-test practice) ----
  var TTS = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);
  var speakBtnActive = null, currentUtterance = null, voicesReady = false;
  function cancelSpeech() {
    if (TTS) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    currentUtterance = null;
    if (speakBtnActive) { speakBtnActive.classList.remove("speaking"); speakBtnActive = null; }
  }
  var GOOD_VOICE = /google|natural|enhanced|premium|neural|siri|samantha|ava|allison|aaron|nicky|tom|alex|zoe|serena|karen|daniel|moira|tessa/i;
  var BAD_VOICE = /compact|fred|albert|zarvox|junior|ralph|kathy|bad news|good news|bells|bahh|boing|bubbles|cellos|wobble|whisper|trinoids|organ|jester|superstar|grandma|grandpa|rocko|shelley|reed|sandy|flo|eddy/i;
  function englishVoices() { return TTS ? (window.speechSynthesis.getVoices() || []).filter(function (v) { return /^en/i.test(v.lang); }) : []; }
  function rankVoice(v) { var s = /^en[-_]US/i.test(v.lang) ? 3 : 1; if (GOOD_VOICE.test(v.name)) s += 6; if (BAD_VOICE.test(v.name)) s -= 8; if (v.localService === false) s += 2; return s; }
  function rankedEnglishVoices() { return englishVoices().slice().sort(function (a, b) { return rankVoice(b) - rankVoice(a); }); }
  function pickEnglishVoice() {
    var vs = englishVoices(); if (!vs.length) return null;
    if (prefs.voiceURI) { var c = vs.filter(function (v) { return v.voiceURI === prefs.voiceURI; })[0]; if (c) return c; }
    return rankedEnglishVoices()[0];
  }
  function speakText(text, btn) {
    if (!TTS || !text) return;
    var synth = window.speechSynthesis;
    if (speakBtnActive === btn) { cancelSpeech(); return; }
    cancelSpeech();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.9;
    var v = pickEnglishVoice(); if (v) u.voice = v;
    u.onend = u.onerror = function () { btn.classList.remove("speaking"); if (speakBtnActive === btn) speakBtnActive = null; if (currentUtterance === u) currentUtterance = null; };
    currentUtterance = u; speakBtnActive = btn; btn.classList.add("speaking");
    try { synth.speak(u); } catch (e) { cancelSpeech(); }
  }

  // ---- Distractor pool (auto-generated from same-category acceptable answers) ----
  function buildPoolByCat() {
    DATA.poolByCat = {};
    DATA.questions.forEach(function (q) {
      if (q.dynamic || !q.acceptable) return;
      var arr = DATA.poolByCat[q.cat] || (DATA.poolByCat[q.cat] = []);
      q.acceptable.forEach(function (a) { arr.push({ en: a.en, es: a.es, qid: q.id }); });
    });
  }
  // 3 distractors from the same category, excluding any answer acceptable for THIS question.
  function autoDistractors(q) {
    var exclude = {};
    q.acceptable.forEach(function (a) { exclude[a.en.toLowerCase()] = true; });
    var seen = {}, pool = [];
    (DATA.poolByCat[q.cat] || []).forEach(function (p) {
      var key = p.en.toLowerCase();
      if (p.qid === q.id || exclude[key] || seen[key]) return;
      seen[key] = true; pool.push({ en: p.en, es: p.es });
    });
    return sample(pool, 3);
  }

  // ---- Dynamic questions (current officeholder / state-specific) ----
  // Returns { correct:{en,es}, distractors:[{en,es}] }
  function resolveDynamic(q, sess) {
    var off = DATA.officeholders.questions, sl = DATA.stateLocal, state = sess.state, district = sess.district;
    function names(pool) { return pool.map(function (n) { return { en: n, es: n }; }); }
    function officeholder(k, pool) { return { correct: { en: off[k].answer_en, es: off[k].answer_es }, distractors: names(pool) }; }
    switch (q.dynamic) {
      case "president": return officeholder("q38_president", NAME_POOLS.president);
      case "vice_president": return officeholder("q39_vice_president", NAME_POOLS.vice_president);
      case "speaker": return officeholder("q30_speaker_of_the_house", NAME_POOLS.speaker);
      case "chief_justice": return officeholder("q57_chief_justice", NAME_POOLS.chief_justice);
      case "senator": {
        var sens = sl[state].us_senators;
        var others = [];
        STATES.forEach(function (s) { if (s.key !== state) sl[s.key].us_senators.forEach(function (o) { others.push({ en: o.en, es: o.es }); }); });
        return { correct: pick(sens), distractors: others };
      }
      case "governor": {
        var others2 = STATES.filter(function (s) { return s.key !== state; }).map(function (s) { return { en: sl[s.key].governor.en, es: sl[s.key].governor.es }; });
        return { correct: { en: sl[state].governor.en, es: sl[state].governor.es }, distractors: others2.concat(names(GOVERNOR_EXTRA)) };
      }
      case "capital": {
        var otherCaps = STATES.filter(function (s) { return s.key !== state; }).map(function (s) { return { en: sl[s.key].state_capital.en, es: sl[s.key].state_capital.es }; });
        return { correct: { en: sl[state].state_capital.en, es: sl[state].state_capital.es }, distractors: otherCaps.concat(names(CAPITAL_EXTRA)) };
      }
      case "representative": {
        var reps = sl[state].us_representatives_by_district;
        var d = String(district || 1);
        var correct = reps[d] ? { en: reps[d].en, es: reps[d].es } : { en: "—", es: "—" };
        var others3 = Object.keys(reps).filter(function (kk) { return kk !== d; }).map(function (kk) { return { en: reps[kk].en, es: reps[kk].es }; });
        return { correct: correct, distractors: shuffle(others3) };
      }
    }
    return { correct: { en: "—", es: "—" }, distractors: [] };
  }

  // ---- Build a render-ready question ----
  function optionObj(pair) { var showAlt = (lang === "es"); return { en: pair.en, es: pair.es, text: pair[lang], alt: (showAlt && pair.en !== pair.es) ? pair.en : null }; }
  function buildQuestion(id, sess) {
    var q = DATA.byId[id];
    var showAlt = (lang === "es");
    var correct, distractors;
    if (q.dynamic) { var r = resolveDynamic(q, sess); correct = r.correct; distractors = r.distractors; }
    else { correct = pick(q.acceptable); distractors = autoDistractors(q); }
    // assemble 4 options
    var opts = [correct].concat(sample(distractors, 3)).map(optionObj);
    opts = shuffle(opts);
    var answer = 0; for (var i = 0; i < opts.length; i++) { if (opts[i].en === correct.en) { answer = i; break; } }
    return {
      id: id, cat: q.cat, dynamic: q.dynamic,
      prompt: q.q[lang], promptAlt: showAlt ? q.q.en : null,
      options: opts, answer: answer,
      correctText: correct[lang], correctAlt: showAlt ? correct.en : null,
      acceptableAll: q.acceptable // for optional "also accepted" display
    };
  }

  // ---- Session lifecycle ----
  function buildQueue(mode, cat) {
    if (mode === "full") return sample(DATA.questions.map(function (q) { return q.id; }), EXAM_SIZE);
    if (mode === "category") return shuffle(DATA.questions.filter(function (q) { return q.cat === cat; }).map(function (q) { return q.id; }));
    if (mode === "missed") return shuffle(getMissed());
    return [];
  }
  function newSession(mode, cat) {
    return { mode: mode, cat: cat || null, state: prefs.state, district: prefs.district, lang: lang,
      queue: buildQueue(mode, cat), idx: 0, answers: {}, correct: 0, wrong: 0, finished: false, passed: null, createdAt: Date.now() };
  }
  function isGraded(s) { return s.mode === "full"; }
  function persist() { if (session) saveJSON(LS.session, session); }
  function examDecided(s) { return s.mode === "full" && (s.correct >= PASS_NEEDED || s.wrong >= MAX_WRONG); }
  function finishSession() { session.finished = true; if (session.mode === "full") session.passed = session.correct >= PASS_NEEDED; persist(); renderResults(); }

  // ---- ZIP -> district ----
  function districtCount(stateKey) { return stateByKey(stateKey).districts; }
  function resolveZip(stateKey, zip) {
    var tbl = ZIPDB[stateKey]; if (!tbl) return null;
    var d = tbl[String(zip).trim()];
    return (typeof d === "number") ? d : null;
  }

  // ---- Rendering ----
  var app = $("#app");
  function renderHeader() {
    $("#langEn").setAttribute("aria-pressed", lang === "en");
    $("#langEs").setAttribute("aria-pressed", lang === "es");
    $("#appTitle").textContent = t("appTitle");
    $("#tagline").textContent = t("tagline");
    $("#footerText").textContent = t("footer");
  }

  function renderStart() {
    cancelSpeech(); session = null; renderHeader(); app.innerHTML = "";
    var saved = loadJSON(LS.session, null);
    if (saved && !saved.finished && (Date.now() - saved.createdAt) < SESSION_TTL_MS && saved.queue && saved.queue.length) {
      var rc = el("div", "card");
      rc.appendChild(el("div", "section-title", t("resumeTitle")));
      rc.appendChild(el("p", "help", t("resumeBody")));
      var row = el("div", "btn-row");
      var yes = el("button", "btn primary", t("resume"));
      yes.onclick = function () { session = saved; lang = saved.lang || lang; renderQuestion(); };
      var no = el("button", "btn ghost", t("startNew"));
      no.onclick = function () { delKey(LS.session); renderStart(); };
      row.appendChild(yes); row.appendChild(no); rc.appendChild(row); app.appendChild(rc);
    } else if (saved && saved.finished) { delKey(LS.session); }

    var card = el("div", "card");
    card.appendChild(el("div", "section-title", t("chooseMode")));
    var modes = el("div", "modes");
    [{ key: "full", ico: "📝", title: "fullExam", desc: "fullExamDesc" },
     { key: "category", ico: "📚", title: "categoryDrill", desc: "categoryDrillDesc" },
     { key: "missed", ico: "🔁", title: "missedReview", desc: "missedReviewDesc" }].forEach(function (d) {
      var b = el("button", "mode-btn"); b.dataset.mode = d.key;
      var h = el("h3"); h.appendChild(el("span", "ico", d.ico)); h.appendChild(document.createTextNode(t(d.title)));
      b.appendChild(h); b.appendChild(el("p", null, t(d.desc)));
      b.onclick = function () { pendingMode = d.key; renderStart2(); };
      if (pendingMode === d.key) b.classList.add("selected");
      modes.appendChild(b);
    });
    card.appendChild(modes); app.appendChild(card);
    renderStart2Container();
    renderVoicePicker();
  }

  function renderVoicePicker() {
    if (!TTS) return;
    var card = el("div", "card");
    card.appendChild(el("div", "section-title", "🔊 " + t("audioVoice")));
    card.appendChild(el("p", "help", t("audioVoiceHelp")));
    var voices = rankedEnglishVoices();
    if (!voices.length) { card.appendChild(el("p", "help", t("voicesLoading"))); app.appendChild(card); return; }
    var sel = el("select");
    var activeURI = (pickEnglishVoice() || {}).voiceURI;
    voices.forEach(function (v) { var o = el("option", null, v.name + " — " + v.lang + (v.localService === false ? " ☁︎" : "")); o.value = v.voiceURI; if (v.voiceURI === activeURI) o.selected = true; sel.appendChild(o); });
    sel.onchange = function () { prefs.voiceURI = sel.value; saveJSON(LS.prefs, prefs); };
    var preview = el("button", "btn secondary", t("previewVoice")); preview.type = "button";
    preview.onclick = function () { if (sel.value) prefs.voiceURI = sel.value; speakText(t("voiceSample"), preview); };
    var wrap = el("div", "voice-row"); wrap.appendChild(sel); wrap.appendChild(preview); card.appendChild(wrap); app.appendChild(card);
  }

  var start2Host;
  function renderStart2Container() { start2Host = el("div"); start2Host.id = "start2"; app.appendChild(start2Host); if (pendingMode) renderStart2(); }

  function renderStart2() {
    document.querySelectorAll(".mode-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.mode === pendingMode); });
    start2Host.innerHTML = "";
    if (pendingMode === "missed") {
      var m = getMissed(); var card0 = el("div", "card");
      if (!m.length) card0.appendChild(el("p", "help", t("noMissed")));
      else { card0.appendChild(el("p", "help", t("missedReviewDesc"))); var b0 = el("button", "btn primary", t("startMissed")); b0.onclick = function () { session = newSession("missed"); persist(); renderQuestion(); }; card0.appendChild(b0); }
      start2Host.appendChild(card0); return;
    }
    var card = el("div", "card");
    if (pendingMode === "category") {
      card.appendChild(el("div", "section-title", t("pickCategory")));
      var grid = el("div", "cat-grid");
      DATA.categories.forEach(function (c) {
        var b = el("button", "mode-btn");
        var count = DATA.questions.filter(function (q) { return q.cat === c.key; }).length;
        b.appendChild(el("h3", null, c[lang]));
        b.appendChild(el("p", null, c.range.replace("-", "–") + " · " + count + (lang === "es" ? " preguntas" : " questions")));
        b.onclick = function () { pendingCat = c.key; renderStart2(); };
        if (pendingCat === c.key) b.classList.add("selected");
        grid.appendChild(b);
      });
      card.appendChild(grid);
    }
    var needsState = (pendingMode === "full") || (pendingMode === "category" && pendingCat === "system");
    if (needsState) {
      var fs = el("fieldset"); fs.appendChild(el("legend", null, t("stateLegend"))); fs.appendChild(el("p", "help", t("stateHelp")));
      var sg = el("div", "state-grid");
      STATES.forEach(function (s) {
        var chip = el("button", "chip", s.label);
        chip.onclick = function () { prefs.state = s.key; prefs.district = null; prefs.zip = ""; saveJSON(LS.prefs, prefs); renderStart2(); };
        if (prefs.state === s.key) chip.classList.add("selected");
        sg.appendChild(chip);
      });
      fs.appendChild(sg); card.appendChild(fs);
      card.appendChild(renderDistrictFieldset());
    }
    var startBtn = el("button", "btn primary"); startBtn.id = "startBtn";
    startBtn.textContent = pendingMode === "category" ? t("startDrill") : t("startExam");
    startBtn.onclick = function () { session = newSession(pendingMode, pendingCat); persist(); renderQuestion(); };
    var row = el("div", "btn-row"); row.appendChild(startBtn); card.appendChild(row);
    start2Host.appendChild(card); refreshStartBtn();
  }

  function renderDistrictFieldset() {
    var st = stateByKey(prefs.state);
    var fd = el("fieldset");
    fd.appendChild(el("legend", null, t("districtLegend", { state: st.label })));
    fd.appendChild(el("p", "help", t("districtHelp")));
    // ZIP input
    var zipRow = el("div", "zip-row");
    var zipInput = el("input"); zipInput.type = "text"; zipInput.inputMode = "numeric"; zipInput.maxLength = 5;
    zipInput.placeholder = t("zipPlaceholder"); zipInput.value = prefs.zip || "";
    zipInput.className = "zip-input";
    var zipMsg = el("span", "zip-msg");
    var sel = el("select"); sel.className = "district-select";
    function fillSelect() {
      sel.innerHTML = "";
      var ph = el("option", null, t("selectDistrict")); ph.value = ""; sel.appendChild(ph);
      for (var i = 1; i <= st.districts; i++) { var o = el("option", null, t("district") + " " + i); o.value = String(i); if (prefs.district === i) o.selected = true; sel.appendChild(o); }
    }
    fillSelect();
    sel.onchange = function () { prefs.district = sel.value ? parseInt(sel.value, 10) : null; saveJSON(LS.prefs, prefs); refreshStartBtn(); };
    zipInput.oninput = function () {
      var z = zipInput.value.replace(/[^0-9]/g, "").slice(0, 5); zipInput.value = z; prefs.zip = z;
      zipMsg.textContent = ""; zipMsg.className = "zip-msg";
      if (z.length === 5) {
        var d = resolveZip(prefs.state, z);
        if (d && d >= 1 && d <= st.districts) { prefs.district = d; fillSelect(); zipMsg.textContent = t("zipFound", { n: d }); zipMsg.className = "zip-msg ok"; }
        else { zipMsg.textContent = t("zipNotFound"); zipMsg.className = "zip-msg warn"; }
      }
      saveJSON(LS.prefs, prefs); refreshStartBtn();
    };
    zipRow.appendChild(zipInput); zipRow.appendChild(zipMsg);
    fd.appendChild(zipRow);
    fd.appendChild(el("p", "help", t("districtConfirm")));
    fd.appendChild(sel);
    return fd;
  }

  function refreshStartBtn() {
    var b = $("#startBtn"); if (!b) return;
    var ok = true;
    if (pendingMode === "category" && !pendingCat) ok = false;
    var needsState = (pendingMode === "full") || (pendingMode === "category" && pendingCat === "system");
    if (needsState && !prefs.district) ok = false; // district required for all states
    b.disabled = !ok;
  }

  function renderQuestion() {
    cancelSpeech(); renderHeader(); persist();
    if (session.idx >= session.queue.length) { finishSession(); return; }
    var q = buildQuestion(session.queue[session.idx], session);
    app.innerHTML = "";
    var total = session.queue.length;
    var card = el("div", "card");

    var topbar = el("div", "q-topbar");
    var backBtn = el("button", "btn ghost tiny", "← " + t("backHome"));
    backBtn.onclick = function () { if (window.confirm(t("backConfirm"))) { cancelSpeech(); delKey(LS.session); session = null; pendingMode = null; pendingCat = null; renderStart(); } };
    var endBtn = el("button", "btn ghost tiny", t("endExam"));
    endBtn.onclick = function () { if (window.confirm(t("endConfirm"))) finishSession(); };
    topbar.appendChild(backBtn); topbar.appendChild(endBtn); card.appendChild(topbar);

    var ph = el("div", "progress-head");
    ph.appendChild(el("span", "qnum", t("questionOf", { n: session.idx + 1, total: total })));
    if (isGraded(session)) ph.appendChild(el("span", "score", t("scoreSoFar", { c: session.correct })));
    card.appendChild(ph);
    var bar = el("div", "bar"); var span = el("span"); span.style.width = (session.idx / total * 100) + "%"; bar.appendChild(span); card.appendChild(bar);

    if (q.dynamic) card.appendChild(el("span", "badge dyn", t("dynamicBadge")));

    var englishPrompt = q.promptAlt || q.prompt;
    var qRow = el("div", "q-row");
    if (TTS) {
      var speakBtn = el("button", "speak-btn", "🔊"); speakBtn.type = "button";
      speakBtn.setAttribute("aria-label", t("readAloud")); speakBtn.title = t("readAloud");
      speakBtn.onclick = function () { speakText(englishPrompt, speakBtn); };
      qRow.appendChild(speakBtn);
    }
    qRow.appendChild(el("div", "qtext", q.prompt)); card.appendChild(qRow);
    if (q.promptAlt) card.appendChild(el("div", "qsub alt-en", q.promptAlt));

    if (TTS && loadJSON(LS.soundHint, null) !== 1) {
      var hint = el("div", "sound-hint"); hint.appendChild(el("span", null, "🔇 " + t("noSoundHint")));
      var x = el("button", "hint-x", "×"); x.type = "button"; x.setAttribute("aria-label", t("dismiss")); x.title = t("dismiss");
      x.onclick = function () { saveJSON(LS.soundHint, 1); hint.remove(); };
      hint.appendChild(x); card.appendChild(hint);
    }

    renderMC(card, q);
    app.appendChild(card); window.scrollTo(0, 0);
  }

  function feedbackBlock(correct, q) {
    var fb = el("div", "feedback " + (correct ? "ok" : "no"));
    var v = el("div", "verdict"); v.appendChild(document.createTextNode((correct ? "✓ " : "✕ ") + (correct ? t("correct") : t("incorrect")))); fb.appendChild(v);
    var off = el("div", "official"); off.appendChild(el("b", null, t("correctAnswer") + ": ")); off.appendChild(document.createTextNode(q.correctText)); fb.appendChild(off);
    if (q.correctAlt) fb.appendChild(el("div", "official alt-en", q.correctAlt));
    // For questions with several acceptable answers, list them all (study aid).
    if (q.acceptableAll && q.acceptableAll.length > 1) {
      var all = el("div", "official all-acc");
      all.appendChild(el("b", null, t("allAcceptable") + ": "));
      all.appendChild(document.createTextNode(q.acceptableAll.map(function (a) { return a[lang]; }).join("; ")));
      fb.appendChild(all);
      if (lang === "es") fb.appendChild(el("div", "official alt-en", q.acceptableAll.map(function (a) { return a.en; }).join("; ")));
    }
    return fb;
  }

  function recordAnswer(q, isCorrect, choice) {
    session.answers[q.id] = { correct: isCorrect, choice: choice, prompt: q.prompt, correctText: q.correctText };
    if (isCorrect) session.correct++; else session.wrong++;
    // "Missed" = most recent attempt: right removes it, wrong (re)adds it — in every mode.
    if (isCorrect) removeMissed(q.id); else addMissed(q.id);
    persist();
  }

  function advanceControls(card) {
    var row = el("div", "btn-row");
    var last = session.idx >= session.queue.length - 1, decided = examDecided(session);
    var btn = el("button", "btn primary", (last || decided) ? t("finish") : t("next"));
    btn.onclick = function () { if (decided) { finishSession(); return; } session.idx++; if (session.idx >= session.queue.length) finishSession(); else renderQuestion(); };
    row.appendChild(btn); card.appendChild(row);
  }

  function renderMC(card, q) {
    var opts = el("div", "options"); var answered = false;
    q.options.forEach(function (opt, i) {
      var b = el("button", "opt");
      b.appendChild(el("span", "mark", String.fromCharCode(65 + i)));
      var body = el("div", "opt-body"); body.appendChild(el("span", null, opt.text)); if (opt.alt) body.appendChild(el("span", "alt-en", opt.alt)); b.appendChild(body);
      b.onclick = function () {
        if (answered) return; answered = true;
        var correct = (i === q.answer);
        Array.prototype.forEach.call(opts.children, function (child, ci) { child.disabled = true; if (ci === q.answer) child.classList.add("correct"); if (ci === i && !correct) child.classList.add("wrong"); });
        recordAnswer(q, correct, i);
        card.appendChild(feedbackBlock(correct, q));
        advanceControls(card);
      };
      opts.appendChild(b);
    });
    card.appendChild(opts);
  }

  function renderResults() {
    cancelSpeech(); renderHeader(); delKey(LS.session); app.innerHTML = "";
    var card = el("div", "card"); var total = session.queue.length; var answeredCount = Object.keys(session.answers).length;
    if (session.mode === "full") {
      var hero = el("div", "result-hero " + (session.passed ? "pass" : "fail"));
      hero.appendChild(el("div", "big", session.passed ? t("passTitle") : t("failTitle")));
      var sn = el("div", "score-num"); sn.appendChild(document.createTextNode(session.correct)); var sm = el("small"); sm.textContent = " / " + total; sn.appendChild(sm); hero.appendChild(sn);
      hero.appendChild(el("p", "help", t("passNeeded"))); card.appendChild(hero);
      if (examDecided(session) && answeredCount < total) { var note = el("div", "info-card"); note.textContent = t("endedEarly"); card.appendChild(note); }
    } else {
      var hero2 = el("div", "result-hero");
      hero2.appendChild(el("div", "big", session.mode === "category" ? t("drillDone") : t("missedDone")));
      var sn2 = el("div", "score-num"); sn2.appendChild(document.createTextNode(session.correct)); var sm2 = el("small"); sm2.textContent = " / " + answeredCount; sn2.appendChild(sm2); hero2.appendChild(sn2); card.appendChild(hero2);
      if (session.mode === "missed" && !getMissed().length) { var cleared = el("div", "feedback ok"); cleared.appendChild(el("div", "verdict", "✓ " + t("missedCleared"))); card.appendChild(cleared); }
    }
    var row = el("div", "btn-row");
    if (session.mode === "full") { var again = el("button", "btn primary", t("retake")); again.onclick = function () { session = newSession("full"); persist(); renderQuestion(); }; row.appendChild(again); }
    if (getMissed().length) { var rm = el("button", "btn secondary", t("reviewMissedBtn")); rm.onclick = function () { pendingMode = "missed"; session = newSession("missed"); persist(); renderQuestion(); }; row.appendChild(rm); }
    var home = el("button", "btn ghost", t("home")); home.onclick = function () { pendingMode = null; pendingCat = null; renderStart(); }; row.appendChild(home);
    card.appendChild(row); app.appendChild(card);

    var rev = el("div", "card"); rev.appendChild(el("div", "section-title", t("reviewAnswers")));
    session.queue.forEach(function (id, i) {
      var a = session.answers[id]; var item = el("div", "review-item"); var q = DATA.byId[id]; var showAlt = (lang === "es");
      item.appendChild(el("div", "rq", (i + 1) + ". " + q.q[lang]));
      if (showAlt) item.appendChild(el("div", "alt-en", q.q.en));
      var ra = el("div", "ra");
      if (!a) { ra.appendChild(el("span", "tag skip", t("skipped"))); }
      else {
        ra.appendChild(el("span", "tag " + (a.correct ? "ok" : "no"), (a.correct ? "✓ " : "✕ ") + (a.correct ? t("correct") : t("incorrect"))));
        if (q.acceptable && q.acceptable.length > 1) {
          ra.appendChild(el("div", null, t("allAcceptable") + ": " + q.acceptable.map(function (x) { return x[lang]; }).join("; ")));
          if (showAlt) ra.appendChild(el("div", "alt-en", q.acceptable.map(function (x) { return x.en; }).join("; ")));
        } else {
          ra.appendChild(el("div", null, t("correctAnswer") + ": " + (a.correctText || "")));
        }
      }
      item.appendChild(ra); rev.appendChild(item);
    });
    app.appendChild(rev); window.scrollTo(0, 0);
  }

  function setLang(l) {
    lang = l; prefs.lang = l; saveJSON(LS.prefs, prefs);
    if (session && !session.finished) { session.lang = l; renderQuestion(); }
    else if (session && session.finished) { renderResults(); }
    else renderStart();
  }

  function boot() {
    prefs = loadJSON(LS.prefs, prefs) || prefs;
    if (["virginia", "north_carolina", "maryland"].indexOf(prefs.state) === -1) prefs.state = "virginia";
    lang = prefs.lang || "en";
    $("#langEn").onclick = function () { setLang("en"); };
    $("#langEs").onclick = function () { setLang("es"); };
    if (TTS) { voicesReady = window.speechSynthesis.getVoices().length > 0; window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); if (!voicesReady) { voicesReady = true; if (!session) renderStart(); } }; }

    Promise.all([
      fetch("data/questions.json").then(function (r) { return r.json(); }),
      fetch("data/current_officeholders.json").then(function (r) { return r.json(); }),
      fetch("data/state_local_lookup.json").then(function (r) { return r.json(); }),
      fetch("data/zip_districts.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (res) {
      DATA.questions = res[0].questions; DATA.categories = res[0].categories;
      DATA.questions.forEach(function (q) { DATA.byId[q.id] = q; });
      DATA.officeholders = res[1]; DATA.stateLocal = res[2]; ZIPDB = res[3] || {};
      buildPoolByCat();
      renderStart();
    }).catch(function (err) {
      app.innerHTML = ""; var c = el("div", "card");
      c.appendChild(el("div", "section-title", "Could not load question data"));
      c.appendChild(el("p", "help", "This app must be served over http (GitHub Pages or a local server). See README."));
      c.appendChild(el("p", "help", String(err))); app.appendChild(c);
    });
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
