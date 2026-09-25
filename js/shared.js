/* Shared platform core: data, prefs, i18n, TTS (Samantha-locked), dynamic-question
   resolution, and small helpers used by the Vocabulary, Flash Cards, and Test modules. */
window.CIV = (function () {
  "use strict";

  var LS = { prefs: "civics_prefs", session: "civics_session", missed: "civics_missed", soundHint: "civics_soundhint", tab: "civics_tab" };
  var STATES = [
    { key: "virginia", label: "Virginia", districts: 11 },
    { key: "north_carolina", label: "North Carolina", districts: 14 },
    { key: "maryland", label: "Maryland", districts: 8 }
  ];
  var NAME_POOLS = {
    president: ["Joe Biden", "Barack Obama", "George W. Bush", "Kamala Harris"],
    vice_president: ["Kamala Harris", "Mike Pence", "Joe Biden", "Al Gore"],
    speaker: ["Nancy Pelosi", "Hakeem Jeffries", "Kevin McCarthy", "Paul Ryan"],
    chief_justice: ["Clarence Thomas", "Sonia Sotomayor", "Samuel Alito", "Neil Gorsuch"]
  };
  var CAPITAL_EXTRA = ["Charlotte", "Baltimore", "Norfolk", "Arlington", "Columbia", "Wilmington"];
  var GOVERNOR_EXTRA = ["Glenn Youngkin (Republican)", "Larry Hogan (Republican)", "Ralph Northam (Democrat)", "Pat McCrory (Republican)"];

  var prefs = { lang: "en", state: "virginia", zip: "", district: null };
  var DATA = { questions: [], categories: [], byId: {}, poolByCat: {}, officeholders: null, stateLocal: null, vocab: null, audioById: {}, vocabAudio: { reading: {}, writing: {} } };
  var ZIPDB = {};
  var subs = [];

  // ---- helpers ----
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function t(key, vars) { var s = (window.I18N[prefs.lang] && window.I18N[prefs.lang][key]) || (window.I18N.en && window.I18N.en[key]) || key; if (vars) for (var k in vars) s = s.replace("{" + k + "}", vars[k]); return s; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; } return a; }
  function sample(a, n) { return shuffle(a).slice(0, n); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function loadJSON(k, f) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function delKey(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function getMissed() { var m = loadJSON(LS.missed, []); return Array.isArray(m) ? m : []; }
  function addMissed(id) { var m = getMissed(); if (m.indexOf(id) === -1) { m.push(id); saveJSON(LS.missed, m); } }
  function removeMissed(id) { saveJSON(LS.missed, getMissed().filter(function (x) { return x !== id; })); }

  // ---- pub/sub (lang/state changes -> modules re-render) ----
  function on(fn) { subs.push(fn); }
  function emit() { subs.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // ---- prefs setters ----
  function savePrefs() { saveJSON(LS.prefs, prefs); }
  function setLang(l) { prefs.lang = l; savePrefs(); emit(); }
  function setState(s) { prefs.state = s; prefs.district = null; prefs.zip = ""; savePrefs(); emit(); }
  function setZip(z) { prefs.zip = z; savePrefs(); }
  function setDistrict(d) { prefs.district = d; savePrefs(); emit(); }

  // ---- TTS + recorded clips (Samantha-locked TTS as fallback) ----
  var TTS = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);
  var speakBtnActive = null, currentUtterance = null, voicesReady = false;
  var currentAudio = null, audioWatch = null;
  var GOOD_VOICE = /google|natural|enhanced|premium|neural|siri|ava|allison|samantha|karen|daniel|moira|tessa/i;
  function englishVoices() { return TTS ? (window.speechSynthesis.getVoices() || []).filter(function (v) { return /^en/i.test(v.lang); }) : []; }
  function pickVoice() {
    var vs = englishVoices(); if (!vs.length) return null;
    var sam = vs.filter(function (v) { return /samantha/i.test(v.name); })[0];
    if (sam) return sam;
    var good = vs.filter(function (v) { return /^en[-_]US/i.test(v.lang) && GOOD_VOICE.test(v.name); })[0];
    return good || vs.filter(function (v) { return /^en[-_]US/i.test(v.lang); })[0] || vs[0];
  }
  function stopRecorded() {
    if (audioWatch) { try { clearInterval(audioWatch); } catch (e) {} audioWatch = null; }
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.removeAttribute("src"); currentAudio.load(); } catch (e) {}
      currentAudio = null;
    }
  }
  function cancelSpeech() {
    if (TTS) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    currentUtterance = null;
    stopRecorded();
    if (speakBtnActive) { speakBtnActive.classList.remove("speaking"); speakBtnActive = null; }
  }
  function speak(text, btn) {
    if (!TTS || !text) return;
    if (speakBtnActive === btn) { cancelSpeech(); return; }
    cancelSpeech();
    var u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = 0.9;
    var v = pickVoice(); if (v) u.voice = v;
    u.onend = u.onerror = function () { if (btn) btn.classList.remove("speaking"); if (speakBtnActive === btn) speakBtnActive = null; if (currentUtterance === u) currentUtterance = null; };
    currentUtterance = u; speakBtnActive = btn || null; if (btn) btn.classList.add("speaking");
    try { window.speechSynthesis.speak(u); } catch (e) { cancelSpeech(); }
  }
  function clipFor(id) { return DATA.audioById[id] || null; }
  function playRange(url, start, end, btn) {
    if (speakBtnActive === btn) { cancelSpeech(); return; }
    cancelSpeech();
    var a = new Audio(url);
    a.preload = "auto";
    currentAudio = a;
    speakBtnActive = btn || null;
    if (btn) btn.classList.add("speaking");
    function done() {
      if (audioWatch) { try { clearInterval(audioWatch); } catch (e) {} audioWatch = null; }
      if (currentAudio === a) {
        try { a.pause(); } catch (e) {}
        currentAudio = null;
      }
      if (speakBtnActive === btn) {
        if (btn) btn.classList.remove("speaking");
        speakBtnActive = null;
      }
    }
    function doPlay() {
      var p = a.play();
      if (p && p.catch) p.catch(function () { done(); });
    }
    function seekAndPlay() {
      var from = start || 0;
      if (from <= 0.02) { doPlay(); return; }
      function onSeek() { a.removeEventListener("seeked", onSeek); doPlay(); }
      a.addEventListener("seeked", onSeek);
      try { a.currentTime = from; } catch (e) { doPlay(); }
    }
    a.addEventListener("ended", done);
    a.addEventListener("error", done);
    if (end != null) {
      audioWatch = setInterval(function () {
        if (!currentAudio || currentAudio !== a) { done(); return; }
        if (a.currentTime >= end - 0.04) done();
      }, 40);
    }
    if (a.readyState >= 1) seekAndPlay();
    else a.addEventListener("loadedmetadata", seekAndPlay);
  }
  // side is "q" (front) or "a" (back). Falls back to TTS when there is no clip for that side.
  function playClip(id, side, btn, fallbackText) {
    var clip = clipFor(id);
    if (clip && side === "q" && clip.q) { playRange(clip.file, clip.q[0], clip.q[1], btn); return; }
    if (clip && side === "a" && clip.a) { playRange(clip.file, clip.a[0], clip.a[1], btn); return; }
    speak(fallbackText, btn);
  }
  function speakButton(text) {
    var b = el("button", "speak-btn", "🔊"); b.type = "button";
    b.setAttribute("aria-label", t("readAloud")); b.title = t("readAloud");
    b.onclick = function (e) { e.stopPropagation(); speak(text, b); };
    return b;
  }
  function clipButton(id, side, fallbackText) {
    var clip = clipFor(id);
    var hasRec = clip && ((side === "q" && clip.q) || (side === "a" && clip.a));
    if (!hasRec && !TTS) return null;
    var b = el("button", "speak-btn" + (hasRec ? " rec" : ""), "🔊"); b.type = "button";
    b.setAttribute("aria-label", t("readAloud")); b.title = hasRec ? t("playRecording") : t("readAloud");
    b.onclick = function (e) { e.stopPropagation(); playClip(id, side, b, fallbackText); };
    return b;
  }
  function vocabFile(list, word) {
    var map = DATA.vocabAudio && DATA.vocabAudio[list];
    return (map && map[word]) || null;
  }
  function playVocab(list, word, btn) {
    var file = vocabFile(list, word);
    if (file) { playRange(encodeURI(file), 0, null, btn); return; }
    speak(word, btn);
  }

  // ---- state / district / ZIP ----
  function stateByKey(k) { return STATES.filter(function (s) { return s.key === k; })[0] || STATES[0]; }
  function districtCount(k) { return stateByKey(k).districts; }
  function resolveZip(stateKey, zip) { var tbl = ZIPDB[stateKey]; if (!tbl) return null; var d = tbl[String(zip).trim()]; return (typeof d === "number") ? d : null; }

  // ---- dynamic question resolution ----
  function names(pool) { return pool.map(function (n) { return { en: n, es: n }; }); }
  // For the TEST: one correct + distractors.
  function resolveDynamic(q) {
    var off = DATA.officeholders.questions, sl = DATA.stateLocal, state = prefs.state, district = prefs.district;
    function oh(k, p) { return { correct: { en: off[k].answer_en, es: off[k].answer_es }, distractors: names(p) }; }
    switch (q.dynamic) {
      case "president": return oh("q38_president", NAME_POOLS.president);
      case "vice_president": return oh("q39_vice_president", NAME_POOLS.vice_president);
      case "speaker": return oh("q30_speaker_of_the_house", NAME_POOLS.speaker);
      case "chief_justice": return oh("q57_chief_justice", NAME_POOLS.chief_justice);
      case "senator": {
        var others = []; STATES.forEach(function (s) { if (s.key !== state) sl[s.key].us_senators.forEach(function (o) { others.push({ en: o.en, es: o.es }); }); });
        return { correct: pick(sl[state].us_senators), distractors: others };
      }
      case "governor": {
        var og = STATES.filter(function (s) { return s.key !== state; }).map(function (s) { return { en: sl[s.key].governor.en, es: sl[s.key].governor.es }; });
        return { correct: { en: sl[state].governor.en, es: sl[state].governor.es }, distractors: og.concat(names(GOVERNOR_EXTRA)) };
      }
      case "capital": {
        var oc = STATES.filter(function (s) { return s.key !== state; }).map(function (s) { return { en: sl[s.key].state_capital.en, es: sl[s.key].state_capital.es }; });
        return { correct: { en: sl[state].state_capital.en, es: sl[state].state_capital.es }, distractors: oc.concat(names(CAPITAL_EXTRA)) };
      }
      case "representative": {
        var reps = sl[state].us_representatives_by_district, d = String(district || 1);
        var correct = reps[d] ? { en: reps[d].en, es: reps[d].es } : { en: "—", es: "—" };
        var orp = Object.keys(reps).filter(function (kk) { return kk !== d; }).map(function (kk) { return { en: reps[kk].en, es: reps[kk].es }; });
        return { correct: correct, distractors: shuffle(orp) };
      }
    }
    return { correct: { en: "—", es: "—" }, distractors: [] };
  }
  // For FLASH CARDS: all correct answers for the current state/district.
  function dynamicAnswers(q) {
    var off = DATA.officeholders.questions, sl = DATA.stateLocal, state = prefs.state, district = prefs.district;
    switch (q.dynamic) {
      case "president": return [{ en: off.q38_president.answer_en, es: off.q38_president.answer_es }];
      case "vice_president": return [{ en: off.q39_vice_president.answer_en, es: off.q39_vice_president.answer_es }];
      case "speaker": return [{ en: off.q30_speaker_of_the_house.answer_en, es: off.q30_speaker_of_the_house.answer_es }];
      case "chief_justice": return [{ en: off.q57_chief_justice.answer_en, es: off.q57_chief_justice.answer_es }];
      case "senator": return sl[state].us_senators.map(function (o) { return { en: o.en, es: o.es }; });
      case "governor": return [{ en: sl[state].governor.en, es: sl[state].governor.es }];
      case "capital": return [{ en: sl[state].state_capital.en, es: sl[state].state_capital.es }];
      case "representative": {
        var reps = sl[state].us_representatives_by_district;
        if (!district) return [{ en: t("dynNeedDistrict"), es: t("dynNeedDistrict") }];
        return reps[String(district)] ? [{ en: reps[String(district)].en, es: reps[String(district)].es }] : [];
      }
    }
    return [];
  }

  // ---- distractor pool (same-category answers, excluding this question's acceptable) ----
  function buildPoolByCat() {
    DATA.poolByCat = {};
    DATA.questions.forEach(function (q) {
      if (q.dynamic || !q.acceptable) return;
      (DATA.poolByCat[q.cat] = DATA.poolByCat[q.cat] || []).push.apply(DATA.poolByCat[q.cat], q.acceptable.map(function (a) { return { en: a.en, es: a.es, qid: q.id }; }));
    });
  }

  // ---- boot ----
  function load(done) {
    prefs = loadJSON(LS.prefs, prefs) || prefs;
    if (["virginia", "north_carolina", "maryland"].indexOf(prefs.state) === -1) prefs.state = "virginia";
    if (!prefs.lang) prefs.lang = "en";
    if (TTS) { voicesReady = window.speechSynthesis.getVoices().length > 0; window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); if (!voicesReady) { voicesReady = true; emit(); } }; }
    Promise.all([
      fetch("data/questions.json").then(function (r) { return r.json(); }),
      fetch("data/current_officeholders.json").then(function (r) { return r.json(); }),
      fetch("data/state_local_lookup.json").then(function (r) { return r.json(); }),
      fetch("data/zip_districts.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch("data/vocab.json").then(function (r) { return r.json(); }),
      fetch("data/audio_manifest.json").then(function (r) { return r.ok ? r.json() : { clips: [] }; }).catch(function () { return { clips: [] }; }),
      fetch("data/vocab_audio.json").then(function (r) { return r.ok ? r.json() : { reading: {}, writing: {} }; }).catch(function () { return { reading: {}, writing: {} }; })
    ]).then(function (res) {
      DATA.questions = res[0].questions; DATA.categories = res[0].categories;
      DATA.questions.forEach(function (q) { DATA.byId[q.id] = q; });
      DATA.officeholders = res[1]; DATA.stateLocal = res[2]; ZIPDB = res[3] || {}; DATA.vocab = res[4];
      DATA.audioById = {};
      (res[5].clips || []).forEach(function (c) { DATA.audioById[c.id] = c; });
      DATA.vocabAudio = { reading: res[6].reading || {}, writing: res[6].writing || {} };
      buildPoolByCat();
      done();
    }).catch(function (err) { done(err); });
  }

  return {
    LS: LS, STATES: STATES, prefs: prefs, DATA: DATA,
    el: el, t: t, shuffle: shuffle, sample: sample, pick: pick,
    loadJSON: loadJSON, saveJSON: saveJSON, delKey: delKey,
    getMissed: getMissed, addMissed: addMissed, removeMissed: removeMissed,
    on: on, emit: emit, setLang: setLang, setState: setState, setZip: setZip, setDistrict: setDistrict,
    TTS: TTS, speak: speak, cancelSpeech: cancelSpeech, speakButton: speakButton,
    clipFor: clipFor, playClip: playClip, clipButton: clipButton,
    vocabFile: vocabFile, playVocab: playVocab,
    stateByKey: stateByKey, districtCount: districtCount, resolveZip: resolveZip,
    resolveDynamic: resolveDynamic, dynamicAnswers: dynamicAnswers,
    load: load, lang: function () { return prefs.lang; }
  };
})();
