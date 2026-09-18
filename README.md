# Interior Project Pro — Soft Interior Editorial Edition

A lightweight Vite + Express + SQLite app for AI-assisted photography and interior critique.

## What changed

- Soft Interior Editorial visual system with serif display typography and warm neutral palette
- Responsive mobile and desktop layout
- Better upload cards with drag-and-drop, remove/replace, image preview, type checks, and 10 MB limit
- Interior mode is now the default mode
- Staged loading UI with cancel support
- Offline status handling
- Rich score breakdown with progress bars and expandable “Why this score?” details
- Gemini output now asks for a concrete positive and concrete next improvement for every criterion
- Better comparison cards with A/B score bars and score deltas
- Filterable SQLite history and individual result deletion
- Existing sharing and JSON/TXT/HTML/CSV exports retained
- Shared/exported HTML report updated to the same editorial look
- Web app manifest added for a more app-like install experience
- API key removed from `.env.example`; secrets belong only in `.env`

## Run it

Open this folder in VS Code, then in the terminal:

```powershell
npm install
copy .env.example .env
```

Open `.env` and replace:

```env
GEMINI_API_KEY=PASTE_YOUR_NEW_GEMINI_API_KEY_HERE
```

with your Gemini API key. Then run:

```powershell
npm run dev
```

Open:

```text
http://localhost:5173
```

## Important security note

Never place the Gemini key in `src/`, `vite.config.js`, or any variable beginning with `VITE_`. The frontend sends images to `/api/analyze`; only the Express backend talks to Gemini.

`.env` is already ignored by Git.

## Low-RAM laptop note

This project does not need Docker, XAMPP, or a local AI model. For a 4 GB laptop, keep VS Code + one browser window open and avoid Android emulators. If you later package it with Capacitor, test on a physical Android phone where possible.
