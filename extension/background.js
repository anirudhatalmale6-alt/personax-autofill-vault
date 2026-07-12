/* PersonaX Autofill - service worker.
   Owns the single, stable identity for THIS profile. Because every PersonaX
   profile is an isolated browser, chrome.storage.local is private to the profile,
   so each profile automatically gets its own identity on first use with nothing
   for the user to configure. No server, no vault, no key. */

importScripts("identity.js");

const KEY = "px_identity";

// Return the stored identity; generate + persist it the first time only.
async function getIdentity() {
  const data = await chrome.storage.local.get(KEY);
  if (data[KEY] && data[KEY].email) return data[KEY];
  const id = pxGenerateIdentity();
  await chrome.storage.local.set({ [KEY]: id });
  return id;
}

async function regenerateIdentity() {
  const id = pxGenerateIdentity();
  await chrome.storage.local.set({ [KEY]: id });
  // let any open profile-home page repaint with the new identity
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.personax.work/profile/*" });
    for (const t of tabs) if (t.id != null) chrome.tabs.sendMessage(t.id, { type: "IDENTITY_CHANGED" });
  } catch (e) {}
  return id;
}

// Each profile gets a stable PersonaX-style code (e.g. AAAA0005) used for its
// home URL personax.work/profile/<code>. Generated once, then reused.
const CODE_KEY = "px_profile_code";
async function getProfileCode() {
  const data = await chrome.storage.local.get(CODE_KEY);
  if (data[CODE_KEY]) return data[CODE_KEY];
  const code = pxProfileCode();
  await chrome.storage.local.set({ [CODE_KEY]: code });
  return code;
}

// On profile launch, open THIS profile's home page on personax.work (branded,
// shows the identity, with a button to the Outlook signup) - not raw outlook.com.
// Nothing to configure per profile. Won't stack duplicates.
const PROFILE_BASE = "https://personax.work/profile/";
async function openProfileHome() {
  try {
    const code = await getProfileCode();
    const url = PROFILE_BASE + code;
    const tabs = await chrome.tabs.query({});
    const has = (tabs || []).some((t) => t.url && t.url.indexOf("personax.work/profile/") !== -1);
    if (!has) chrome.tabs.create({ url });
  } catch (e) {}
}

// Make sure an identity + code exist as soon as the profile launches, so the
// home page, the popup and the first Alt+X all see the same data.
chrome.runtime.onInstalled.addListener(() => { getIdentity(); getProfileCode(); openProfileHome(); });
chrome.runtime.onStartup.addListener(() => { getIdentity(); getProfileCode(); openProfileHome(); });

// Alt+X -> tell the active tab to autofill.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "autofill") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL_NOW" });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "GET_IDENTITY") {
    getIdentity().then((id) => sendResponse({ identity: id }));
    return true; // async
  }
  if (msg.type === "REGENERATE") {
    regenerateIdentity().then((id) => sendResponse({ identity: id }));
    return true;
  }
  if (msg.type === "GET_PROFILE_CODE") {
    getProfileCode().then((code) => sendResponse({ code: code }));
    return true;
  }
});
