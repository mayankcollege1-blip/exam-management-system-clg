# Exam Management System

A college exam management system with three roles: **Admin**, **Teacher** and **Student**.

## Features

- **Admin:** add and delete users (students, teachers, admins), manage all exams
- **Teacher:** create exams, add MCQ questions, publish exams, view student results
- **Student:** see published exams, attempt with a live timer, get an instant auto-graded score
- Secure login (hashed passwords, token-based sessions)
- Role-based access (a student cannot open teacher or admin pages)
- Each student can attempt an exam only once
- Auto-submit when the timer ends
- Correct answers are never sent to the student's browser during the exam

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Storage: JSON file (`data/db.json`, created automatically on first run)

## How to Run

1. Install [Node.js](https://nodejs.org) (version 16 or higher)
2. Open a terminal in the project folder and run:

```bash
npm install
npm start
```

3. Open http://localhost:3000 in your browser

## Default Login

| Role | Email | Password |
|---|---|---|
| Admin | admin@college.edu | admin123 |

Change this password after first use. Log in as admin, add teachers and students, then log in as a teacher to create exams.

## Project Structure

```
exam-management-system/
├── server.js          # Backend and API routes
├── package.json
├── public/
│   ├── index.html     # Page layout
│   ├── style.css      # Styling
│   └── app.js         # Frontend logic for all roles
├── data/              # Created automatically (db.json)
└── README.md
```

## Typical Flow

1. Admin logs in and adds a teacher and some students
2. Teacher logs in, creates an exam, adds questions and publishes it
3. Student logs in, starts the exam, submits and sees the score
4. Teacher opens the exam to see all student results
