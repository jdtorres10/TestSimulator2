/* Platform shell: boots shared data, wires the language toggle and the shared
   location bar, initializes the three modules, and manages tabs (mobile) /
   columns (desktop). Column order: Vocabulary | Flash Cards | Test Simulator. */
(function () {
  "use strict";
  var C = window.CIV;
  var TABS = [
    { key: "vocab", panel: "vocab-panel", label: "tabVocab", ico: "📖" },
    { key: "flash", panel: "flash-panel", label: "tabFlash", ico: "🃏" },
    { key: "test", panel: "test-panel", label: "tabTest", ico: "📝" }
  ];

  function $(id) { return document.getElementById(id); }

  function renderHeader() {
    $("appTitle").textContent = C.t("appTitle");
    $("tagline").textContent = C.t("tagline");
    $("footerText").textContent = C.t("footer");
    $("langEn").setAttribute("aria-pressed", C.prefs.lang === "en");
    $("langEs").setAttribute("aria-pressed", C.prefs.lang === "es");
  }

  function renderTabs() {
    var bar = $("tabbar"), active = $("cols").dataset.active;
    bar.innerHTML = "";
    TABS.forEach(function (tab) {
      var b = C.el("button", "tab" + (tab.key === active ? " on" : ""));
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", tab.key === active);
      b.appendChild(C.el("span", "tab-ico", tab.ico)); b.appendChild(document.createTextNode(" " + C.t(tab.label)));
      b.onclick = function () { $("cols").dataset.active = tab.key; C.saveJSON(C.LS.tab, tab.key); renderTabs(); };
      bar.appendChild(b);
    });
  }

  function renderLocationBar() {
    var bar = $("location-bar"); bar.innerHTML = "";
    bar.appendChild(C.el("span", "loc-label", C.t("stateLegend")));
    C.STATES.forEach(function (s) {
      var chip = C.el("button", "chip" + (C.prefs.state === s.key ? " selected" : ""), s.label);
      chip.onclick = function () { C.setState(s.key); };
      bar.appendChild(chip);
    });
    var st = C.stateByKey(C.prefs.state);
    var zip = C.el("input", "zip-input"); zip.type = "text"; zip.inputMode = "numeric"; zip.maxLength = 5; zip.placeholder = C.t("zipPlaceholder"); zip.value = C.prefs.zip || "";
    var msg = C.el("span", "zip-msg");
    var sel = C.el("select", "district-select");
    function fillSel() {
      sel.innerHTML = ""; var ph = C.el("option", null, C.t("selectDistrict")); ph.value = ""; sel.appendChild(ph);
      for (var i = 1; i <= st.districts; i++) { var o = C.el("option", null, C.t("district") + " " + i); o.value = String(i); if (Number(C.prefs.district) === i) o.selected = true; sel.appendChild(o); }
    }
    fillSel();
    sel.onchange = function () { C.setDistrict(sel.value ? parseInt(sel.value, 10) : null); };
    zip.oninput = function () {
      var z = zip.value.replace(/[^0-9]/g, "").slice(0, 5); zip.value = z; C.setZip(z); msg.textContent = ""; msg.className = "zip-msg";
      if (z.length === 5) {
        var d = C.resolveZip(C.prefs.state, z);
        if (d && d >= 1 && d <= st.districts) { C.setDistrict(d); msg.textContent = C.t("zipFound", { n: d }); msg.className = "zip-msg ok"; }
        else { msg.textContent = C.t("zipNotFound"); msg.className = "zip-msg warn"; }
      }
    };
    if ((C.prefs.zip || "").length === 5) {
      var zd = C.resolveZip(C.prefs.state, C.prefs.zip);
      if (zd && zd >= 1 && zd <= st.districts) { msg.textContent = C.t("zipFound", { n: zd }); msg.className = "zip-msg ok"; }
      else { msg.textContent = C.t("zipNotFound"); msg.className = "zip-msg warn"; }
    }
    bar.appendChild(zip); bar.appendChild(sel); bar.appendChild(msg);
  }

  function boot() {
    C.load(function (err) {
      if (err) { $("cols").innerHTML = '<div class="card"><div class="section-title">Could not load data</div><p class="help">Serve this over http (GitHub Pages or a local server).</p></div>'; return; }
      // restore last tab
      var savedTab = C.loadJSON(C.LS.tab, "vocab");
      if (TABS.map(function (t) { return t.key; }).indexOf(savedTab) === -1) savedTab = "vocab";
      $("cols").dataset.active = savedTab;
      // language toggle
      $("langEn").onclick = function () { C.setLang("en"); };
      $("langEs").onclick = function () { C.setLang("es"); };
      // shared chrome re-renders on lang/state change
      C.on(function () { renderHeader(); renderTabs(); renderLocationBar(); });
      renderHeader(); renderTabs(); renderLocationBar();
      // modules (each subscribes to CIV.on internally for re-render)
      window.VocabApp.init($("vocab-panel"));
      window.FlashApp.init($("flash-panel"));
      window.TestApp.init($("test-panel"));
    });
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
