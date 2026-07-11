const DEFAULTS = { serverUrl: 'http://127.0.0.1:4600', vaultKey: '', profileId: '' };
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(DEFAULTS, (c) => {
  $('serverUrl').value = c.serverUrl || DEFAULTS.serverUrl;
  $('vaultKey').value = c.vaultKey || '';
  $('profileId').value = c.profileId || '';
});

function status(msg, ok) { const s = $('st'); s.className = 'st ' + (ok ? 'ok' : 'err'); s.textContent = msg; }

$('save').onclick = () => {
  const data = {
    serverUrl: $('serverUrl').value.trim().replace(/\/+$/, ''),
    vaultKey: $('vaultKey').value.trim(),
    profileId: $('profileId').value.trim().toUpperCase()
  };
  $('profileId').value = data.profileId;
  chrome.storage.local.set(data, () => status('Saved ✓', true));
};

$('test').onclick = () => {
  const id = $('profileId').value.trim().toUpperCase();
  chrome.storage.local.set({
    serverUrl: $('serverUrl').value.trim().replace(/\/+$/, ''),
    vaultKey: $('vaultKey').value.trim(),
    profileId: id
  }, () => {
    chrome.runtime.sendMessage({ type: 'GET_PROFILE', profileId: id }, (resp) => {
      if (!resp) { status('No response from background', false); return; }
      if (resp.error) { status(resp.error, false); return; }
      const p = resp.profile;
      status('Found ' + p.profile_id + ' — ' + (p.email || '(no email set)'), true);
    });
  });
};
