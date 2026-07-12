const DEFAULTS = { serverUrl: 'https://personax.work/outlook', vaultKey: '', profileId: '' };
const $ = (id) => document.getElementById(id);

let current = {};

function status(msg, ok) { const s = $('st'); s.className = 'st ' + (ok ? 'ok' : 'err'); s.textContent = msg || ''; }

function showAccount(p) {
  current = { email: p.email || '', password: p.password || '', recovery: p.recovery_email || '' };
  $('hid').textContent = p.profile_id || '';
  $('vProfile').textContent = p.profile_id || '—';
  $('vEmail').textContent = p.email || '—';
  $('vPass').textContent = p.password || '—';
  if (p.recovery_email) { $('vRec').textContent = p.recovery_email; $('rRec').style.display = 'flex'; }
  else { $('rRec').style.display = 'none'; }
}

function loadAccount() {
  chrome.storage.local.get(DEFAULTS, (c) => {
    const id = (c.profileId || '').trim().toUpperCase();
    $('profileId').value = id;
    $('serverUrl').value = c.serverUrl || DEFAULTS.serverUrl;
    $('vaultKey').value = c.vaultKey || '';
    $('vProfile').textContent = id || '—';
    $('hid').textContent = id || '';
    if (!id) { status('No profile detected yet — launch a profile from its PersonaX startup page.', false); $('cfg').open = true; return; }
    if (!c.vaultKey) { status('Set the vault key once below to see this account.', false); $('cfg').open = true; return; }
    status('Loading ' + id + '…', true);
    chrome.runtime.sendMessage({ type: 'GET_PROFILE', profileId: id }, (resp) => {
      if (!resp) { status('No response from background', false); return; }
      if (resp.error) { status(resp.error, false); return; }
      showAccount(resp.profile);
      status('Ready — press Alt+X on a signup page', true);
    });
  });
}

document.querySelectorAll('.cp').forEach((b) => {
  b.onclick = () => {
    const v = current[b.getAttribute('data-c')] || '';
    if (!v) return;
    navigator.clipboard.writeText(v).then(() => {
      const t = b.textContent; b.textContent = 'Copied'; b.classList.add('done');
      setTimeout(() => { b.textContent = t; b.classList.remove('done'); }, 1100);
    });
  };
});

$('save').onclick = () => {
  const data = {
    serverUrl: $('serverUrl').value.trim().replace(/\/+$/, ''),
    vaultKey: $('vaultKey').value.trim(),
    profileId: $('profileId').value.trim().toUpperCase()
  };
  $('profileId').value = data.profileId;
  chrome.storage.local.set(data, () => { status('Saved ✓', true); loadAccount(); });
};

loadAccount();
