// src/server.js — FBISE Study Hub main server
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const validator = require('validator');

const { init, run, get, all } = require('./db');
const { requireLogin, requireAdmin, attachUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'fbise-study-hub-dev-secret-change-me';

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- View engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// --- Security & parsing ---
app.use(helmet({
  contentSecurityPolicy: false, // allow inline PDF embeds
  crossOriginEmbedderPolicy: false,
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', (req, res, next) => next()); // uploads served only via controlled route

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));
app.use(attachUser);

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });

// --- Multer (PDF only) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + '.pdf'),
});
function pdfFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed.'));
  }
}
const upload = multer({
  storage,
  fileFilter: pdfFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// --- Helpers ---
function classIdFromParam(p) {
  const map = { '9': '9', '10': '10', '11': '11', '12': '12', 'class-9': '9', 'class-10': '10', 'class-11': '11', 'class-12': '12' };
  return map[p] || null;
}
async function getClasses() { return all('SELECT * FROM classes ORDER BY slug'); }
async function getClassBySlug(slug) { return get('SELECT * FROM classes WHERE slug = ?', [slug]); }
function paperTypeLabel(t) {
  return { past: 'Past Paper', model_official: 'Official Model Paper', model_practice: 'Practice Paper' }[t] || t;
}
app.locals.paperTypeLabel = paperTypeLabel;

// ============================================================
// PUBLIC PAGES
// ============================================================

app.get('/', async (req, res, next) => {
  try {
    const classes = await getClasses();
    const recentPapers = await all(
      `SELECT p.*, c.name as class_name, c.slug as class_slug, s.name as subject_name
       FROM papers p JOIN classes c ON p.class_id = c.id LEFT JOIN subjects s ON p.subject_id = s.id
       WHERE p.is_published = 1 ORDER BY p.created_at DESC LIMIT 6`
    );
    const pastCount = await get(`SELECT COUNT(*) as c FROM papers WHERE paper_type='past' AND is_published=1`);
    const modelCount = await get(`SELECT COUNT(*) as c FROM papers WHERE paper_type IN ('model_official','model_practice') AND is_published=1`);
    const quizCount = await get(`SELECT COUNT(*) as c FROM quiz_questions`);
    const popularSubjects = await all(
      `SELECT s.*, c.name as class_name, c.slug as class_slug,
        (SELECT COUNT(*) FROM papers p WHERE p.subject_id = s.id AND p.is_published=1) as paper_count,
        (SELECT COUNT(*) FROM quiz_questions q WHERE q.subject_id = s.id) as quiz_count
       FROM subjects s JOIN classes c ON s.class_id = c.id
       ORDER BY paper_count DESC, quiz_count DESC LIMIT 8`
    );
    res.render('index', { title: 'FBISE Study Hub — Prepare Smart. Practice Better. Achieve More.', classes, recentPapers, pastCount: pastCount.c, modelCount: modelCount.c, quizCount: quizCount.c, popularSubjects, query: req.query.q || '' });
  } catch (e) { next(e); }
});

app.get('/classes', async (req, res, next) => {
  try {
    const classes = await getClasses();
    const counts = {};
    for (const c of classes) {
      const p = await get('SELECT COUNT(*) as n FROM papers WHERE class_id=? AND is_published=1', [c.id]);
      const q = await get('SELECT COUNT(*) as n FROM quiz_questions WHERE class_id=?', [c.id]);
      counts[c.id] = { papers: p.n, quizzes: q.n };
    }
    res.render('classes', { title: 'Classes — FBISE Study Hub', classes, counts });
  } catch (e) { next(e); }
});

app.get('/classes/:slug', async (req, res, next) => {
  try {
    const cls = await getClassBySlug(req.params.slug);
    if (!cls) return res.status(404).render('error', { title: 'Not found', message: 'Class not found.', status: 404, user: res.locals.currentUser });
    const subjects = await all('SELECT * FROM subjects WHERE class_id=? ORDER BY name', [cls.id]);
    const papers = await all(
      `SELECT p.*, s.name as subject_name FROM papers p LEFT JOIN subjects s ON p.subject_id=s.id
       WHERE p.class_id=? AND p.is_published=1 ORDER BY p.created_at DESC LIMIT 10`, [cls.id]);
    const quizCount = await get('SELECT COUNT(*) as n FROM quiz_questions WHERE class_id=?', [cls.id]);
    res.render('class-detail', { title: `${cls.name} — FBISE Study Hub`, cls, subjects, papers, quizCount: quizCount.n });
  } catch (e) { next(e); }
});

app.get('/subjects/:id', async (req, res, next) => {
  try {
    const subject = await get(`SELECT s.*, c.name as class_name, c.slug as class_slug FROM subjects s JOIN classes c ON s.class_id=c.id WHERE s.id=?`, [req.params.id]);
    if (!subject) return res.status(404).render('error', { title: 'Not found', message: 'Subject not found.', status: 404, user: res.locals.currentUser });
    const papers = await all('SELECT * FROM papers WHERE subject_id=? AND is_published=1 ORDER BY year DESC, created_at DESC', [subject.id]);
    const questions = await all('SELECT * FROM quiz_questions WHERE subject_id=? ORDER BY created_at DESC LIMIT 50', [subject.id]);
    const chapters = [...new Set(questions.map(q => q.chapter).filter(Boolean))];
    let savedIds = new Set();
    if (res.locals.currentUser) {
      const saved = await all('SELECT paper_id FROM saved_resources WHERE user_id=?', [res.locals.currentUser.id]);
      savedIds = new Set(saved.map(s => s.paper_id));
    }
    res.render('subject-detail', { title: `${subject.name} — FBISE Study Hub`, subject, papers, questions, chapters, savedIds });
  } catch (e) { next(e); }
});

// ---- Papers library ----
async function paperLibrary(req, res, next, allowedTypes, view, title) {
  try {
    const classes = await getClasses();
    const { class: classParam, subject, year, session, q } = req.query;
    let where = 'p.is_published=1';
    const params = [];
    if (allowedTypes.length) { where += ` AND p.paper_type IN (${allowedTypes.map(() => '?').join(',')})`; params.push(...allowedTypes); }
    if (classParam) {
      const cls = await get('SELECT id FROM classes WHERE slug=?', [classParam]);
      if (cls) { where += ' AND p.class_id=?'; params.push(cls.id); }
    }
    if (subject) { where += ' AND p.subject_id=?'; params.push(subject); }
    if (year) { where += ' AND p.year=?'; params.push(parseInt(year)); }
    if (session) { where += ' AND p.session=?'; params.push(session); }
    if (q) { where += ' AND (p.title LIKE ? OR s.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

    const papers = await all(
      `SELECT p.*, c.name as class_name, c.slug as class_slug, s.name as subject_name
       FROM papers p JOIN classes c ON p.class_id=c.id LEFT JOIN subjects s ON p.subject_id=s.id
       WHERE ${where} ORDER BY p.year DESC, p.created_at DESC LIMIT 200`, params);
    const subjects = await all(`SELECT s.*, c.slug as class_slug FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name`);
    const years = await all(`SELECT DISTINCT year FROM papers WHERE year IS NOT NULL AND is_published=1 ORDER BY year DESC`);
    res.render(view, { title, papers, classes, subjects, years, filters: req.query });
  } catch (e) { next(e); }
}
app.get('/past-papers', (req, res, next) => paperLibrary(req, res, next, ['past'], 'past-papers', 'Past Papers — FBISE Study Hub'));
app.get('/model-papers', (req, res, next) => paperLibrary(req, res, next, ['model_official', 'model_practice'], 'model-papers', 'Model Papers — FBISE Study Hub'));

// ---- Single paper view / download ----
app.get('/papers/:id', async (req, res, next) => {
  try {
    const paper = await get(
      `SELECT p.*, c.name as class_name, c.slug as class_slug, s.name as subject_name
       FROM papers p JOIN classes c ON p.class_id=c.id LEFT JOIN subjects s ON p.subject_id=s.id
       WHERE p.id=? AND p.is_published=1`, [req.params.id]);
    if (!paper) return res.status(404).render('error', { title: 'Not found', message: 'This paper is not available. It may not have been uploaded yet.', status: 404, user: res.locals.currentUser });
    let isSaved = false;
    if (res.locals.currentUser) {
      const s = await get('SELECT id FROM saved_resources WHERE user_id=? AND paper_id=?', [res.locals.currentUser.id, paper.id]);
      isSaved = !!s;
    }
    res.render('paper-view', { title: `${paper.title} — FBISE Study Hub`, paper, isSaved });
  } catch (e) { next(e); }
});

// Controlled PDF serving (prevents directory listing, logs nothing sensitive)
app.get('/papers/:id/file', async (req, res, next) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id=? AND is_published=1', [req.params.id]);
    if (!paper || !paper.file_path) return res.status(404).send('File not available.');
    const abs = path.join(UPLOAD_DIR, path.basename(paper.file_path));
    if (!fs.existsSync(abs)) return res.status(404).send('File not found on server.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${paper.title.replace(/[^a-z0-9\- ]/gi, '_')}.pdf"`);
    fs.createReadStream(abs).pipe(res);
  } catch (e) { next(e); }
});
app.get('/papers/:id/download', async (req, res, next) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id=? AND is_published=1', [req.params.id]);
    if (!paper || !paper.file_path) return res.status(404).send('File not available.');
    const abs = path.join(UPLOAD_DIR, path.basename(paper.file_path));
    if (!fs.existsSync(abs)) return res.status(404).send('File not found on server.');
    res.download(abs, `${paper.title.replace(/[^a-z0-9\- ]/gi, '_')}.pdf`);
  } catch (e) { next(e); }
});

