// src/seed.js — one-time content seed for FBISE Study Hub.
// Inserts the FBISE subject list per class and a starter set of PRACTICE
// quiz questions (clearly labelled as practice — never official papers).
// Safe to run multiple times: it skips anything that already exists.
//
// Usage: npm run seed
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { init, run, get, all } = require('./db');

const SUBJECT_DESCRIPTIONS = {
  'English': 'Grammar, comprehension and composition.',
  'Urdu': 'Urdu literature, grammar and composition.',
  'Mathematics': 'Algebra, geometry and trigonometry.',
  'Physics': 'Mechanics, waves, electricity and magnetism.',
  'Chemistry': 'Atomic structure, bonding and chemical reactions.',
  'Biology': 'Cells, life processes and human body systems.',
  'Computer Science': 'Computing fundamentals and programming basics.',
  'Islamiat': 'Quranic studies, Seerah and Islamic teachings.',
  'Pak Studies': 'Ideology of Pakistan and national history.',
  'Tarjuma-tul-Quran': 'Translation and understanding of the Holy Quran.',
};

// class slug -> subject names (FBISE scheme; no official papers are invented here)
const SUBJECTS_BY_CLASS = {
  'class-9': ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Islamiat', 'Pak Studies', 'Tarjuma-tul-Quran'],
  'class-10': ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Islamiat', 'Pak Studies', 'Tarjuma-tul-Quran'],
  'class-11': ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Islamiat'],
  'class-12': ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Pak Studies'],
};

