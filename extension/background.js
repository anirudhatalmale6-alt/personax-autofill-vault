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
  return id;
}

// Make sure an identity exists as soon as the profile launches, so the popup and
// the first Alt+X both see the same data.
chrome.runtime.onInstalled.addListener(() => { getIdentity(); });
chrome.runtime.onStartup.addListener(() => { getIdentity(); });

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
});
