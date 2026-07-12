/* PersonaX Autofill - force English.
   Some proxies / regions make Microsoft signup load in Chinese or another
   language. Microsoft picks the language from the "mkt" query parameter, so we
   pin it to en-US before the page renders. Runs once (no reload loop). */
(function () {
  try {
    var h = location.hostname || "";
    if (!/(^|\.)(live|signup|login|account|microsoftonline|outlook|office|microsoft)\.com$/i.test(h)) return;
    var u = new URL(location.href);
    if (u.searchParams.get("mkt") !== "en-US") {
      u.searchParams.set("mkt", "en-US");
      location.replace(u.toString());
    }
  } catch (e) {}
})();
