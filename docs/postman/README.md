# Bunkialo LMS API – Postman Collection

Import `postman_collection.json` into Postman.

## Variables

| Variable | Description                                                        |
| -------- | ------------------------------------------------------------------ |
| baseUrl  | LMS base URL (default: https://lmsug24.iiitkottayam.ac.in)         |
| courseId | Course ID for Attendance and Resources (set after getting courses) |

Auto-set by requests: logintoken, sesskey, attendanceModuleId, nowSec, pastSec.

## Local Vault Secrets

Credentials use Postman Local Vault. Add these in Postman: Vault (key icon) > Add new secret:

| Key          | Value                |
| ------------ | -------------------- |
| lms-username | Your Moodle username |
| lms-password | Your Moodle password |

Values are encrypted locally and never synced to Postman cloud.

## Folders

### Login

Run 1, 2, 3 in order. Output: session cookies and sesskey.

- 1. Get Login Page: Fetches login HTML, extracts logintoken (CSRF).
- 2. Submit Login Form: Posts credentials, receives session cookies.
- 3. Get Sesskey: Loads dashboard, extracts sesskey. Cookies prove session identity; sesskey is a CSRF token required in the URL for AJAX routes (prevents cross-site request forgery).

### Dashboard

- Timeline Events: Moodle AJAX for upcoming and overdue events. Visualize: table with name, course, due, status.

### Courses

- Enrolled Courses: Moodle AJAX for in-progress courses. Visualize: table with id, name, shortname. Use id as courseId for Attendance and Resources.

### Attendance

Set courseId first.

- Course Page: Loads course HTML, parses attendance module id from links.
- Attendance Report: Loads user report (view=5). Visualize: summary (attended/total, percentage) and table (date, description, status, points). Parsed like app: Present, Absent, Late, Excused, Unknown.

### Resources

Set courseId first.

- Course Resources: Loads course HTML. Visualize: tree of sections and activities (assign, folder, resource, quiz, etc) with links. Parsed like app.