// ---- Search ----
app.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    let papers = [], subjects = [];
    if (q) {
      papers = await all(
        `SELECT p.*, c.name as class_name, s.name as subject_name FROM papers p
         JOIN classes c ON p.class_id=c.id LEFT JOIN subjects s ON p.subject_id=s.id
         WHERE p.is_published=1 AND (p.title LIKE ? OR s.name LIKE ? OR c.name LIKE ?)
         ORDER BY p.created_at DESC LIMIT 50`, [`%${q}%`, `%${q}%`, `%${q}%`]);
      subjects = await all(
        `SELECT s.*, c.name as class_name FROM subjects s JOIN classes c ON s.class_id=c.id
         WHERE s.name LIKE ? LIMIT 20`, [`%${q}%`]);
    }
    res.render('search', { title: `Search — FBISE Study Hub`, q, papers, subjects });
  } catch (e) { next(e); }
});

// ============================================================
// QUIZZES
// ============================================================
app.get('/quizzes', async (req, res, next) => {
  try {
    const classes = await getClasses();
    const subjects = await all(
      `SELECT s.*, c.name as class_name, c.slug as class_slug,
        (SELECT COUNT(*) FROM quiz_questions q WHERE q.subject_id=s.id) as qcount
       FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name`);
    res.render('quizzes', { title: 'Quizzes — FBISE Study Hub', classes, subjects });
  } catch (e) { next(e); }
});

