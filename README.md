# SentriX — Enterprise Risk & Compliance Management

A full-stack portfolio project for practicing enterprise risk workflows, authorization and audit logging.

## Features
- Employee registration and login with JWT
- One-time admin bootstrap
- Admin creates, edits and assigns risks; employees only see assigned risks
- Employees update risk status; admin verifies `pending_review` risks to close them
- Risk charts, dashboard counters and per-risk audit history
- Input validation, password hashing, basic rate limiting, CORS and HTTP security headers

## Requirements
- Node.js 20+ and npm
- MongoDB running locally, or a MongoDB Atlas URI

## Start backend
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your MongoDB URI, a strong JWT_SECRET, and a DIFFERENT ADMIN_SETUP_KEY
npm run dev
```
Windows PowerShell: `Copy-Item .env.example .env` instead of `cp`.

## Start frontend (new terminal)
```bash
cd client
npm install
cp .env.example .env
npm run dev
```
PowerShell: `Copy-Item .env.example .env`. Visit http://localhost:5173.

## Create the first admin (one time)
Before registering the admin email in the web UI, run this in a third terminal (PowerShell):
```powershell
$headers = @{ 'Content-Type' = 'application/json'; 'x-setup-key' = 'YOUR_ADMIN_SETUP_KEY' }
$body = @{ name='Demo Admin'; email='admin@example.com'; password='ChangeThisStrongPassword123!' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/setup-admin' -Method Post -Headers $headers -Body $body
```
Use your actual setup key from `server/.env`. This endpoint refuses to create a second admin. For a real deployment, remove or disable this endpoint after setup and never commit secrets.

## Demo walkthrough
1. Create the admin above and log in.
2. Register an employee account using the UI, then log back in as admin.
3. Create a risk, assign it to the employee, and select a severity.
4. Log in as the employee; change the risk to `in_progress`, then `pending_review`.
5. Log in as admin; click **Verify & close** and inspect the audit log.

## API summary
- `POST /api/auth/register` — create employee
- `POST /api/auth/login` — get JWT
- `GET /api/auth/me` — current user
- `GET /api/auth/users` — admin only
- `POST /api/auth/setup-admin` — one-time admin bootstrap with `x-setup-key`
- `GET /api/risks` — admin all / employee assigned
- `POST /api/risks` — admin
- `PATCH /api/risks/:id` — admin
- `PATCH /api/risks/:id/status` — authorized user
- `PATCH /api/risks/:id/verify` — admin
- `GET /api/risks/:id/logs` — authorized user

## Deployment
Deploy the server to Render (root directory `server`, build `npm install`, start `npm start`) and the client to Vercel (root directory `client`, build `npm run build`, output `dist`). Set `MONGO_URI`, `JWT_SECRET`, `ADMIN_SETUP_KEY`, `CLIENT_ORIGIN` on the backend and `VITE_API_URL=https://YOUR-API-HOST/api` on the frontend. Update CORS origin to the actual frontend URL. Use HTTPS.

## Security and scope notes
This is an educational MVP, not a production compliance platform. JWT is stored in sessionStorage for simplicity; a production system should consider HttpOnly secure cookies with CSRF protections, password reset, MFA, audit log integrity, backup strategy, automated tests and proper provisioning. Audit writes and risk changes are not transactional; a production implementation should use MongoDB transactions and appropriate replica set support. Rate limiting is in-memory and is not suitable for horizontally scaled deployment. The first-admin bootstrap endpoint should be disabled after provisioning. There is no hard-delete endpoint, intentionally preserving history. Admins can change workflow status; verification remains a separate action.


## CDTR enhancements (v2)

- Risk score = likelihood (1–5) × impact (1–5). Scores ≥15 appear in the high-priority KPI.
- Compliance/mitigation checklist: admins configure controls and mark evidence as implemented.
- A risk cannot be submitted for verification or closed until every listed control is completed.
- Overdue KPI flags open risks with a past deadline.
- Existing role-based permissions and per-risk audit history remain in place.
- The severity field is a separate qualitative label; risk score is an independent quantitative assessment.

**Security note:** This is an interview/demo application, not a certified GRC platform. Use HTTPS in production, rotate secrets, disable admin bootstrap after initialization, and add automated tests and stronger session management before real organizational use.


## AI Risk Assessment Assistant (NEW)

The Admin risk creation/edit form now includes **Analyze with AI**. It sends only the typed title, description, and category to the Express backend. The backend calls the OpenAI API using a **server-side key** and returns a structured preliminary assessment: category, severity, likelihood (1–5), impact (1–5), explanation, and up to five mitigations. Click **Apply suggestions to form** to edit the draft; nothing is automatically saved. Review before saving. The existing manual workflow works without an AI key.

### Configure AI
1. Create an OpenAI API key at https://platform.openai.com/api-keys and ensure API billing/credits are available. ChatGPT subscriptions and API billing are separate.
2. In `server/.env`, add `OPENAI_API_KEY=your_key_here` and `OPENAI_MODEL=gpt-4o-mini`. Never add the key to `client/.env` or commit it.
3. Restart backend: `cd server && npm run dev`. Run the frontend as usual.
4. Log in as **Admin**, fill in a title (3+ chars) and description (10+ chars), click **Analyze with AI**, review output, then click **Apply suggestions to form** and save the risk.

### Endpoint
`POST /api/ai/analyze-risk` with `Authorization: Bearer <JWT>` and JSON body `{ "title": "Shared admin passwords", "description": "Multiple employees share one admin account and activity cannot be attributed to individuals.", "category": "Access Control" }`. Authenticated users can call the endpoint; the UI exposes it only in the admin form. This endpoint does **not** persist results or update risks. Limit: 8 requests per 15 minutes per IP (demo limit).

### Responsible use / limitations
- **Advisory only:** AI suggestions may be inaccurate and must be reviewed by a human. The deterministic risk score remains `likelihood × impact`; it is not ML prediction.
- **Privacy:** The text you submit is sent to the OpenAI API. Use fictitious or non-sensitive descriptions; don't send secrets, PII, or customer records.
- **Costs:** OpenAI API requests may incur usage charges. The endpoint has a demo rate limit but not a budget cap.
- **Security:** Keep the key server-side, restrict API access and usage, and use HTTPS in production. Production apps should add organization-level quotas, logging without sensitive data, and a formal review process.


## AI mitigation recommendation upgrade

The **Analyze with AI** button now produces a preliminary risk assessment plus 3–5 structured, prioritized remediation recommendations. Each recommendation includes an action, priority, rationale, suggested owner role, and timeframe. Admins select which actions to add to the existing **Compliance / mitigation controls** checklist. Selected actions are saved as incomplete controls when the risk is saved, and can be tracked to completion using the existing risk edit form.

**Human review is mandatory:** AI recommendations are suggestions, not verified security findings or legal compliance determinations. No AI output changes production systems or closes risks. Do not submit secrets, personal data, or confidential company information. API usage may incur provider charges.

**Test:** Log in as admin; enter a risk title (3+ characters) and description (10+ characters); click Analyze with AI; inspect priorities, reasons, owner roles, and timeframes; uncheck one suggestion; click Apply assessment & selected actions; save risk; edit it and confirm selected recommendations appear as incomplete controls.

## NEW: Beginner-friendly security monitoring (v3)

This version keeps the original SentriX AI risk assessment, mitigation recommendations, RBAC, dashboards, remediation and audit history.

### Three additional features
1. **Failed login alerts:** five unsuccessful logins to the same email from the same source within 15 minutes create one medium-severity `SecurityEvent` in MongoDB.
2. **Admin security alerts dashboard:** shows recent alerts, timestamp and status. Click **Refresh alerts** to reload (no Socket.IO required).
3. **Convert to risk:** admin clicks **Convert to risk**. A normal SentriX risk is created, ready for editing, AI assessment, assignment and remediation.

### How to demonstrate
1. Start backend and frontend as above, then create the first admin using the PowerShell setup command.
2. Log in as admin and open **Security alerts**. It should initially show no alerts.
3. In another browser/incognito session, attempt to log in with an existing test email and an incorrect password five times within 15 minutes. Use a valid password length (8+ characters). The demo's general auth rate limiter may also apply.
4. Refresh the admin dashboard and click **Convert to risk** next to the new alert.
5. Find the created risk in the risk register, click **Edit**, and use **Analyze with AI** if you configured an API key.

### New API endpoints
- `GET /api/security/events` (admin JWT): recent security alerts.
- `POST /api/security/events/:id/convert` (admin JWT): create a risk from one alert. JSON body: `{"title":"Repeated failed logins","description":"Investigate repeated failed login attempts"}`.

### Important scope limitations
- This is **single-process, in-memory counting** of failed attempts; counters reset on restart and are not shared between servers. Events themselves persist in MongoDB.
- Monitoring only tracks failed logins, not SQL injection or XSS. No IP blocking, attack simulation or Socket.IO is included.
- The same source IP can represent many users. Do not interpret an alert as proof of a successful attack.
- The conversion is a small demonstration workflow, not a fully transactional incident-response platform. Use MongoDB transactions and stronger logging in production.
- Rate limiting is a separate control and may prevent repeated attempts; it is not the alert mechanism.
