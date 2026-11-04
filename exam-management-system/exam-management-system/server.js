const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// ---------- Password helpers (built-in crypto, no extra packages) ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

// ---------- Simple JSON file database ----------
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const fresh = {
      nextId: 2,
      users: [{ id: 1, name: 'Admin', email: 'admin@college.edu', password: hashPassword('admin123'), role: 'admin' }],
      exams: [],
      questions: [],
      attempts: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
const db = loadDb();
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const newId = () => db.nextId++;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// ---------- Auth ----------
const sessions = new Map(); // token -> userId

function auth(...roles) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const user = db.users.find((u) => u.id === sessions.get(token));
    if (!user) return res.status(401).json({ error: 'Please login first' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Access denied' });
    req.user = user;
    req.token = token;
    next();
  };
}

// Teacher can manage own exams; admin can manage all
function managedExam(req, res) {
  const exam = db.exams.find((e) => e.id === Number(req.params.id));
  if (!exam || (req.user.role !== 'admin' && exam.teacherId !== req.user.id)) {
    res.status(404).json({ error: 'Exam not found' });
    return null;
  }
  return exam;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Login / Logout ----------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase());
  if (!user || !checkPassword(String(password || ''), user.password)) {
    return res.status(400).json({ error: 'Wrong email or password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/logout', auth(), (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.get('/api/me', auth(), (req, res) => res.json(publicUser(req.user)));

// ---------- Users (admin) ----------
app.get('/api/users', auth('admin'), (req, res) => res.json(db.users.map(publicUser)));

app.post('/api/users', auth('admin'), (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || !['admin', 'teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Name, email, password and a valid role are required' });
  }
  if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
    return res.status(400).json({ error: 'This email is already registered' });
  }
  const user = { id: newId(), name: name.trim(), email: email.trim(), password: hashPassword(password), role };
  db.users.push(user);
  save();
  res.json(publicUser(user));
});

app.delete('/api/users/:id', auth('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  db.users = db.users.filter((u) => u.id !== id);
  save();
  res.json({ ok: true });
});

// ---------- Exams ----------
app.get('/api/exams', auth(), (req, res) => {
  const u = req.user;
  const count = (id) => db.questions.filter((q) => q.examId === id).length;

  if (u.role === 'student') {
    const list = db.exams
      .filter((e) => e.published && count(e.id) > 0)
      .map((e) => {
        const att = db.attempts.find((a) => a.examId === e.id && a.studentId === u.id);
        return {
          id: e.id, title: e.title, subject: e.subject, duration: e.duration,
          questionCount: count(e.id),
          status: att ? (att.submitted ? 'completed' : 'in-progress') : 'new',
          score: att && att.submitted ? att.score : null,
          total: att && att.submitted ? att.total : null
        };
      });
    return res.json(list);
  }

  const list = db.exams
    .filter((e) => u.role === 'admin' || e.teacherId === u.id)
    .map((e) => ({
      ...e,
      questionCount: count(e.id),
      submissions: db.attempts.filter((a) => a.examId === e.id && a.submitted).length
    }));
  res.json(list);
});

app.post('/api/exams', auth('teacher', 'admin'), (req, res) => {
  const { title, subject, duration } = req.body || {};
  if (!title || !subject || !(Number(duration) > 0)) {
    return res.status(400).json({ error: 'Title, subject and duration are required' });
  }
  const exam = {
    id: newId(), title: title.trim(), subject: subject.trim(),
    duration: Number(duration), teacherId: req.user.id, published: false
  };
  db.exams.push(exam);
  save();
  res.json(exam);
});

app.patch('/api/exams/:id/publish', auth('teacher', 'admin'), (req, res) => {
  const exam = managedExam(req, res);
  if (!exam) return;
  if (!exam.published && !db.questions.some((q) => q.examId === exam.id)) {
    return res.status(400).json({ error: 'Add at least one question before publishing' });
  }
  exam.published = !exam.published;
  save();
  res.json(exam);
});

app.delete('/api/exams/:id', auth('teacher', 'admin'), (req, res) => {
  const exam = managedExam(req, res);
  if (!exam) return;
  db.exams = db.exams.filter((e) => e.id !== exam.id);
  db.questions = db.questions.filter((q) => q.examId !== exam.id);
  db.attempts = db.attempts.filter((a) => a.examId !== exam.id);
  save();
  res.json({ ok: true });
});

// ---------- Questions ----------
app.get('/api/exams/:id/questions', auth('teacher', 'admin'), (req, res) => {
  const exam = managedExam(req, res);
  if (!exam) return;
  res.json(db.questions.filter((q) => q.examId === exam.id));
});

app.post('/api/exams/:id/questions', auth('teacher', 'admin'), (req, res) => {
  const exam = managedExam(req, res);
  if (!exam) return;
  const { question, options, correct } = req.body || {};
  const opts = Array.isArray(options) ? options.map((o) => String(o).trim()) : [];
  if (!question || opts.length !== 4 || opts.some((o) => !o) || ![0, 1, 2, 3].includes(Number(correct))) {
    return res.status(400).json({ error: 'Enter the question, all 4 options and the correct answer' });
  }
  const q = { id: newId(), examId: exam.id, question: question.trim(), options: opts, correct: Number(correct) };
  db.questions.push(q);
  save();
  res.json(q);
});

app.delete('/api/questions/:id', auth('teacher', 'admin'), (req, res) => {
  const q = db.questions.find((x) => x.id === Number(req.params.id));
  const exam = q && db.exams.find((e) => e.id === q.examId);
  if (!q || (req.user.role !== 'admin' && exam.teacherId !== req.user.id)) {
    return res.status(404).json({ error: 'Question not found' });
  }
  db.questions = db.questions.filter((x) => x.id !== q.id);
  save();
  res.json({ ok: true });
});

// ---------- Results (teacher/admin) ----------
app.get('/api/exams/:id/results', auth('teacher', 'admin'), (req, res) => {
  const exam = managedExam(req, res);
  if (!exam) return;
  const rows = db.attempts
    .filter((a) => a.examId === exam.id && a.submitted)
    .map((a) => {
      const s = db.users.find((u) => u.id === a.studentId);
      return {
        student: s ? s.name : 'Deleted user', email: s ? s.email : '',
        score: a.score, total: a.total, submittedAt: a.submittedAt
      };
    });
  res.json(rows);
});

// ---------- Student: take exam ----------
app.post('/api/exams/:id/start', auth('student'), (req, res) => {
  const exam = db.exams.find((e) => e.id === Number(req.params.id) && e.published);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  let att = db.attempts.find((a) => a.examId === exam.id && a.studentId === req.user.id);
  if (att && att.submitted) return res.status(400).json({ error: 'You have already attempted this exam' });
  if (!att) {
    att = { id: newId(), examId: exam.id, studentId: req.user.id, startedAt: Date.now(), submitted: false };
    db.attempts.push(att);
    save();
  }
  const questions = db.questions
    .filter((q) => q.examId === exam.id)
    .map((q) => ({ id: q.id, question: q.question, options: q.options })); // correct answer is NOT sent

  res.json({
    exam: { id: exam.id, title: exam.title, subject: exam.subject, duration: exam.duration },
    questions,
    endsAt: att.startedAt + exam.duration * 60000,
    serverNow: Date.now()
  });
});

app.post('/api/exams/:id/submit', auth('student'), (req, res) => {
  const exam = db.exams.find((e) => e.id === Number(req.params.id));
  const att = exam && db.attempts.find((a) => a.examId === exam.id && a.studentId === req.user.id);
  if (!att) return res.status(400).json({ error: 'Exam was not started' });
  if (att.submitted) return res.status(400).json({ error: 'You have already submitted this exam' });

  const late = Date.now() > att.startedAt + exam.duration * 60000 + 60000; // 1 min grace
  const answers = late ? {} : (req.body && req.body.answers) || {};
  const qs = db.questions.filter((q) => q.examId === exam.id);

  let score = 0;
  qs.forEach((q) => {
    const a = answers[q.id];
    if (a !== undefined && a !== null && Number(a) === q.correct) score++;
  });

  att.submitted = true;
  att.score = score;
  att.total = qs.length;
  att.submittedAt = Date.now();
  save();
  res.json({ score, total: qs.length, late });
});

app.listen(PORT, () => {
  console.log(`Exam Management System running at http://localhost:${PORT}`);
  console.log('Default admin login -> admin@college.edu / admin123');
});