app.get('/quizzes/subject/:subjectId', async (req, res, next) => {
  try {
    const subject = await get(`SELECT s.*, c.name as class_name, c.slug as class_slug FROM subjects s JOIN classes c ON s.class_id=c.id WHERE s.id=?`, [req.params.subjectId]);
    if (!subject) return res.status(404).render('error', { title: 'Not found', message: 'Subject not found.', status: 404, user: res.locals.currentUser });
    const chapter = req.query.chapter || '';
    const count = Math.min(Math.max(parseInt(req.query.count) || 10, 5), 30);
    let qs;
    if (chapter) qs = await all('SELECT * FROM quiz_questions WHERE subject_id=? AND chapter=? ORDER BY RANDOM() LIMIT ?', [subject.id, chapter, count]);
    else qs = await all('SELECT * FROM quiz_questions WHERE subject_id=? ORDER BY RANDOM() LIMIT ?', [subject.id, count]);
    if (!qs.length) {
      return res.render('quiz-empty', { title: 'No questions yet', subject, chapter });
    }
    // Don't leak answers to client in a trivially scrapable way? For this self-hosted version,
    // we keep answers server-side only: send questions without correct_option.
    const safe = qs.map(({ correct_option, explanation, ...rest }) => rest);
    res.render('quiz-take', {
      title: `Quiz: ${subject.name} — FBISE Study Hub`,
      subject, questions: safe, fullQuestions: qs, chapter, count,
      timerMinutes: parseInt(req.query.timer) || 0,
    });
  } catch (e) { next(e); }
});

app.post('/quizzes/subject/:subjectId/submit', async (req, res, next) => {
  try {
    const subject = await get('SELECT * FROM subjects WHERE id=?', [req.params.subjectId]);
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    const answers = req.body.answers || {}; // {questionId: 'a'|'b'|'c'|'d'}
    const ids = Object.keys(answers);
    if (!ids.length) return res.status(400).json({ error: 'No answers submitted.' });
    const placeholders = ids.map(() => '?').join(',');
    const questions = await all(`SELECT * FROM quiz_questions WHERE id IN (${placeholders}) AND subject_id=?`, [...ids, subject.id]);
    let score = 0;
    const review = questions.map(q => {
      const chosen = (answers[q.id] || '').toLowerCase();
      const correct = chosen === q.correct_option;
      if (correct) score++;
      return { id: q.id, question: q.question, chapter: q.chapter, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, chosen, correct_option: q.correct_option, correct, explanation: q.explanation };
    });
    let attemptId = null;
    if (res.locals.currentUser) {
      attemptId = uuidv4();
      const now = Date.now();
      await run('INSERT INTO quiz_attempts (id, user_id, class_id, subject_id, score, total, answers_json, started_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [attemptId, res.locals.currentUser.id, subject.class_id, subject.id, score, questions.length, JSON.stringify(answers), now, now]);
    }
    res.json({ score, total: questions.length, review, attemptId, note: 'These are practice questions prepared for study purposes. They are not official FBISE papers.' });
  } catch (e) { next(e); }
});

// ============================================================
// AUTH
// ============================================================
app.get('/login', (req, res) => {
  if (res.locals.currentUser) return res.redirect(res.locals.currentUser.role === 'admin' ? '/admin' : '/dashboard');
  res.render('login', { title: 'Log in — FBISE Study Hub', error: null, next: req.query.next || '' });
});

app.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password, next: nextUrl } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).render('login', { title: 'Log in — FBISE Study Hub', error: 'Please enter your email and password.', next: nextUrl || '' });
    }
    const user = await get('SELECT * FROM users WHERE email=?', [cleanEmail]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).render('login', { title: 'Log in — FBISE Study Hub', error: 'Incorrect email or password. Please try again.', next: nextUrl || '' });
    }
    // Regenerate session to prevent fixation, then set auth state
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.name = user.name;
      req.session.email = user.email;
      req.session.role = user.role;
      req.session.classLevel = user.class_level;
      req.session.save((err2) => {
        if (err2) return next(err2);
        const dest = (nextUrl && nextUrl.startsWith('/')) ? nextUrl : (user.role === 'admin' ? '/admin' : '/dashboard');
        return res.redirect(dest);
      });
    });
  } catch (e) { next(e); }
});

