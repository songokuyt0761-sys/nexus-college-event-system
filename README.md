# NEXUS — College Event Management System

A clean, dark, anime-inspired (subtle, not overloaded) college event website with a real Express backend and persistent JSON database.

## Requirements
- Node.js 22 or newer (tested design target: Node.js 26)
- npm

## Start the project (one terminal only)
1. Extract this ZIP.
2. Open the `NEXUS_College_Event_System` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

```powershell
npm.cmd install
npm.cmd start
```

5. Open https://nexus-college-event-system.onrender.com

The server serves both the frontend and backend, so you do not need separate terminals.

## Demo admin
- Email: ` `
- Password: ` `

Change this demo password and set a strong `SESSION_SECRET` before public deployment.

## Student use
Create a student account from **Join NEXUS**, then register for an event.

## Included
- Responsive frontend
- Express REST API
- Admin login and dashboard
- Student registration and login
- Create/delete events
- Event capacity checks
- Student event registration
- Registration/attendee views
- Persistent data in `data/db.json`
- Password hashing with Node's built-in `crypto.scrypt`
- No SQLite, Python, node-gyp, Vite or separate frontend terminal

## Important
This is a local college project starter. Before public production deployment, add HTTPS, stronger environment secrets, database backups, rate limiting, and a managed database.
