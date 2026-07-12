/* PersonaX Autofill - content script.
   Fills signup/sign-in forms with THIS profile's stable identity (held by the
   service worker). Same data every time - refreshing the page or moving to the
   next step never changes it. Press Alt+X, or let it auto-fill on Outlook signup. */

(function () {
  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---------- ask the background for the stable identity ----------
  function getIdentity() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "GET_IDENTITY" }, (resp) => {
          if (chrome.runtime.lastError || !resp) return resolve(null);
          resolve(resp.identity || null);
        });
      } catch (e) { resolve(null); }
    });
  }

  // ---------- setting values so React/Vue/Angular notice ----------
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
                : el.tagName === "SELECT"   ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const last = el.value;
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    if (el._valueTracker) el._valueTracker.setValue(last); // React
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isVisible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  }

  function fillSelect(el, candidates) {
    const opts = Array.from(el.options);
    for (const cand of candidates) {
      const w = String(cand).trim().toLowerCase();
      if (!w) continue;
      for (const opt of opts) {
        const label = (opt.textContent || "").trim().toLowerCase();
        const val = (opt.value || "").trim().toLowerCase();
        if (label === w || val === w) { setNativeValue(el, opt.value); return true; }
      }
    }
    // loose contains
    for (const cand of candidates) {
      const w = String(cand).trim().toLowerCase();
      if (!w || w.length < 2) continue;
      for (const opt of opts) {
        const label = (opt.textContent || "").trim().toLowerCase();
        if (label && (label.includes(w) || w.includes(label))) { setNativeValue(el, opt.value); return true; }
      }
    }
    return false;
  }

  // ---------- work out which logical field an input is ----------
  const RULES = {
    first_name:  [/first[\s_-]*name/i, /given[\s_-]*name/i, /\bfname\b/i, /^first$/i],
    last_name:   [/last[\s_-]*name/i, /family[\s_-]*name/i, /sur[\s_-]*name/i, /\blname\b/i, /^last$/i],
    full_name:   [/full[\s_-]*name/i, /^name$/i, /your[\s_-]*name/i, /display[\s_-]*name/i],
    username:    [/new[\s_-]*email/i, /usernameentry/i, /membername/i, /liveemail/i, /choose.*(username|email)/i, /pick.*(username|email)/i],
    email:       [/e-?mail/i, /user[\s_-]*name/i, /\blogin\b/i, /account[\s_-]*name/i],
    password:    [/pass[\s_-]*word/i, /\bpass\b/i, /\bpwd\b/i],
    dob_day:     [/\bday\b/i, /birth.*day/i, /\bbday-?day\b/i, /^dd$/i],
    dob_month:   [/\bmonth\b/i, /birth.*month/i, /^mm$/i],
    dob_year:    [/\byear\b/i, /birth.*year/i, /^yyyy$/i],
    country:     [/country/i, /region/i, /nation/i],
    gender:      [/gender/i, /\bsex\b/i]
  };
  const AUTOCOMPLETE = {
    "given-name": "first_name", "family-name": "last_name", "name": "full_name",
    "email": "email", "username": "email", "new-password": "password", "current-password": "password",
    "country": "country", "country-name": "country",
    "bday-day": "dob_day", "bday-month": "dob_month", "bday-year": "dob_year"
  };

  function labelText(el) {
    let t = "";
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) t += " " + l.textContent; }
    const wrap = el.closest("label"); if (wrap) t += " " + wrap.textContent;
    if (el.getAttribute("aria-label")) t += " " + el.getAttribute("aria-label");
    return t;
  }

  function fieldFor(el) {
    if (el.type === "password") return "password";
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (AUTOCOMPLETE[ac]) return AUTOCOMPLETE[ac];

    const hay = [el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"),
                 el.getAttribute("data-testid"), labelText(el)].filter(Boolean).join(" ");

    // "new email / choose a username" must beat the generic email rule
    if (RULES.username.some((rx) => rx.test(hay))) return "username";
    if (el.type === "email") return "email";

    for (const key of ["first_name","last_name","full_name","dob_day","dob_month","dob_year","country","gender","email"]) {
      if (RULES[key] && RULES[key].some((rx) => rx.test(hay))) return key;
    }
    return null;
  }

  function valueFor(field, id) {
    switch (field) {
      case "first_name": return id.first_name;
      case "last_name":  return id.last_name;
      case "full_name":  return id.full_name;
      case "username":   return id.username;      // Outlook "New email" box
      case "email":      return id.email;
      case "password":   return id.password;
      case "dob_year":   return id.dob_year;
      case "gender":     return id.gender;
      case "country":    return id.country;
      default: return null;
    }
  }

  // ---------- custom (Fluent / ARIA) dropdown handling for Outlook ----------
  async function pickAriaOption(wantedList) {
    // options render into a popup listbox anywhere in the DOM after the combobox opens
    for (let attempt = 0; attempt < 12; attempt++) {
      const opts = Array.from(document.querySelectorAll('[role="option"]')).filter(isVisible);
      if (opts.length) {
        for (const cand of wantedList) {
          const w = String(cand).trim().toLowerCase();
          const hit = opts.find((o) => (o.textContent || "").trim().toLowerCase() === w);
          if (hit) { hit.scrollIntoView({ block: "center" }); hit.click(); return true; }
        }
        for (const cand of wantedList) {
          const w = String(cand).trim().toLowerCase();
          if (w.length < 1) continue;
          const hit = opts.find((o) => (o.textContent || "").trim().toLowerCase().startsWith(w));
          if (hit) { hit.scrollIntoView({ block: "center" }); hit.click(); return true; }
        }
      }
      await sleep(150);
    }
    return false;
  }

  async function openAndPick(dropdown, wantedList) {
    if (!dropdown) return false;
    dropdown.click();
    await sleep(120);
    const ok = await pickAriaOption(wantedList);
    if (!ok) { // close the menu if we couldn't match, so we don't leave it open
      try { dropdown.click(); } catch (e) {}
    }
    return ok;
  }

  // Outlook / Microsoft signup uses Fluent comboboxes for month & day and a text
  // input for the year. Native <select> is used on older variants. Handle both.
  async function fillBirthdate(id, force) {
    let did = 0;

    // Fluent comboboxes (current signup.live.com)
    const monthDD = document.querySelector("#BirthMonthDropdown, [aria-label*='month' i][role='combobox'], [aria-label*='Birth month' i]");
    const dayDD   = document.querySelector("#BirthDayDropdown, [aria-label*='day' i][role='combobox'], [aria-label*='Birth day' i]");
    if (monthDD && monthDD.getAttribute("role") === "combobox") {
      if (await openAndPick(monthDD, [id.dob_month_name, id.dob_month])) did++;
    }
    if (dayDD && dayDD.getAttribute("role") === "combobox") {
      if (await openAndPick(dayDD, [id.dob_day])) did++;
    }

    // Native <select> variants
    const mSel = document.querySelector("select#BirthMonth, select[name='BirthMonth'], select[name*='month' i]");
    if (mSel && isVisible(mSel) && (force || !mSel.value || mSel.selectedIndex <= 0)) {
      if (fillSelect(mSel, [id.dob_month_name, id.dob_month, String(id.dob_month).padStart(2, "0")])) did++;
    }
    const dSel = document.querySelector("select#BirthDay, select[name='BirthDay'], select[name*='day' i]");
    if (dSel && isVisible(dSel) && (force || !dSel.value || dSel.selectedIndex <= 0)) {
      if (fillSelect(dSel, [id.dob_day, String(id.dob_day).padStart(2, "0")])) did++;
    }

    // Year - text input on Fluent, select on older
    const ySel = document.querySelector("select#BirthYear, select[name='BirthYear'], select[name*='year' i]");
    if (ySel && isVisible(ySel) && (force || !ySel.value || ySel.selectedIndex <= 0)) {
      if (fillSelect(ySel, [id.dob_year])) did++;
    } else {
      const yInput = document.querySelector("#floatingLabelInput21, input#BirthYear, input[name='BirthYear'], input[aria-label*='year' i]");
      if (yInput && isVisible(yInput) && (force || !yInput.value)) { setNativeValue(yInput, id.dob_year); did++; }
    }

    return did;
  }

  // ---------- main fill ----------
  async function autofill(id, force) {
    let filled = 0;
    const controls = Array.from(document.querySelectorAll("input, select, textarea"))
      .filter((el) => isVisible(el) && !["hidden","submit","button","checkbox","radio","file","image","reset"].includes(el.type));

    let emailSeen = 0;
    for (const el of controls) {
      let field = fieldFor(el);
      if (!field) continue;

      // day/month native selects handled in fillBirthdate; skip generic here to avoid double work
      if ((field === "dob_day" || field === "dob_month") && el.tagName === "SELECT") continue;

      // a second plain email box on signup is usually "confirm email"
      if (field === "email") { emailSeen++; }

      // don't clobber what the user already typed unless Alt+X (force)
      const hasVal = el.tagName === "SELECT" ? (el.selectedIndex > 0 && el.value) : !!el.value;
      if (hasVal && !force) continue;

      if (field === "dob_year" && el.tagName !== "SELECT") { setNativeValue(el, id.dob_year); filled++; continue; }

      if (el.tagName === "SELECT") {
        if (field === "country")      { if (fillSelect(el, [id.country, "United States", "US", "USA"])) filled++; }
        else if (field === "gender")  { if (fillSelect(el, [id.gender, id.gender === "Male" ? "M" : "F"])) filled++; }
        else if (field === "dob_year"){ if (fillSelect(el, [id.dob_year])) filled++; }
        else { const v = valueFor(field, id); if (v != null && fillSelect(el, [v])) filled++; }
        continue;
      }

      const v = valueFor(field, id);
      if (v == null || v === "") continue;
      setNativeValue(el, v);
      filled++;
    }

    filled += await fillBirthdate(id, force);
    return filled;
  }

  function toast(text, ok) {
    const d = document.createElement("div");
    d.textContent = text;
    Object.assign(d.style, {
      position: "fixed", zIndex: 2147483647, right: "16px", bottom: "16px",
      background: ok ? "#123a2a" : "#3a1220", color: ok ? "#4ade80" : "#ff8290",
      border: "1px solid " + (ok ? "#1f6b4a" : "#6b1f30"), padding: "10px 14px",
      borderRadius: "10px", font: "13px -apple-system,Segoe UI,Roboto,sans-serif",
      boxShadow: "0 6px 24px rgba(0,0,0,.4)", maxWidth: "320px"
    });
    (document.body || document.documentElement).appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }

  let running = false;
  async function run(force, quiet) {
    if (running) return;
    running = true;
    try {
      const id = await getIdentity();
      if (!id) { if (!quiet) toast("Autofill: identity not ready, try again", false); return; }
      const n = await autofill(id, force);
      if (!quiet) toast(n > 0 ? "Filled " + n + " field" + (n > 1 ? "s" : "") : "No matching fields on this page", n > 0);
    } finally { running = false; }
  }

  // ---------- triggers ----------
  // Alt+X from the background command …
  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === "AUTOFILL_NOW") run(true, false); });
  // … and a local Alt+X so it also works inside iframes.
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "x" || e.key === "X") && !e.repeat) { e.preventDefault(); run(true, false); }
  }, true);

  // Auto-fill (empty fields only, quietly) on Microsoft / Outlook signup so the
  // user doesn't have to do anything - it just works when the form appears.
  const AUTO_HOSTS = /(^|\.)(live|microsoftonline|outlook|office|microsoft)\.com$/i;
  if (AUTO_HOSTS.test(location.hostname)) {
    let lastRun = 0;
    const maybe = () => {
      const now = Date.now();
      if (now - lastRun < 800) return;
      // only if there is something worth filling
      const hasForm = document.querySelector(
        "input[type='password'], #usernameEntry, input[name='New email'], #BirthMonthDropdown, " +
        "#firstNameInput, #lastNameInput, input[type='email'], input[name='MemberName']"
      );
      if (!hasForm) return;
      lastRun = now;
      run(false, true);
    };
    if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(maybe, 400);
    window.addEventListener("load", () => setTimeout(maybe, 400));
    const obs = new MutationObserver(() => maybe());
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
