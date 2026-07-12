# PersonaX Autofill

Install-and-go autofill for creating Outlook accounts across PersonaX profiles.
No server, no vault, no key, no per-profile setup.

## How it works
Every PersonaX profile is a separate, isolated browser, so the extension's storage is
private to that profile. On first launch it generates **one fixed identity** for the
profile — name, email/username, a strong password, date of birth, and country — and
stores it. That identity **never changes on refresh** or between signup steps; it's the
same until you tap *New identity*.

- Create 100 profiles and each one automatically has its own identity. Nothing to configure.
- On an Outlook signup page it fills **automatically**, or press **Alt+X** any time.
- The popup shows this profile's identity with copy buttons, plus a *New identity* button.

## Load it
PersonaX / Chrome → Extensions → Developer mode → **Load unpacked** → pick the
`extension` folder (or install *PersonaX Autofill* from the PersonaX extension marketplace).

## Files (`/extension`)
- `identity.js` — generates one realistic random identity (single source of truth).
- `background.js` — service worker; generates the identity once, stores it, serves it. Holds the Alt+X command.
- `content.js` — fills forms. Robust field matching, plus special handling for Outlook's
  Fluent birth-month/day dropdowns and the birth-year input (this is what most autofillers miss).
- `popup.html` / `popup.js` — shows the profile's identity, copy buttons, *New identity*.

## Notes
- The identity lives only in the profile's local storage. Because each profile is isolated,
  identities never leak between profiles.
- `/server` in this repo is the older optional vault variant and is no longer required.
