const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

let token = sessionStorage.getItem('token');
let me = null;
let timer = null;

// ---------- Helpers ----------
async function api(url, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  setTimeout(() => (t.className = ''), 3000);
}

async function run(fn) {
  try { await fn(); } catch (e) { toast(e.message, true); }
}

// ---------- Login / Logout ----------
function showLogin() {
  clearInterval(timer);
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    const data = await api('/login', 'POST', { email: $('#email').value, password: $('#password').value });
    token = data.token;
    sessionStorage.setItem('token', token);
    me = data.user;
    $('#password').value = '';
    showApp();
  });
});

async function logout() {
  try { await api('/logout', 'POST'); } catch (e) { /* ignore */ }
  token = null;
  me = null;
  sessionStorage.removeItem('token');
  showLogin();
}

function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userInfo').textContent = me.name + ' (' + me.role + ')';

  const tabs =
    me.role === 'admin' ? [['Users', viewUsers], ['Exams', viewExams]] :
    me.role === 'teacher' ? [['My Exams', viewExams]] :
    [['Exams', viewStudent]];

  $('#nav').innerHTML = '';
  tabs.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { clearInterval(timer); fn(); };
    $('#nav').appendChild(b);
  });
  tabs[0][1]();
}

// ---------- Admin: Users ----------
async function viewUsers() {
  await run(async () => {
    const users = await api('/users');
    $('#view').innerHTML = `
      <div class="card">
        <h2>Add User</h2>
        <div class="row">
          <input id="uName" placeholder="Full name">
          <input id="uEmail" placeholder="Email">
          <input id="uPass" type="password" placeholder="Password">
          <select id="uRole">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
          <button onclick="addUser()">Add</button>
        </div>
      </div>
      <div class="card">
        <h2>All Users (${users.length})</h2>
        <table>
          <tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
          ${users.map((u) => `
            <tr>
              <td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td>
              <td>${u.id === me.id ? '' : `<button class="danger" onclick="delUser(${u.id})">Delete</button>`}</td>
            </tr>`).join('')}
        </table>
      </div>`;
  });
}

function addUser() {
  run(async () => {
    await api('/users', 'POST', {
      name: $('#uName').value, email: $('#uEmail').value,
      password: $('#uPass').value, role: $('#uRole').value
    });
    toast('User added');
    viewUsers();
  });
}

function delUser(id) {
  if (!confirm('Delete this user?')) return;
  run(async () => { await api('/users/' + id, 'DELETE'); toast('User deleted'); viewUsers(); });
}

// ---------- Teacher/Admin: Exams ----------
async function viewExams() {
  await run(async () => {
    const exams = await api('/exams');
    $('#view').innerHTML = `
      <div class="card">
        <h2>Create Exam</h2>
        <div class="row">
          <input id="eTitle" placeholder="Exam title">
          <input id="eSubject" placeholder="Subject">
          <input id="eDur" type="number" min="1" placeholder="Duration (minutes)">
          <button onclick="addExam()">Create</button>
        </div>
      </div>
      <div class="card">
        <h2>Exams</h2>
        ${exams.length ? `
        <table>
          <tr><th>Title</th><th>Subject</th><th>Time</th><th>Questions</th><th>Submitted</th><th>Status</th><th></th></tr>
          ${exams.map((e) => `
            <tr>
              <td>${esc(e.title)}</td><td>${esc(e.subject)}</td><td>${e.duration} min</td>
              <td>${e.questionCount}</td><td>${e.submissions}</td>
              <td><span class="badge ${e.published ? 'green' : 'yellow'}">${e.published ? 'Published' : 'Draft'}</span></td>
              <td><div class="actions">
                <button onclick="viewManage(${e.id})">Manage</button>
                <button class="danger" onclick="delExam(${e.id})">Delete</button>
              </div></td>
            </tr>`).join('')}
        </table>` : '<p class="muted">No exams yet. Create your first exam above.</p>'}
      </div>`;
  });
}

function addExam() {
  run(async () => {
    const exam = await api('/exams', 'POST', {
      title: $('#eTitle').value, subject: $('#eSubject').value, duration: $('#eDur').value
    });
    toast('Exam created. Now add questions.');
    viewManage(exam.id);
  });
}

function delExam(id) {
  if (!confirm('Delete this exam with all its questions and results?')) return;
  run(async () => { await api('/exams/' + id, 'DELETE'); toast('Exam deleted'); viewExams(); });
}