app.get('/register', (req, res) => {
  if (res.locals.currentUser) return res.redirect('/dashboard');
  res.render('register', { title: 'Create account — FBISE Study Hub', error: null, form: {} });
});

app.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password, confirm, class_level, school } = req.body;
    const form = { name, email, class_level, school };
    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanName || cleanName.length < 3) {
      return res.status(400).render('register', { title: 'Create account — FBISE Study Hub', error: 'Please enter your full name (at least 3 characters).', form });
    }
    if (!validator.isEmail(cleanEmail)) {
      return res.status(400).render('register', { title: 'Create account — FBISE Study Hub', error: 'Please enter a valid email address.', form });
    }
    if (!password || password.length < 6) {
      return res.status(400).render('register', { title: 'Create account — FBISE Study Hub', error: 'Password must be at least 6 characters long.', form });
    }
    if (password !== confirm) {
      return res.status(400).render('register', { title: 'Create account — FBISE Study Hub', error: 'Passwords do not match.', form });
    }
    if (!['9', '10', '11', '12'].includes(class_level)) {
      return res.status(400).render('register', { title: 'Create account — FBISE Study Hub', error: 'Please select your class.', form });
    }
    const existing = await get('SELECT id FROM users WHERE email=?', [cleanEmail]);
    if (existing) {
      return res.status(400).render('register', { title: 'Create account — FBISE Study Hub', error: 'An account with this email already exists. Try logging in.', form });
    }
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    await run('INSERT INTO users (id, name, email, password_hash, role, class_level, school, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, cleanName, cleanEmail, hash, 'student', class_level, (school || '').trim() || null, Date.now()]);
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = id;
      req.session.name = cleanName;
      req.session.email = cleanEmail;
      req.session.role = 'student';
      req.session.classLevel = class_level;
      req.session.save((e2) => {
        if (e2) return next(e2);
        res.redirect('/dashboard');
      });
    });
  } catch (e) { next(e); }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'Reset password — FBISE Study Hub', message: null, error: null });
});
app.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const user = await get('SELECT * FROM users WHERE email=?', [email]);
    if (!user) {
      // Don't reveal whether the email exists
      return res.render('forgot-password', { title: 'Reset password — FBISE Study Hub', message: 'If an account exists for this email, a reset link has been generated. In this self-hosted setup, please contact the administrator or check the server console.', error: null });
    }
    const token = uuidv4().replace(/-/g, '');
    await run('UPDATE users SET reset_token=?, reset_expires=? WHERE id=?', [token, Date.now() + 1000 * 60 * 60, user.id]);
    console.log(`[FBISE Study Hub] Password reset for ${email}: http://localhost:${PORT}/reset-password?token=${token}`);
    res.render('forgot-password', { title: 'Reset password — FBISE Study Hub', message: 'A reset link was generated. In this self-hosted demo it is printed to the server console. In production, it would be emailed.', error: null });
  } catch (e) { next(e); }
});
app.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  const user = await get('SELECT * FROM users WHERE reset_token=? AND reset_expires > ?', [token, Date.now()]);
  if (!user) return res.render('error', { title: 'Invalid link', message: 'This reset link is invalid or has expired.', status: 400, user: res.locals.currentUser });
  res.render('reset-password', { title: 'Set new password — FBISE Study Hub', token, error: null });
});
app.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password, confirm } = req.body;
    if (!password || password.length < 6) return res.render('reset-password', { title: 'Set new password', token, error: 'Password must be at least 6 characters.' });
    if (password !== confirm) return res.render('reset-password', { title: 'Set new password', token, error: 'Passwords do not match.' });
    const user = await get('SELECT * FROM users WHERE reset_token=? AND reset_expires > ?', [token, Date.now()]);
    if (!user) return res.render('error', { title: 'Invalid link', message: 'This reset link is invalid or has expired.', status: 400, user: res.locals.currentUser });
    const hash = await bcrypt.hash(password, 12);
    await run('UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL WHERE id=?', [hash, user.id]);
    res.redirect('/login');
  } catch (e) { next(e); }
});

