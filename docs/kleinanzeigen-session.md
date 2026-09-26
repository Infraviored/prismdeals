# Kleinanzeigen session

- One real Chrome on the server (Chrome for Testing from `~/.cache/selenium`, or `PRISMDEALS_CHROME`), headful under Xvfb (`PRISMDEALS_KA_DISPLAY`, default `:98`).
- Login happens in the app: Einstellungen → Kleinanzeigen verbinden. The page is streamed (CDP screencast, JPEG, polled every 250 ms); taps, text and keys are replayed in order. E-mail, password, code, captcha: the buyer answers them; nothing stores or logs typed input.
- Session = the Chrome profile `data/ka_profile` (0700). `data/ka_session.json` only says connected/since. "Trennen" deletes the profile.
- Chrome's sandbox stays on: Ubuntu 24.04 blocks unprivileged user namespaces, so the SUID helper is installed once:
  `sudo install -o root -g root -m 4755 <chrome dir>/chrome_sandbox /usr/local/sbin/chrome-devel-sandbox` (undo: `sudo rm` it).
- A login left open closes after 10 minutes; a finished login closes the browser.
- Code: `backend/ka_browser.js`, `backend/ka_api.js`, `frontend/src/screens/KaLoginSheet.tsx`.
- Next: writing to sellers uses the same profile (listing → contact form or existing conversation).