async function viewManage(id) {
  await run(async () => {
    const [exams, questions, results] = await Promise.all([
      api('/exams'), api(`/exams/${id}/questions`), api(`/exams/${id}/results`)
    ]);
    const exam = exams.find((e) => e.id === id);
    const letters = ['A', 'B', 'C', 'D'];

    $('#view').innerHTML = `
      <button class="secondary" onclick="viewExams()">&larr; Back to exams</button>
      <div class="card" style="margin-top:12px">
        <div class="examHead">
          <div>
            <h2 style="margin:0">${esc(exam.title)}</h2>
            <span class="muted">${esc(exam.subject)} &bull; ${exam.duration} minutes &bull; ${questions.length} questions</span>
          </div>
          <button class="${exam.published ? 'danger' : 'success'}" onclick="togglePublish(${id})">
            ${exam.published ? 'Unpublish' : 'Publish for students'}
          </button>
        </div>
      </div>

      <div class="card">
        <h2>Add Question (MCQ)</h2>
        <div class="stack">
          <input id="qText" placeholder="Question">
          <div class="row">
            <input id="o0" placeholder="Option A"><input id="o1" placeholder="Option B">
            <input id="o2" placeholder="Option C"><input id="o3" placeholder="Option D">
          </div>
          <div class="row">
            <select id="qCorrect">
              <option value="0">Correct answer: A</option><option value="1">Correct answer: B</option>
              <option value="2">Correct answer: C</option><option value="3">Correct answer: D</option>
            </select>
            <button onclick="addQuestion(${id})">Add Question</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Questions</h2>
        ${questions.length ? questions.map((q, i) => `
          <div class="q-manage">
            <div>
              <b>${i + 1}. ${esc(q.question)}</b><br>
              ${q.options.map((o, j) => `<span class="${j === q.correct ? 'correct' : ''}">${letters[j]}) ${esc(o)}</span>`).join(' &nbsp; ')}
            </div>
            <button class="danger" onclick="delQuestion(${q.id}, ${id})">Delete</button>
          </div>`).join('') : '<p class="muted">No questions added yet.</p>'}
      </div>

      <div class="card">
        <h2>Results</h2>
        ${results.length ? `
        <table>
          <tr><th>Student</th><th>Email</th><th>Score</th><th>Percentage</th><th>Submitted</th></tr>
          ${results.map((r) => `
            <tr>
              <td>${esc(r.student)}</td><td>${esc(r.email)}</td><td>${r.score} / ${r.total}</td>
              <td>${r.total ? Math.round((r.score / r.total) * 100) : 0}%</td>
              <td>${new Date(r.submittedAt).toLocaleString()}</td>
            </tr>`).join('')}
        </table>` : '<p class="muted">No submissions yet.</p>'}
      </div>`;
  });
}

function addQuestion(examId) {
  run(async () => {
    await api(`/exams/${examId}/questions`, 'POST', {
      question: $('#qText').value,
      options: [0, 1, 2, 3].map((i) => $('#o' + i).value),
      correct: Number($('#qCorrect').value)
    });
    toast('Question added');
    viewManage(examId);
  });
}

function delQuestion(qid, examId) {
  run(async () => { await api('/questions/' + qid, 'DELETE'); viewManage(examId); });
}

function togglePublish(id) {
  run(async () => { await api(`/exams/${id}/publish`, 'PATCH'); viewManage(id); });
}

// ---------- Student ----------
async function viewStudent() {
  await run(async () => {
    const exams = await api('/exams');
    $('#view').innerHTML = `
      <div class="card">
        <h2>Available Exams</h2>
        ${exams.length ? `
        <table>
          <tr><th>Title</th><th>Subject</th><th>Time</th><th>Questions</th><th>Status</th><th></th></tr>
          ${exams.map((e) => `
            <tr>
              <td>${esc(e.title)}</td><td>${esc(e.subject)}</td><td>${e.duration} min</td><td>${e.questionCount}</td>
              <td>${e.status === 'completed'
                  ? `<span class="badge green">Score: ${e.score} / ${e.total}</span>`
                  : e.status === 'in-progress' ? '<span class="badge yellow">In progress</span>' : '<span class="badge">Not attempted</span>'}</td>
              <td>${e.status === 'completed' ? '' : `<button onclick="startExam(${e.id})">${e.status === 'new' ? 'Start Exam' : 'Resume'}</button>`}</td>
            </tr>`).join('')}
        </table>` : '<p class="muted">No exams available right now.</p>'}
      </div>`;
  });
}

async function startExam(id) {
  if (!confirm('Start the exam? The timer begins now and you can attempt it only once.')) return;
  await run(async () => {
    const d = await api(`/exams/${id}/start`, 'POST');
    const offset = d.serverNow - Date.now();

    $('#view').innerHTML = `
      <div class="card">
        <div class="examHead">
          <div><h2 style="margin:0">${esc(d.exam.title)}</h2><span class="muted">${esc(d.exam.subject)}</span></div>
          <div id="clock" class="clock"></div>
        </div>
        ${d.questions.map((q, i) => `
          <div class="q">
            <p><b>${i + 1}.</b> ${esc(q.question)}</p>
            ${q.options.map((o, j) => `<label><input type="radio" name="q${q.id}" value="${j}"> ${esc(o)}</label>`).join('')}
          </div>`).join('')}
        <br><button id="submitBtn" class="success">Submit Exam</button>
      </div>`;

    let done = false;
    const submit = async (auto) => {
      if (done) return;
      if (!auto && !confirm('Submit your answers now?')) return;
      done = true;
      clearInterval(timer);
      const answers = {};
      d.questions.forEach((q) => {
        const c = document.querySelector(`input[name="q${q.id}"]:checked`);
        if (c) answers[q.id] = Number(c.value);
      });
      try {
        const r = await api(`/exams/${id}/submit`, 'POST', { answers });
        showResult(r, auto);
      } catch (e) {
        done = false;
        toast(e.message, true);
      }
    };

    $('#submitBtn').onclick = () => submit(false);

    const tick = () => {
      const left = d.endsAt - (Date.now() + offset);
      if (left <= 0) { $('#clock').textContent = '00:00'; submit(true); return; }
      $('#clock').textContent = pad(Math.floor(left / 60000)) + ':' + pad(Math.floor((left % 60000) / 1000));
      $('#clock').classList.toggle('low', left < 60000);
    };
    tick();
    timer = setInterval(tick, 1000);
  });
}

function showResult(r, auto) {
  const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
  $('#view').innerHTML = `
    <div class="card result">
      <h2>${auto ? 'Time is up! Exam submitted.' : 'Exam submitted successfully'}</h2>
      <div class="big">${r.score} / ${r.total}</div>
      <p>You scored ${pct}%</p>
      <button onclick="viewStudent()">Back to exams</button>
    </div>`;
}

// ---------- Start ----------
(async function init() {
  if (token) {
    try { me = await api('/me'); showApp(); return; } catch (e) { /* session expired */ }
  }
  showLogin();
})();
