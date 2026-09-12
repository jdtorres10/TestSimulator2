/* Flash Cards module — the 128 Q&A as study cards. English primary with Spanish
   underneath on both sides; all acceptable answers on the back; read-aloud both sides;
   tap to flip; shuffle; filter by category; includes dynamic (state-specific) cards. */
window.FlashApp = (function () {
  "use strict";
  var C = window.CIV;
  var container = null;
  var cat = "", shuffled = false, order = [], idx = 0, flipped = false;

  function buildDeck() {
    var ids = C.DATA.questions.filter(function (q) { return !cat || q.cat === cat; }).map(function (q) { return q.id; });
    ids.sort(function (a, b) { return a - b; });
    order = shuffled ? C.shuffle(ids) : ids;
    idx = 0; flipped = false;
  }
  function answerPairs(q) { return q.dynamic ? C.dynamicAnswers(q) : q.acceptable; }
  function joinLang(pairs, lang) { return pairs.map(function (p) { return p[lang]; }).join("; "); }

  function render() {
    if (!container) return;
    if (!order.length) buildDeck();
    container.innerHTML = "";

    var head = C.el("div", "panel-head");
    head.appendChild(C.el("div", "panel-title", C.t("tabFlash")));
    container.appendChild(head);

    // controls
    var ctrl = C.el("div", "flash-ctrl");
    var home = C.el("button", "btn ghost tiny", "← " + C.t("backHome"));
    home.onclick = function () { cat = ""; shuffled = false; buildDeck(); render(); };
    ctrl.appendChild(home);

    var sel = C.el("select");
    var optAll = C.el("option", null, C.t("allCategories")); optAll.value = ""; sel.appendChild(optAll);
    C.DATA.categories.forEach(function (c) { var o = C.el("option", null, c[C.prefs.lang] || c.en); o.value = c.key; if (c.key === cat) o.selected = true; sel.appendChild(o); });
    sel.onchange = function () { cat = sel.value; buildDeck(); render(); };
    ctrl.appendChild(sel);

    var shuf = C.el("button", "btn ghost tiny" + (shuffled ? " on" : ""), "🔀 " + C.t("shuffle"));
    shuf.onclick = function () { shuffled = !shuffled; buildDeck(); render(); };
    ctrl.appendChild(shuf);

    var count = C.el("span", "flash-count", (idx + 1) + " / " + order.length);
    ctrl.appendChild(count);
    container.appendChild(ctrl);

    // card
    var q = C.DATA.byId[order[idx]];
    var catObj = C.DATA.categories.filter(function (c) { return c.key === q.cat; })[0];
    var card = C.el("div", "flash-card" + (flipped ? " flipped" : ""));
    card.onclick = function () { flipped = !flipped; render(); };

    var topRow = C.el("div", "flash-card-top");
    topRow.appendChild(C.el("span", "flash-badge", flipped ? C.t("answerLabel") : (catObj ? (catObj[C.prefs.lang] || catObj.en) : "")));
    if (C.TTS) {
      var speakText = flipped ? joinLang(answerPairs(q), "en") : q.q.en;
      topRow.appendChild(C.speakButton(speakText));
    }
    card.appendChild(topRow);

    if (!flipped) {
      card.appendChild(C.el("div", "flash-en", q.q.en));
      card.appendChild(C.el("div", "flash-es", q.q.es));
    } else {
      var pairs = answerPairs(q);
      card.appendChild(C.el("div", "flash-en", joinLang(pairs, "en")));
      card.appendChild(C.el("div", "flash-es", joinLang(pairs, "es")));
    }
    card.appendChild(C.el("div", "flash-flip-hint", flipped ? C.t("tapFlipBack") : C.t("tapToFlip")));
    container.appendChild(card);

    // prev / next
    var nav = C.el("div", "flash-nav");
    var prev = C.el("button", "btn ghost tiny", "‹ " + C.t("prev"));
    prev.disabled = idx === 0;
    prev.onclick = function (e) { e.stopPropagation(); if (idx > 0) { idx--; flipped = false; render(); } };
    var next = C.el("button", "btn ghost tiny", C.t("nextCard") + " ›");
    next.disabled = idx >= order.length - 1;
    next.onclick = function (e) { e.stopPropagation(); if (idx < order.length - 1) { idx++; flipped = false; render(); } };
    nav.appendChild(prev); nav.appendChild(next);
    container.appendChild(nav);
  }

  function init(el) {
    container = el;
    C.on(function () { buildDeck(); render(); }); // lang/state change -> rebuild (dynamic answers may change)
    buildDeck(); render();
  }
  return { init: init, render: render };
})();