// [classSlug, subjectName, chapter, question, A, B, C, D, correct, explanation]
const QUESTIONS = [
  // ---- Class 9 ----
  ['class-9', 'English', 'Tenses', 'Choose the grammatically correct sentence:',
    'He go to school daily.', 'He goes to school daily.', 'He going to school daily.', 'He gone to school daily.',
    'b', 'With third-person singular subjects (he/she/it) the present simple verb takes an -s: "he goes".'],
  ['class-9', 'Urdu', 'Mutradifaat', 'لفظ "علم" کا مترادف ہے:',
    'جہالت', 'دانش', 'دولت', 'طاقت',
    'b', '"دانش" علم ہی کا مترادف ہے جبکہ جہالت اس کا متضاد ہے۔'],
  ['class-9', 'Mathematics', 'Matrices and Determinants', 'If A = [[1, 2], [3, 4]], then det(A) equals:',
    '-2', '2', '10', '-10',
    'a', 'det(A) = (1 × 4) − (2 × 3) = 4 − 6 = −2.'],
  ['class-9', 'Physics', 'Kinematics', 'A car starts from rest and accelerates at 2 m/s² for 5 s. Its final velocity is:',
    '5 m/s', '10 m/s', '12 m/s', '20 m/s',
    'b', 'v = u + at = 0 + (2)(5) = 10 m/s.'],
  ['class-9', 'Chemistry', 'Structure of Atoms', 'The atomic number of an element equals the number of:',
    'neutrons', 'protons', 'neutrons plus electrons', 'nucleons',
    'b', 'Atomic number (Z) is defined as the number of protons in the nucleus.'],
  ['class-9', 'Biology', 'Cells and Tissues', 'Which organelle is called the powerhouse of the cell?',
    'Nucleus', 'Ribosome', 'Mitochondrion', 'Vacuole',
    'c', 'Mitochondria release energy from food through respiration, powering the cell.'],
  ['class-9', 'Computer Science', 'Number Systems', 'The binary equivalent of decimal 13 is:',
    '1011', '1101', '1110', '1001',
    'b', '13 = 8 + 4 + 1, so in binary it is 1101.'],
  ['class-9', 'Islamiat', 'The Holy Quran', 'The first revelation of the Holy Quran was from Surah:',
    'Al-Fatiha', 'Al-Alaq', 'Al-Baqarah', 'Ya-Sin',
    'b', 'The first five verses of Surah Al-Alaq were revealed to the Prophet ﷺ in Cave Hira.'],
  ['class-9', 'Pak Studies', 'Ideology of Pakistan', 'The Lahore Resolution was passed in the year:',
    '1930', '1940', '1946', '1947',
    'b', 'The Lahore Resolution, demanding separate states for Muslims, was passed on 23 March 1940.'],
  ['class-9', 'Tarjuma-tul-Quran', 'Surah Al-Fatiha', 'Surah Al-Fatiha is also known as:',
    'Umm-ul-Kitab', 'Surah Al-Ikhlas', 'Ayat-ul-Kursi', 'Surah Al-Kausar',
    'a', 'Al-Fatiha is called Umm-ul-Kitab (the Mother of the Book) because it summarises the Quran.'],

  // ---- Class 10 ----
  ['class-10', 'English', 'Active and Passive Voice', 'Choose the passive voice of "She writes a letter."',
    'A letter is written by her.', 'A letter was written by her.', 'A letter is being written by her.', 'A letter has written by her.',
    'a', 'Present simple active becomes present simple passive: is + past participle ("is written").'],
  ['class-10', 'Mathematics', 'Quadratic Equations', 'The discriminant of x² + 4x + 4 = 0 is:',
    '0', '4', '16', '-16',
    'a', 'D = b² − 4ac = 16 − 16 = 0, so the equation has equal roots.'],
  ['class-10', 'Physics', 'Current Electricity', "Ohm's law is correctly stated as:",
    'V = IR', 'I = VR', 'R = VI', 'P = VI',
    'a', "Ohm's law: voltage across a conductor equals current times resistance (V = IR)."],
  ['class-10', 'Chemistry', 'Acids, Bases and Salts', 'The pH of a neutral solution at 25°C is:',
    '0', '1', '7', '14',
    'c', 'On the pH scale, 7 is neutral; below 7 is acidic and above 7 is basic.'],
  ['class-10', 'Biology', 'Gaseous Exchange', 'In humans, gaseous exchange mainly takes place in the:',
    'trachea', 'bronchi', 'alveoli', 'diaphragm',
    'c', 'Alveoli are tiny air sacs with thin walls and rich blood supply, ideal for gas exchange.'],
  ['class-10', 'Computer Science', 'Control Structures', 'Which loop executes its body at least once, even if the condition is false?',
    'for loop', 'while loop', 'do-while loop', 'nested loop',
    'c', 'A do-while loop checks its condition after the body, so the body always runs once.'],

  // ---- Class 11 ----
  ['class-11', 'English', 'Prepositions', 'He is good ___ mathematics.',
    'in', 'at', 'for', 'of',
    'b', 'The correct collocation is "good at" something.'],
  ['class-11', 'Mathematics', 'Functions and Limits', 'If f(x) = 2x + 3, then f(4) equals:',
    '8', '11', '10', '14',
    'b', 'f(4) = 2(4) + 3 = 8 + 3 = 11.'],
  ['class-11', 'Physics', 'Vectors and Equilibrium', 'The magnitude of vector A = 3i + 4j is:',
    '5', '7', '12', '25',
    'a', '|A| = √(3² + 4²) = √25 = 5.'],
  ['class-11', 'Chemistry', 'Chemical Bonding', 'Which type of bond is formed by the sharing of electrons?',
    'Ionic bond', 'Covalent bond', 'Metallic bond', 'Hydrogen bond',
    'b', 'Covalent bonds form when atoms share pairs of electrons.'],
  ['class-11', 'Biology', 'Cell Division', 'Mitosis produces:',
    'two genetically identical daughter cells', 'four different cells', 'two different cells', 'a single cell',
    'a', 'Mitosis is equational division: one cell gives two identical diploid daughter cells.'],
  ['class-11', 'Computer Science', 'Data Types', 'Which data type is used to store whole numbers?',
    'float', 'char', 'int', 'string',
    'c', '"int" stores integers (whole numbers) without fractional parts.'],
  ['class-11', 'Islamiat', 'Seerah of the Prophet ﷺ', 'The first major battle of Islam is:',
    'Uhud', 'Badr', 'Khandaq', 'Hunain',
    'b', 'The Battle of Badr was fought in 2 AH and was the first decisive battle.'],

  // ---- Class 12 ----
  ['class-12', 'English', 'Direct and Indirect Narration', 'Choose the indirect speech of: He said, "I am tired."',
    'He said that he was tired.', 'He said that he is tired.', 'He says that he was tired.', 'He said that I was tired.',
    'a', 'In reported speech the present tense shifts back: "am" becomes "was", and "I" becomes "he".'],
  ['class-12', 'Mathematics', 'Differentiation', 'The derivative of x³ with respect to x is:',
    '3x', '3x²', 'x²', '3',
    'b', 'Using the power rule: d/dx(xⁿ) = n·xⁿ⁻¹, so d/dx(x³) = 3x².'],
  ['class-12', 'Physics', 'Electrostatics', 'The SI unit of electric charge is the:',
    'volt', 'ampere', 'coulomb', 'ohm',
    'c', 'Charge is measured in coulombs (C); the volt, ampere and ohm measure potential, current and resistance.'],
  ['class-12', 'Chemistry', 'Fundamental Principles of Organic Chemistry', 'The general formula of alkanes is:',
    'CₙH₂ₙ', 'CₙH₂ₙ₊₂', 'CₙH₂ₙ₋₂', 'CₙHₙ',
    'b', 'Alkanes are saturated hydrocarbons with the general formula CₙH₂ₙ₊₂.'],
  ['class-12', 'Biology', 'Inheritance', 'The genetic material in most organisms is:',
    'protein', 'DNA', 'lipid', 'carbohydrate',
    'b', 'DNA (deoxyribonucleic acid) carries hereditary information in almost all organisms.'],
  ['class-12', 'Computer Science', 'Database Systems', 'SQL stands for:',
    'Structured Query Language', 'Simple Query Language', 'Standard Question Language', 'System Query Logic',
    'a', 'SQL — Structured Query Language — is used to manage relational databases.'],
  ['class-12', 'Pak Studies', 'Constitutional History', 'The 1973 Constitution of Pakistan came into force on:',
    '23 March 1973', '14 August 1973', '25 December 1973', '1 January 1974',
    'b', 'The 1973 Constitution was enforced on 14 August 1973.'],
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function seedSubjects() {
  const existing = await get('SELECT COUNT(*) AS c FROM subjects');
  if (existing.c > 0) {
    console.log(`Subjects: ${existing.c} already in database — skipping.`);
    return existing.c;
  }
  let inserted = 0;
  for (const [classSlug, names] of Object.entries(SUBJECTS_BY_CLASS)) {
    const cls = await get('SELECT id FROM classes WHERE slug = ?', [classSlug]);
    if (!cls) {
      console.log(`Warning: class "${classSlug}" not found — skipping its subjects.`);
      continue;
    }
    for (const name of names) {
      await run(
        'INSERT INTO subjects (id, class_id, name, slug, description) VALUES (?,?,?,?,?)',
        [uuidv4(), cls.id, name, slugify(name), SUBJECT_DESCRIPTIONS[name] || null]
      );
      inserted++;
    }
  }
  console.log(`Subjects: inserted ${inserted}.`);
  return inserted;
}

async function seedQuestions() {
  const existing = await get('SELECT COUNT(*) AS c FROM quiz_questions');
  if (existing.c >= 20) {
    console.log(`Quiz questions: ${existing.c} already in database — skipping.`);
    return existing.c;
  }
  const now = Date.now();
  let inserted = 0;
  for (const [classSlug, subjectName, chapter, question, a, b, c, d, correct, explanation] of QUESTIONS) {
    const cls = await get('SELECT id FROM classes WHERE slug = ?', [classSlug]);
    if (!cls) continue;
    const subj = await get('SELECT id FROM subjects WHERE class_id = ? AND name = ?', [cls.id, subjectName]);
    if (!subj) continue;
    const dup = await get('SELECT id FROM quiz_questions WHERE subject_id = ? AND question = ?', [subj.id, question]);
    if (dup) continue;
    await run(
      `INSERT INTO quiz_questions
        (id, class_id, subject_id, chapter, question, option_a, option_b, option_c, option_d, correct_option, explanation, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), cls.id, subj.id, chapter, question, a, b, c, d, correct, explanation, now]
    );
    inserted++;
  }
  console.log(`Quiz questions: inserted ${inserted} practice questions.`);
  return inserted;
}

async function main() {
  await init(); // ensures classes table is seeded first
  console.log('Seeding FBISE Study Hub content…');
  const subjects = await seedSubjects();
  const questions = await seedQuestions();
  const totals = await all(`SELECT 'subjects' AS k, COUNT(*) AS c FROM subjects
    UNION ALL SELECT 'quiz_questions', COUNT(*) FROM quiz_questions`);
  console.log('Done. Totals:', totals.map(t => `${t.k}=${t.c}`).join(', '));
  console.log('Note: no official papers were fabricated — only subjects and practice questions were added.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
