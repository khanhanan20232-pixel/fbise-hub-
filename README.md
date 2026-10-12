# FBISE Study Hub

**Prepare Smart. Practice Better. Achieve More.**

A complete, self-hosted learning & exam-preparation platform for students of the
Federal Board of Intermediate and Secondary Education (FBISE), Pakistan —
Classes 9, 10, 11 and 12.

> An independent educational resource. Not officially affiliated with FBISE.

---

## Features

- **Homepage** — hero, search, class cards, popular subjects, past/model paper
  previews, quiz section, recently added resources, benefits, FAQ
- **Classes & subjects** — 4 classes (9, 10, 11, 12) with FBISE-aligned subjects,
  each with its own papers, quizzes and resources
- **Past papers library** — filter by class, subject, year, session; PDF view &
  download; honest "not uploaded yet" states (never fake papers)
- **Model papers library** — clearly distinguishes *Official FBISE Model Papers*
  (verified only) from *Practice Papers*
- **Quiz system** — chapter-wise MCQs, timed option, instant scoring with
  explanations, attempt history for logged-in students
- **Student auth** — register, login, logout, forgot/reset password; sessions
  persist across refreshes; dashboard never shows a blank screen (loading,
  error and retry states included)
- **Student dashboard** — welcome, class, subjects, recent papers, quiz scores &
  progress, saved papers, settings
- **Admin dashboard** — upload/manage PDFs, manage subjects & quiz questions,
  view students, feedback, publish/unpublish, usage stats
- **Security** — bcrypt password hashing, httpOnly session cookies, rate-limited
  auth, role-based access control, PDF-only uploads (20 MB max), students can
  never escalate their own role
- **Responsive + dark mode** — mobile-first design, theme toggle persisted

## Tech stack

- **Backend:** Node.js + Express 4, EJS templates (server-rendered — no blank
  screens, works on low-powered devices)
- **Database:** SQLite (file-based, zero-config) via `sqlite3`
- **Auth:** `express-session` + `bcryptjs`
- **Uploads:** `multer`, stored on disk in `uploads/`, served through a
  controlled route (`/papers/:id/file`)

## Quick start

```bash
cd fbise-study-hub
npm install
cp .env.example .env        # then edit .env (see below)
npm run seed                # adds subjects + practice quiz questions
npm start                   # http://localhost:3000
```

On first start an **admin account** is created automatically from `.env`:

| Variable         | Default                     |
|------------------|-----------------------------|
| `ADMIN_EMAIL`    | `admin@fbise-study-hub.local` |
| `ADMIN_PASSWORD` | `Admin123!`                 |

⚠️ **Change these immediately** in production via real environment variables.

### Environment variables (`.env`)

```
PORT=3000
SESSION_SECRET=a-long-random-string      # required in production
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=a-strong-password
DB_PATH=./data/fbise.db
NODE_ENV=production                      # enables secure cookies
```

## Project structure

```
fbise-study-hub/
├── src/
│   ├── server.js          # all routes, auth, admin, quizzes, uploads
│   ├── db.js              # SQLite schema + helpers
│   ├── seed.js            # subjects + practice questions (idempotent)
│   └── middleware/auth.js # requireLogin / requireAdmin
├── views/                 # EJS templates
│   ├── partials/          # header, footer, paper-card
│   └── admin/             # admin dashboard + content management
├── public/
│   ├── css/style.css
│   └── js/app.js          # dark mode, delete confirms, subject filtering
├── uploads/               # PDF storage (served via controlled route only)
├── data/                  # SQLite file (fbise.db)
└── .env.example
```

## Database schema

- `users` — id, name, email (unique), password_hash, role
  (`student`|`admin`), class_level, school, reset_token, reset_expires
- `classes` — the 4 FBISE classes (seeded)
- `subjects` — per-class subjects (admin-managed)
- `papers` — title, class, subject, year, session, `paper_type`
  (`past` | `model_official` | `model_practice`), file_path, is_published
- `quiz_questions` — class, subject, chapter, question, 4 options,
  correct_option, explanation
- `quiz_attempts` — user, score/total, answers JSON, timestamps
- `saved_resources` — student bookmarks (unique per user+paper)
- `feedback` — contact-form messages

**Security rules enforced in code:**
- `role` is never accepted from client input (registration hard-codes
  `student`; settings form excludes it) — no privilege escalation.
- Admin routes use `requireAdmin` (session role check, server-side).
- Uploaded files are validated (PDF magic via mimetype/extension, 20 MB
  limit) and stored with random names outside the static path.

## Content honesty policy

- Only documents whose authenticity the admin has verified may be labelled
  **Official FBISE Model Paper**.
- Anything else is labelled **Practice Paper** with the note
  *"not an official FBISE document"*.
- Quiz questions are labelled practice and never presented as past-paper
  questions.
- Missing papers show *"This paper has not been uploaded yet"* — never a
  broken or fabricated PDF.

## Admin guide

1. Log in with the admin account → redirected to `/admin`.
2. **Papers → Upload Paper**: choose PDF, class, subject, year, session,
   type, publish/draft. It appears instantly in the right library section.
3. **Edit** replaces metadata or the file; **unpublish** hides it publicly
   without deleting; **delete** removes file + record (with confirmation).
4. **Subjects**: add/remove per class. **Quiz Questions**: add/delete MCQs.
5. **Students**: view registered accounts. **Feedback**: contact messages.

## Testing checklist (all verified)

- [x] Homepage, all 4 classes, subject pages load
- [x] Search finds papers/subjects; empty filters show
      "No papers found for these filters."
- [x] Register → redirected to dashboard (never blank); refresh keeps session
- [x] Wrong password → clear error; forgot-password generates reset link
- [x] Logout clears session and redirects home
- [x] Student → `/admin` gets 403; anonymous → redirected to login
- [x] Admin upload → appears in correct library; PDF views & downloads
- [x] Non-PDF upload rejected (400); >20 MB rejected
- [x] Quiz: answer, submit once (no double-submit), score + review shown,
      attempt saved for logged-in users
- [x] Save/unsave papers reflected in dashboard
- [x] Data persists across restarts (SQLite file + disk uploads)

## Deployment notes

- Use a process manager (`pm2`, systemd) and a reverse proxy (nginx/Caddy)
  for HTTPS in production.
- Set `NODE_ENV=production` and a strong `SESSION_SECRET`.
- Back up `data/fbise.db` and `uploads/` regularly.
- To move to Firebase later: replace `src/db.js` with Firestore calls,
  `express-session` with Firebase Auth session cookies, and `uploads/` with
  Firebase Storage — routes and views stay the same.

## License

MIT — built for the students of Pakistan. 🇵🇰
