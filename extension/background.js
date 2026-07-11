/* Service worker: holds config, fetches the profile record from the vault,
   and relays the Alt+X command to the active tab. */

const DEFAULTS = { serverUrl: 'http://127.0.0.1:4600', vaultKey: '', profileId: '' };

async function getConfig() {
  const c = await chrome.storage.local.get(DEFAULTS);
  return Object.assign({}, DEFAULTS, c);
}

// Fetch happens here (not in the page) so the vault key never touches page JS
// and there are no CORS/mixed-content headaches.
async function fetchProfile(profileId) {
  const cfg = await getConfig();
  const id = (profileId || cfg.profileId || '').trim();
  if (!cfg.serverUrl) return { error: 'Set the vault server URL in the extension popup.' };
  if (!cfg.vaultKey) return { error: 'Set the vault key in the extension popup.' };
  if (!id) return { error: 'No profile ID set. Open the popup and set this profile\'s ID.' };
  try {
    const r = await fetch(cfg.serverUrl.replace(/\/+$/, '') + '/api/profile/' + encodeURIComponent(id), {
      headers: { 'x-vault-key': cfg.vaultKey }
    });
    if (r.status === 401) return { error: 'Vault key rejected. Check the popup.' };
    if (r.status === 404) return { error: 'No info stored for profile ' + id + ' yet.' };
    if (!r.ok) return { error: 'Vault error ' + r.status };
    const j = await r.json();
    return { profile: j.profile };
  } catch (e) {
    return { error: 'Cannot reach vault at ' + cfg.serverUrl + ' (' + e.message + ')' };
  }
}

// Alt+X keyboard command -> tell the active tab to autofill
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'autofill') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_NOW' });
});

// Content script asks us for the data (keeps the key out of the page)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GET_PROFILE') {
    fetchProfile(msg.profileId).then(sendResponse);
    return true; // async
  }
});