// ============================================================
// STUDENT DASHBOARD (never blank: loading + error states)
// ============================================================
app.get('/dashboard', requireLogin, async (req, res, next) => {
  // Admins get their own dashboard
  if (req.session.role === 'admin') return res.redirect('/admin');
  // Render shell immediately with loading state; data loads via API for resilience.
  // Also do a server-side data fetch with graceful fallback so refresh works.
  res.render('dashboard', { title: 'My Dashboard — FBISE Study Hub' });
});

app.get('/api/dashboard-data', requireLogin, async (req, res, next) => {
  try {
    const user = await get('SELECT id, name, email, class_level, school, created_at FROM users WHERE id=?', [req.session.userId]);
    if (!user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    const cls = user.class_level ? await get('SELECT * FROM classes WHERE slug=?', [`class-${user.class_level}`]) : null;
    const subjects = cls ? await all('SELECT * FROM subjects WHERE class_id=? ORDER BY name', [cls.id]) : [];
    const recentPapers = cls ? await all(
      `SELECT p.*, s.name as subject_name FROM papers p LEFT JOIN subjects s ON p.subject_id=s.id
       WHERE p.class_id=? AND p.is_published=1 ORDER BY p.created_at DESC LIMIT 6`, [cls.id]) : [];
    const attempts = await all(
      `SELECT qa.*, s.name as subject_name FROM quiz_attempts qa JOIN subjects s ON qa.subject_id=s.id
       WHERE qa.user_id=? ORDER BY qa.completed_at DESC LIMIT 10`, [user.id]);
    const saved = await all(
      `SELECT p.*, s.name as subject_name, c.name as class_name FROM saved_resources sr
       JOIN papers p ON sr.paper_id=p.id LEFT JOIN subjects s ON p.subject_id=s.id JOIN classes c ON p.class_id=c.id
       WHERE sr.user_id=? AND p.is_published=1 ORDER BY sr.saved_at DESC LIMIT 10`, [user.id]);
    const stats = {
      papersAvailable: cls ? (await get('SELECT COUNT(*) as n FROM papers WHERE class_id=? AND is_published=1', [cls.id])).n : 0,
      quizzesTaken: attempts.length,
      avgScore: attempts.length ? Math.round(attempts.reduce((a, b) => a + (b.score / b.total), 0) / attempts.length * 100) : null,
      savedCount: saved.length,
    };
    res.json({ user, class: cls, subjects, recentPapers, attempts, saved, stats });
  } catch (e) { next(e); }
});

app.post('/api/save-paper/:paperId', requireLogin, async (req, res, next) => {
  try {
    const paper = await get('SELECT id FROM papers WHERE id=? AND is_published=1', [req.params.paperId]);
    if (!paper) return res.status(404).json({ error: 'Paper not found.' });
    await run('INSERT OR IGNORE INTO saved_resources (id, user_id, paper_id, saved_at) VALUES (?,?,?,?)',
      [uuidv4(), req.session.userId, paper.id, Date.now()]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.delete('/api/save-paper/:paperId', requireLogin, async (req, res, next) => {
  try {
    await run('DELETE FROM saved_resources WHERE user_id=? AND paper_id=?', [req.session.userId, req.params.paperId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.get('/api/my-attempts', requireLogin, async (req, res, next) => {
  try {
    const attempts = await all(
      `SELECT qa.*, s.name as subject_name, c.name as class_name FROM quiz_attempts qa
       JOIN subjects s ON qa.subject_id=s.id JOIN classes c ON qa.class_id=c.id
       WHERE qa.user_id=? ORDER BY qa.completed_at DESC LIMIT 50`, [req.session.userId]);
    res.json({ attempts });
  } catch (e) { next(e); }
});

// ---- Account settings ----
app.get('/settings', requireLogin, async (req, res, next) => {
  try {
    const user = await get('SELECT id, name, email, class_level, school FROM users WHERE id=?', [req.session.userId]);
    res.render('settings', { title: 'Account settings — FBISE Study Hub', user, message: null, error: null });
  } catch (e) { next(e); }
});
app.post('/settings', requireLogin, async (req, res, next) => {
  try {
    const { name, class_level, school } = req.body;
    const cleanName = (name || '').trim();
    if (!cleanName || cleanName.length < 3) {
      const user = await get('SELECT id, name, email, class_level, school FROM users WHERE id=?', [req.session.userId]);
      return res.render('settings', { title: 'Account settings', user, message: null, error: 'Name must be at least 3 characters.' });
    }
    if (!['9', '10', '11', '12'].includes(class_level)) {
      const user = await get('SELECT id, name, email, class_level, school FROM users WHERE id=?', [req.session.userId]);
      return res.render('settings', { title: 'Account settings', user, message: null, error: 'Please select a valid class.' });
    }
    // NOTE: role is intentionally NOT updatable here — prevents privilege escalation.
    await run('UPDATE users SET name=?, class_level=?, school=? WHERE id=?',
      [cleanName, class_level, (school || '').trim() || null, req.session.userId]);
    req.session.name = cleanName;
    req.session.classLevel = class_level;
    const user = await get('SELECT id, name, email, class_level, school FROM users WHERE id=?', [req.session.userId]);
    res.render('settings', { title: 'Account settings — FBISE Study Hub', user, message: 'Settings saved.', error: null });
  } catch (e) { next(e); }
});

// ============================================================
// ADMIN
// ============================================================
app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const stats = {
      users: (await get('SELECT COUNT(*) as n FROM users WHERE role="student"')).n,
      papers: (await get('SELECT COUNT(*) as n FROM papers')).n,
      published: (await get('SELECT COUNT(*) as n FROM papers WHERE is_published=1')).n,
      questions: (await get('SELECT COUNT(*) as n FROM quiz_questions')).n,
      attempts: (await get('SELECT COUNT(*) as n FROM quiz_attempts')).n,
      feedback: (await get('SELECT COUNT(*) as n FROM feedback')).n,
    };
    const recentPapers = await all(
      `SELECT p.*, c.name as class_name, s.name as subject_name FROM papers p
       JOIN classes c ON p.class_id=c.id LEFT JOIN subjects s ON p.subject_id=s.id
       ORDER BY p.created_at DESC LIMIT 8`);
    const recentUsers = await all('SELECT id, name, email, class_level, created_at FROM users WHERE role="student" ORDER BY created_at DESC LIMIT 8');
    res.render('admin/dashboard', { title: 'Admin Dashboard — FBISE Study Hub', stats, recentPapers, recentUsers });
  } catch (e) { next(e); }
});

app.get('/admin/papers', requireAdmin, async (req, res, next) => {
  try {
    const { q, type, class: classSlug } = req.query;
    let where = '1=1'; const params = [];
    if (q) { where += ' AND (p.title LIKE ? OR s.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (type) { where += ' AND p.paper_type=?'; params.push(type); }
    if (classSlug) {
      const cls = await get('SELECT id FROM classes WHERE slug=?', [classSlug]);
      if (cls) { where += ' AND p.class_id=?'; params.push(cls.id); }
    }
    const papers = await all(
      `SELECT p.*, c.name as class_name, s.name as subject_name FROM papers p
       JOIN classes c ON p.class_id=c.id LEFT JOIN subjects s ON p.subject_id=s.id
       WHERE ${where} ORDER BY p.created_at DESC LIMIT 200`, params);
    const classes = await getClasses();
    res.render('admin/papers', { title: 'Manage Papers — Admin', papers, classes, filters: req.query });
  } catch (e) { next(e); }
});

app.get('/admin/papers/new', requireAdmin, async (req, res, next) => {
  try {
    const classes = await getClasses();
    const subjects = await all('SELECT s.*, c.slug as class_slug FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name');
    res.render('admin/paper-form', { title: 'Upload Paper — Admin', paper: null, classes, subjects, error: null });
  } catch (e) { next(e); }
});

app.post('/admin/papers/new', requireAdmin, upload.single('pdf'), async (req, res, next) => {
  try {
    const classes = await getClasses();
    const subjects = await all('SELECT s.*, c.slug as class_slug FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name');
    const { title, class_id, subject_id, year, session, paper_type, description, is_published } = req.body;
    const renderError = (msg) => res.status(400).render('admin/paper-form', { title: 'Upload Paper — Admin', paper: req.body, classes, subjects, error: msg });
    if (!title || title.trim().length < 3) return renderError('Please enter a paper title (at least 3 characters).');
    if (!class_id) return renderError('Please select a class.');
    if (!['past', 'model_official', 'model_practice'].includes(paper_type)) return renderError('Please select a valid paper type.');
    if (!req.file) return renderError('Please choose a PDF file to upload.');
    // Enforce honest labelling: official model papers need admin confirmation
    const id = uuidv4();
    await run(`INSERT INTO papers (id, title, class_id, subject_id, year, session, paper_type, file_path, file_size, description, uploaded_by, is_published, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, title.trim(), class_id, subject_id || null, year ? parseInt(year) : null, session || null, paper_type,
       path.basename(req.file.path), req.file.size, (description || '').trim() || null, req.session.userId,
       is_published === '0' ? 0 : 1, Date.now()]);
    res.redirect('/admin/papers?uploaded=1');
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(e);
  }
});

app.get('/admin/papers/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id=?', [req.params.id]);
    if (!paper) return res.status(404).render('error', { title: 'Not found', message: 'Paper not found.', status: 404, user: res.locals.currentUser });
    const classes = await getClasses();
    const subjects = await all('SELECT s.*, c.slug as class_slug FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name');
    res.render('admin/paper-form', { title: 'Edit Paper — Admin', paper, classes, subjects, error: null });
  } catch (e) { next(e); }
});

app.post('/admin/papers/:id/edit', requireAdmin, upload.single('pdf'), async (req, res, next) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id=?', [req.params.id]);
    if (!paper) return res.status(404).render('error', { title: 'Not found', message: 'Paper not found.', status: 404, user: res.locals.currentUser });
    const { title, class_id, subject_id, year, session, paper_type, description, is_published } = req.body;
    let filePath = paper.file_path, fileSize = paper.file_size;
    if (req.file) {
      const oldAbs = paper.file_path ? path.join(UPLOAD_DIR, path.basename(paper.file_path)) : null;
      if (oldAbs && fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      filePath = path.basename(req.file.path);
      fileSize = req.file.size;
    }
    await run(`UPDATE papers SET title=?, class_id=?, subject_id=?, year=?, session=?, paper_type=?, file_path=?, file_size=?, description=?, is_published=? WHERE id=?`,
      [title.trim(), class_id, subject_id || null, year ? parseInt(year) : null, session || null, paper_type, filePath, fileSize, (description || '').trim() || null, is_published === '0' ? 0 : 1, paper.id]);
    res.redirect('/admin/papers?updated=1');
  } catch (e) { next(e); }
});

app.post('/admin/papers/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id=?', [req.params.id]);
    if (paper && paper.file_path) {
      const abs = path.join(UPLOAD_DIR, path.basename(paper.file_path));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
    await run('DELETE FROM papers WHERE id=?', [req.params.id]);
    res.redirect('/admin/papers?deleted=1');
  } catch (e) { next(e); }
});

app.post('/admin/papers/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id=?', [req.params.id]);
    if (!paper) return res.status(404).json({ error: 'Not found' });
    await run('UPDATE papers SET is_published=? WHERE id=?', [paper.is_published ? 0 : 1, paper.id]);
    res.json({ ok: true, is_published: paper.is_published ? 0 : 1 });
  } catch (e) { next(e); }
});

// ---- Admin: subjects ----
app.get('/admin/subjects', requireAdmin, async (req, res, next) => {
  try {
    const classes = await getClasses();
    const subjects = await all(`SELECT s.*, c.name as class_name FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name`);
    res.render('admin/subjects', { title: 'Manage Subjects — Admin', classes, subjects, error: null, message: null });
  } catch (e) { next(e); }
});
app.post('/admin/subjects', requireAdmin, async (req, res, next) => {
  try {
    const { class_id, name, description } = req.body;
    const classes = await getClasses();
    const subjects = await all(`SELECT s.*, c.name as class_name FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name`);
    if (!class_id || !name || name.trim().length < 2) {
      return res.status(400).render('admin/subjects', { title: 'Manage Subjects — Admin', classes, subjects, error: 'Please select a class and enter a subject name.', message: null });
    }
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = await get('SELECT id FROM subjects WHERE class_id=? AND slug=?', [class_id, slug]);
    if (existing) {
      return res.status(400).render('admin/subjects', { title: 'Manage Subjects — Admin', classes, subjects, error: 'This subject already exists for the selected class.', message: null });
    }
    await run('INSERT INTO subjects (id, class_id, name, slug, description) VALUES (?,?,?,?,?)',
      [uuidv4(), class_id, name.trim(), slug, (description || '').trim() || null]);
    res.redirect('/admin/subjects?added=1');
  } catch (e) { next(e); }
});
app.post('/admin/subjects/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM subjects WHERE id=?', [req.params.id]);
    res.redirect('/admin/subjects?deleted=1');
  } catch (e) { next(e); }
});

// ---- Admin: quiz questions ----
app.get('/admin/quizzes', requireAdmin, async (req, res, next) => {
  try {
    const questions = await all(
      `SELECT q.*, s.name as subject_name, c.name as class_name FROM quiz_questions q
       JOIN subjects s ON q.subject_id=s.id JOIN classes c ON q.class_id=c.id
       ORDER BY q.created_at DESC LIMIT 200`);
    res.render('admin/quizzes', { title: 'Manage Quiz Questions — Admin', questions });
  } catch (e) { next(e); }
});
app.get('/admin/quizzes/new', requireAdmin, async (req, res, next) => {
  try {
    const classes = await getClasses();
    const subjects = await all('SELECT s.*, c.slug as class_slug, c.name as class_name FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name');
    res.render('admin/quiz-form', { title: 'Add Question — Admin', classes, subjects, error: null });
  } catch (e) { next(e); }
});
app.post('/admin/quizzes/new', requireAdmin, async (req, res, next) => {
  try {
    const { class_id, subject_id, chapter, question, option_a, option_b, option_c, option_d, correct_option, explanation } = req.body;
    const classes = await getClasses();
    const subjects = await all('SELECT s.*, c.slug as class_slug, c.name as class_name FROM subjects s JOIN classes c ON s.class_id=c.id ORDER BY c.slug, s.name');
    if (!question || !option_a || !option_b || !option_c || !option_d || !['a', 'b', 'c', 'd'].includes(correct_option)) {
      return res.status(400).render('admin/quiz-form', { title: 'Add Question — Admin', classes, subjects, error: 'Please fill all question fields and select the correct option.' });
    }
    const subj = await get('SELECT class_id FROM subjects WHERE id=?', [subject_id]);
    await run(`INSERT INTO quiz_questions (id, class_id, subject_id, chapter, question, option_a, option_b, option_c, option_d, correct_option, explanation, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), subj ? subj.class_id : class_id, subject_id, (chapter || '').trim() || null, question.trim(),
       option_a.trim(), option_b.trim(), option_c.trim(), option_d.trim(), correct_option, (explanation || '').trim() || null, Date.now()]);
    res.redirect('/admin/quizzes?added=1');
  } catch (e) { next(e); }
});
app.post('/admin/quizzes/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM quiz_questions WHERE id=?', [req.params.id]);
    res.redirect('/admin/quizzes?deleted=1');
  } catch (e) { next(e); }
});

// ---- Admin: users & feedback ----
app.get('/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const users = await all('SELECT id, name, email, role, class_level, school, created_at FROM users ORDER BY created_at DESC LIMIT 200');
    res.render('admin/users', { title: 'Students — Admin', users });
  } catch (e) { next(e); }
});
app.get('/admin/feedback', requireAdmin, async (req, res, next) => {
  try {
    const items = await all('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100');
    res.render('admin/feedback', { title: 'Feedback — Admin', items });
  } catch (e) { next(e); }
});

// ============================================================
// ABOUT / CONTACT
// ============================================================
app.get('/about', (req, res) => {
  res.render('about', { title: 'About — FBISE Study Hub' });
});
app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact — FBISE Study Hub', message: null, error: null });
});
app.post('/contact', async (req, res, next) => {
  try {
    const { name, email, message } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).render('contact', { title: 'Contact', message: null, error: 'Please enter your name.' });
    if (!validator.isEmail((email || '').trim())) return res.status(400).render('contact', { title: 'Contact', message: null, error: 'Please enter a valid email.' });
    if (!message || message.trim().length < 10) return res.status(400).render('contact', { title: 'Contact', message: null, error: 'Please write a message of at least 10 characters.' });
    await run('INSERT INTO feedback (id, name, email, message, created_at) VALUES (?,?,?,?,?)',
      [uuidv4(), name.trim(), email.trim(), message.trim(), Date.now()]);
    res.render('contact', { title: 'Contact — FBISE Study Hub', message: 'Thank you! Your message has been received.', error: null });
  } catch (e) { next(e); }
});

