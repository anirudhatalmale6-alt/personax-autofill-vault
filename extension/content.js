/* Runs in every page. On Alt+X (relayed from the background, or caught locally in
   an iframe) it asks the vault for this profile's data and fills the visible form. */

(function () {
  // ---- how the extension knows which profile it is in ----
  // Default: the profileId saved in the popup (per-profile, since each PersonaX
  // profile is an isolated browser). Optional auto-detect hooks are tried first
  // so that if PersonaX ever exposes the id, it just works.
  function detectProfileId() {
    try {
      // 1) a global some antidetect browsers inject
      if (window.__PERSONAX_PROFILE_ID__) return String(window.__PERSONAX_PROFILE_ID__).trim().toUpperCase();
      // 2) ?profile=AAA0001 in the url (the PersonaX startup page carries this)
      const q = new URLSearchParams(location.search).get('profile') || new URLSearchParams(location.search).get('id');
      if (q) return q.trim().toUpperCase();
    } catch (e) {}
    return ''; // fall back to the stored profileId in background
  }

  // When a page tells us which profile this is (the startup page uses ?profile=AAA0002),
  // remember it. From then on Alt+X works on every later page with no popup setup at all.
  (function captureProfileFromPage() {
    try {
      const id = detectProfileId();
      if (id && chrome.storage && chrome.storage.local) chrome.storage.local.set({ profileId: id });
    } catch (e) {}
  })();

  // Secure bridge for the PersonaX startup page only: it may ask us to show this
  // profile's stored email/password. The vault key stays in the background worker —
  // it never touches the page. Restricted to the vault's own origin.
  try {
    const TRUSTED = ['https://personax.work', 'http://127.0.0.1:4600', 'http://localhost:4600'];
    if (TRUSTED.indexOf(location.origin) !== -1) {
      const reply = (id) => {
        chrome.runtime.sendMessage({ type: 'GET_PROFILE', profileId: id }, (resp) => {
          window.postMessage({ type: 'PX_PROFILE_RESULT', resp: resp || { error: 'no response' } }, location.origin);
        });
      };
      // answer explicit requests …
      window.addEventListener('message', (e) => {
        if (e.source !== window || e.origin !== location.origin) return;
        const m = e.data;
        if (!m || m.type !== 'PX_REQUEST_PROFILE') return;
        reply((m.profileId && String(m.profileId).trim().toUpperCase()) || detectProfileId());
      });
      // … and push proactively on the startup page so there's no race if our
      // listener wasn't ready when the page first asked.
      if (window.top === window) { const id = detectProfileId(); if (id) reply(id); }
    }
  } catch (e) {}

  // ---- field matching ----
  // Score how well an input matches a logical field, using every hint the page gives.
  const RULES = {
    first_name:     [/first[\s_-]*name/i, /given[\s_-]*name/i, /\bfname\b/i, /^first$/i],
    last_name:      [/last[\s_-]*name/i, /family[\s_-]*name/i, /sur[\s_-]*name/i, /\blname\b/i, /^last$/i],
    email:          [/e-?mail/i, /user[\s_-]*name/i, /\blogin\b/i, /account[\s_-]*name/i],
    password:       [/pass[\s_-]*word/i, /\bpass\b/i, /\bpwd\b/i],
    recovery_email: [/recovery/i, /alt(ernate)?[\s_-]*e-?mail/i, /backup[\s_-]*e-?mail/i, /second(ary)?[\s_-]*e-?mail/i],
    phone:          [/phone/i, /mobile/i, /\btel\b/i, /contact[\s_-]*number/i],
    dob_day:        [/\bday\b/i, /birth.*day/i, /dob.*d/i, /^bd$/i],
    dob_month:      [/\bmonth\b/i, /birth.*month/i],
    dob_year:       [/\byear\b/i, /birth.*year/i],
    country:        [/country/i, /region/i, /nation/i]
  };
  const AUTOCOMPLETE = {
    'given-name': 'first_name', 'family-name': 'last_name', 'email': 'email',
    'username': 'email', 'new-password': 'password', 'current-password': 'password',
    'tel': 'phone', 'tel-national': 'phone', 'country': 'country', 'country-name': 'country',
    'bday-day': 'dob_day', 'bday-month': 'dob_month', 'bday-year': 'dob_year'
  };

  function labelTextFor(el) {
    let t = '';
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) t += ' ' + l.textContent;
    }
    const wrap = el.closest('label'); if (wrap) t += ' ' + wrap.textContent;
    if (el.getAttribute('aria-label')) t += ' ' + el.getAttribute('aria-label');
    return t;
  }

  function fieldFor(el) {
    // password inputs are unambiguous
    if (el.type === 'password') return 'password';
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (AUTOCOMPLETE[ac]) return AUTOCOMPLETE[ac];

    const hay = [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'),
                 el.getAttribute('data-testid'), labelTextFor(el)].filter(Boolean).join(' ');
    // a recovery / secondary email must be recognised BEFORE the generic type=email rule,
    // otherwise a field named "recoveryEmail" gets treated as the primary email.
    if (RULES.recovery_email.some(rx => rx.test(hay))) return 'recovery_email';

    if (el.type === 'email') return 'email';
    if (el.type === 'tel') return 'phone';

    for (const key of ['first_name','last_name','dob_day','dob_month','dob_year','country','phone','email']) {
      if (RULES[key] && RULES[key].some(rx => rx.test(hay))) return key;
    }
    return null;
  }

  // set a value in a way React/Vue/Angular controlled inputs also notice
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                : el.tagName === 'SELECT'   ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillSelect(el, wanted) {
    const w = String(wanted).trim().toLowerCase();
    for (const opt of el.options) {
      const label = (opt.textContent || '').trim().toLowerCase();
      const val = (opt.value || '').trim().toLowerCase();
      if (label === w || val === w) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    }
    // loose contains match (e.g. "Philippines (+63)")
    for (const opt of el.options) {
      const label = (opt.textContent || '').trim().toLowerCase();
      if (label && (label.includes(w) || w.includes(label)) && label.length > 1) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    }
    return false;
  }

  function isVisible(el) {
    if (el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function autofill(profile) {
    const controls = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(el => isVisible(el) && !['hidden','submit','button','checkbox','radio','file','image','reset'].includes(el.type));

    let filled = 0;
    const usedEmail = { count: 0 };
    for (const el of controls) {
      let field = fieldFor(el);
      if (!field) continue;
      // second email box on a signup page is usually the recovery/confirm email
      if (field === 'email') { usedEmail.count++; if (usedEmail.count === 2 && profile.recovery_email) field = 'recovery_email'; }
      const value = profile[field];
      if (value === undefined || value === null || value === '') continue;

      if (el.tagName === 'SELECT') { if (fillSelect(el, value)) filled++; }
      else { setNativeValue(el, value); filled++; }
    }
    return filled;
  }

  function toast(text, ok) {
    const d = document.createElement('div');
    d.textContent = text;
    Object.assign(d.style, {
      position: 'fixed', zIndex: 2147483647, right: '16px', bottom: '16px',
      background: ok ? '#123a2a' : '#3a1220', color: ok ? '#4ade80' : '#ff8290',
      border: '1px solid ' + (ok ? '#1f6b4a' : '#6b1f30'), padding: '10px 14px',
      borderRadius: '10px', font: '13px -apple-system,Segoe UI,Roboto,sans-serif',
      boxShadow: '0 6px 24px rgba(0,0,0,.4)', maxWidth: '320px'
    });
    document.documentElement.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }

  function run() {
    const profileId = detectProfileId();
    chrome.runtime.sendMessage({ type: 'GET_PROFILE', profileId }, (resp) => {
      if (chrome.runtime.lastError) { toast('Autofill: ' + chrome.runtime.lastError.message, false); return; }
      if (!resp || resp.error) { toast('Autofill: ' + (resp ? resp.error : 'no response'), false); return; }
      const n = autofill(resp.profile);
      toast(n > 0 ? 'Filled ' + n + ' field' + (n > 1 ? 's' : '') + ' for ' + resp.profile.profile_id
                  : 'No matching fields found on this page', n > 0);
    });
  }

  // relayed from background (top frame) …
  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'AUTOFILL_NOW') run(); });
  // … and a local Alt+X listener so it also works inside iframes / if the command doesn't reach us
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'x' || e.key === 'X') && !e.repeat) { e.preventDefault(); run(); }
  }, true);
})();
