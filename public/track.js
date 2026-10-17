/* cointax 사용 기록 — 랜딩(/beta)·앱(/)·대시보드(/dash)가 함께 쓴다.
   남기는 것: page, event, 시각, utm_source(없으면 direct), 익명 번호(브라우저별 랜덤), 작은 meta.
   남기지 않는 것: 이름·연락처·금액·코인명. 설정(/config.js)이 없으면 콘솔에만 쌓인다. */
(function () {
  var cfg = window.CT_CONFIG || {};
  var ENDPOINT = cfg.supabaseUrl ? cfg.supabaseUrl + "/rest/v1/cointax_events" : "";
  var KEY = cfg.supabaseKey || "";

  function anonId() {
    try {
      var a = localStorage.getItem("ct_anon");
      if (!a) { a = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); localStorage.setItem("ct_anon", a); }
      return a;
    } catch (e) { return "na" + Math.random().toString(36).slice(2, 8); }
  }
  function utmSource() {
    var s = "";
    try { s = new URLSearchParams(location.search).get("utm_source") || ""; } catch (e) {}
    try {
      if (s) sessionStorage.setItem("ct_utm", s); else s = sessionStorage.getItem("ct_utm") || "";
    } catch (e) {}
    return (s || "direct").slice(0, 32).replace(/[^a-z0-9_-]/gi, "");
  }
  var ANON = anonId(), UTM = utmSource(), sent = {};

  function track(page, event, meta, once) {
    var k = page + ":" + event;
    if (once && sent[k]) return;
    sent[k] = true;
    var row = { page: page, event: event, utm_source: UTM, anon: ANON, meta: meta || {} };
    try { (window.ct_log = window.ct_log || []).push(row); } catch (e) {}
    if (!ENDPOINT || !KEY) return;
    try {
      fetch(ENDPOINT, {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + KEY, "Prefer": "return=minimal" },
        body: JSON.stringify(row)
      }).catch(function () {});
    } catch (e) {}
  }
  window.ctTrack = track;
  window.ctUtm = UTM;
  window.ctWithUtm = function (base) {
    if (!UTM || UTM === "direct") return base;
    return base + (base.indexOf("?") > -1 ? "&" : "?") + "utm_source=" + encodeURIComponent(UTM) + "&utm_medium=landing&utm_campaign=beta";
  };
})();