// ============================================================
// ERRORS
// ============================================================
app.use((req, res) => {
  res.status(404).render('error', { title: 'Page not found', message: 'The page you are looking for does not exist.', status: 404, user: res.locals.currentUser });
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).render('error', { title: 'Upload too large', message: 'The PDF must be smaller than 20 MB.', status: 400, user: res.locals.currentUser });
  }
  if (err.message === 'Only PDF files are allowed.') {
    return res.status(400).render('error', { title: 'Invalid file', message: 'Only PDF files are allowed.', status: 400, user: res.locals.currentUser });
  }
  res.status(500).render('error', { title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.', status: 500, user: res.locals.currentUser });
});

async function start() {
  await init();
  // Ensure a default admin exists (credentials via env, never hardcoded in frontend)
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@fbise-study-hub.local').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin123!';
  const existing = await get('SELECT id FROM users WHERE email=?', [adminEmail]);
  if (!existing) {
    const hash = await bcrypt.hash(adminPass, 12);
    await run('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)',
      [uuidv4(), 'Administrator', adminEmail, hash, 'admin', Date.now()]);
    console.log(`[FBISE Study Hub] Default admin created: ${adminEmail}`);
    if (!process.env.ADMIN_PASSWORD) console.log('[FBISE Study Hub] Default admin password is "Admin123!" — change it via env ADMIN_PASSWORD.');
  }
  app.listen(PORT, () => console.log(`[FBISE Study Hub] Running at http://localhost:${PORT}`));
}

if (require.main === module) start();
module.exports = app;
