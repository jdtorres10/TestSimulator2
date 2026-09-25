/* Vocabulary module — the two official USCIS lists (Reading / Writing), English only,
   binned by category, each word tappable to hear it read aloud. */
window.VocabApp = (function () {
  "use strict";
  var C = window.CIV;
  var container = null;
  var whichList = "reading";

  function render() {
    if (!container) return;
    var v = C.DATA.vocab; if (!v) return;
    var lang = C.prefs.lang;
    container.innerHTML = "";

    var head = C.el("div", "panel-head");
    head.appendChild(C.el("div", "panel-title", C.t("tabVocab")));
    head.appendChild(C.el("p", "help", C.t("vocabHelp")));
    container.appendChild(head);

    // Reading / Writing toggle
    var seg = C.el("div", "seg");
    [["reading", v.reading], ["writing", v.writing]].forEach(function (pair) {
      var b = C.el("button", "seg-btn" + (whichList === pair[0] ? " on" : ""), pair[1]["label_" + lang] || pair[1].label_en);
      b.type = "button";
      b.onclick = function () { whichList = pair[0]; render(); };
      seg.appendChild(b);
    });
    container.appendChild(seg);

    var list = v[whichList];
    var grid = C.el("div", "vocab-grid");
    list.categories.forEach(function (cat) {
      var card = C.el("div", "vocab-cat");
      card.appendChild(C.el("div", "vocab-cat-name", (cat[lang] || cat.en)));
      var chips = C.el("div", "vocab-chips");
      cat.words.forEach(function (w) {
        var hasRec = !!C.vocabFile(whichList, w);
        var chip = C.el("button", "vocab-chip" + (hasRec ? " rec" : ""));
        chip.type = "button";
        chip.appendChild(C.el("span", null, w));
        if (hasRec || C.TTS) { var ic = C.el("span", "chip-spk"); ic.textContent = "🔊"; chip.appendChild(ic); }
        chip.onclick = function () { C.playVocab(whichList, w, chip); };
        chips.appendChild(chip);
      });
      card.appendChild(chips);
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  function init(el) { container = el; C.on(render); render(); }
  return { init: init, render: render };
})();
