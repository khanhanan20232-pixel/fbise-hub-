# Deploying FBISE Study Hub — Permanent Public Link

This guide gives you a **permanent public link** (e.g.
`https://fbise-study-hub.up.railway.app`) that works in every browser.
Recommended host: **Railway** (free tier, easy, supports persistent storage
for the database + uploaded PDFs).

## What you need (all free)

1. A **GitHub** account → https://github.com/signup
2. A **Railway** account → https://railway.app (sign up with GitHub)

## Steps

### 1. Put the code on GitHub
1. Create a new repository on GitHub (e.g. `fbise-study-hub`), **private** is fine.
2. Upload this project's files to it (all files in this folder, including
   `Dockerfile`). Easiest: GitHub web → "uploading an existing file".

### 2. Deploy on Railway
1. Log in to https://railway.app → **New Project** → **Deploy from GitHub repo**
   → select your `fbise-study-hub` repository.
2. Railway auto-detects the `Dockerfile` and builds the app.
3. Add a **Volume**: select the service → **Volumes** → **New Volume** →
   mount path `/app/data`. (Keeps the SQLite database safe across restarts.)
   - Note: uploaded PDFs live in `/app/uploads`. For a serious deployment,
     mount a second volume at `/app/uploads`, or move uploads to object
     storage later.
4. Add **Variables** (service → **Variables**):
   - `SESSION_SECRET` = a long random string (e.g. from https://www.uuidgenerator.net)
   - `ADMIN_EMAIL` = your admin email
   - `ADMIN_PASSWORD` = a strong password
   - `NODE_ENV` = `production`
   - Railway sets `PORT` automatically; the app respects it.
5. Railway gives you a public URL: service → **Settings** → **Networking** →
   **Generate Domain**. Done — open it in any browser!

### 3. First run checklist
- [ ] Open the public URL, homepage loads.
- [ ] Log in as admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- [ ] Upload a model paper → check it appears in the library.
- [ ] Register a test student → dashboard works.

## Roman Urdu summary (mukhtasir)

1. **GitHub** par free account banao, is project ka code wahan upload karo.
2. **Railway.app** par GitHub se login karo → New Project → apna repo select karo.
3. Railway khud Dockerfile se app bana lega.
4. **Volume** lagao (`/app/data`) taake database save rahe.
5. **Variables** mein `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` set karo.
6. **Generate Domain** dabao — bas! Aap ka permanent link tayyar.

Kisi step par ruk jao to Muse se poocho — woh aap ko guide karega.

## Notes
- Free tiers sleep when idle; first load after idle can take ~30 seconds.
- Back up `data/fbise.db` and `uploads/` regularly (download from the volume).
- Never commit real secrets (`.env`) to GitHub — use Railway Variables.
