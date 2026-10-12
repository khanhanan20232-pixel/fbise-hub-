// src/db.js — SQLite database layer for FBISE Study Hub
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'fbise.db');
const db = new sqlite3.Database(DB_PATH);

// Promise helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function init() {
  // Enable foreign keys
  await run('PRAGMA foreign_keys = ON');

  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
    class_level TEXT CHECK(class_level IN ('9','10','11','12')),
    school TEXT,
    reset_token TEXT,
    reset_expires INTEGER,
    created_at INTEGER NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tagline TEXT,
    description TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    UNIQUE(class_id, slug)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
    year INTEGER,
    session TEXT CHECK(session IN ('Annual','Supplementary','2nd Annual') OR session IS NULL),
    paper_type TEXT NOT NULL CHECK(paper_type IN ('past','model_official','model_practice')),
    file_path TEXT,
    file_size INTEGER,
    description TEXT,
    uploaded_by TEXT REFERENCES users(id),
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter TEXT,
    question TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK(correct_option IN ('a','b','c','d')),
    explanation TEXT,
    created_at INTEGER NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS saved_resources (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    saved_at INTEGER NOT NULL,
    UNIQUE(user_id, paper_id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);

  // Seed classes if empty
  const classCount = await get('SELECT COUNT(*) as c FROM classes');
  if (classCount.c === 0) {
    const { v4: uuidv4 } = require('uuid');
    const classes = [
      { name: 'Class 9', slug: 'class-9', tagline: 'SSC Part I', description: 'Foundation year of secondary education under FBISE. Build strong concepts in all subjects.' },
      { name: 'Class 10', slug: 'class-10', tagline: 'SSC Part II', description: 'Board examination year. Practice with past papers and model papers to score high.' },
      { name: 'Class 11', slug: 'class-11', tagline: 'HSSC Part I · First Year', description: 'Start of intermediate studies. Master the new syllabus with chapter-wise quizzes.' },
      { name: 'Class 12', slug: 'class-12', tagline: 'HSSC Part II · Second Year', description: 'Final board year. Focused revision, past papers and timed practice.' },
    ];
    for (const c of classes) {
      await run('INSERT INTO classes (id, name, slug, tagline, description) VALUES (?,?,?,?,?)',
        [uuidv4(), c.name, c.slug, c.tagline, c.description]);
    }
  }
}

module.exports = { db, run, get, all, init, DB_PATH };
