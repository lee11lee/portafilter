# Portafilter — Espresso Logger (PWA)

A web-app port of your Portafilter (formerly DialIn) SwiftUI app. Runs entirely in the browser,
stores everything locally on your device (`localStorage`), no server, no account, $0 to run.

## Try it instantly
Open `index.html` directly in Safari (double-click it, or AirDrop it to your phone and
open from Files). Works, but "Add to Home Screen" and offline caching are more reliable
once it's actually hosted (see below) — `file://` pages have some Safari quirks.

## Host it for free (recommended)
**GitHub Pages** — since you already have a GitHub repo:
1. Create a new repo (or a `gh-pages` branch in an existing one).
2. Upload all 6 files in this folder (`index.html`, `app.js`, `manifest.json`, `sw.js`,
   `icon-192.png`, `icon-512.png`) to the repo root.
3. Repo → Settings → Pages → Deploy from branch → pick `main` (or `gh-pages`) / root.
4. GitHub gives you a URL like `https://yourname.github.io/reponame/`.

**Netlify / Vercel / Cloudflare Pages** also work — just drag-and-drop this folder in
their web dashboard (no build step needed, it's static files).

## Install on your iPhone
1. Open the hosted URL in **Safari**.
2. Tap the Share button → **Add to Home Screen**.
3. It now behaves like a real app: own icon, full-screen, works offline after first load.

## What's different from the Swift app
- **Bag scanner**: no OCR auto-fill (that needed on-device Vision, which the web can't
  do offline). There's still a camera button on "Add bag" — it takes a photo and attaches
  it to the bean, you just type the fields yourself.
- **Manual slider entry**: tapping a slider's number opens a simple prompt dialog instead
  of an inline text field.
- **Haptics**: taps vibrate on Android; iOS Safari doesn't support `navigator.vibrate()`,
  so haptic feedback is silent there (everything still works, just no buzz).
- **Backup format**: JSON export/import, similar to the original — and it fixes a bug
  I found in the source app, where recipes weren't actually included in the Swift app's
  backup file at all (they were nested under each bean's `recipes` array, but recipes
  were never assigned to a bean anywhere in the app, so that array was always empty).
  This version backs up recipes correctly.
- Everything else — dial-in flow, grind dial, taste sliders, ratings, flavor tags,
  shot history (with sort-by-rating), bean shelf, freshness tracking, recipes,
  grinder/machine setup — is a full functional port.

## Your data
Stored in this browser's `localStorage`, scoped to whichever URL you open it from.
Use Settings → Export backup regularly, especially before clearing browser data or
switching hosting providers (localStorage doesn't follow you between different URLs).
