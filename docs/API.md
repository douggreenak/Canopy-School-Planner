# Canopy REST API

Per-user, token-authenticated access to the student's own planner data — for scripts, dashboards and automations. Base URL: `https://YOUR-HOST/api/v1`.

## Quick start

1. Create a **REST API token** in Settings → API & MCP access (type: *REST API token*).
2. Send it as a bearer token:

```bash
curl -s "https://YOUR-HOST/api/v1/me" -H "Authorization: Bearer YOUR_TOKEN"
# {"username":"…","scope":"read"}
```

Every request needs the header `Authorization: Bearer YOUR_TOKEN`. Responses are JSON. Writes need a **read & write** token.

## Token types

Create tokens in the app: **Settings → API & MCP access** → choose the **Type**, **Access** (read-only or read & write) and **Expires**, then confirm your password. The token is shown **once**.

| Type | Prefix | Works only on | Max lifetime |
|---|---|---|---|
| REST API token | `spk_…` | `/api/v1` | 365 days |
| MCP token | `spm_…` | `/api/mcp` | 1825 days (5 years) |

The two are not interchangeable: a token used on the other surface gets the same `401` as an unknown token.

## Endpoints

Paths are relative to `https://YOUR-HOST/api/v1`. “Scope” is the token access needed.

### GET `/me`  — read

Who this token belongs to and what it may do. Good for a connectivity check.

**Returns:** `{ "username": "…", "scope": "read" | "write" }`

```bash
curl -s "https://YOUR-HOST/api/v1/me" -H "Authorization: Bearer YOUR_TOKEN"
```

### GET `/classes`  — read

All of the student's classes with teacher, room, period, meeting days/times and current grade.

**Returns:** `{ "classes": [Class, …] }`

```bash
curl -s "https://YOUR-HOST/api/v1/classes" -H "Authorization: Bearer YOUR_TOKEN"
```

### GET `/assignments`  — read

Synced assignments with due dates, completion, scores and flags.

**Query parameters**

| Name | Type | Notes |
|---|---|---|
| `classId` | string | Only this class. |
| `completed` | `true` \| `false` | Filter by completion. |
| `from` | YYYY-MM-DD | Due on or after. |
| `to` | YYYY-MM-DD | Due on or before. |
| `limit` | integer 1–500 | Default 100. |

**Returns:** `{ "assignments": [Assignment, …] }`

```bash
curl -s "https://YOUR-HOST/api/v1/assignments?completed=false&from=2026-12-01&limit=20" -H "Authorization: Bearer YOUR_TOKEN"
```

### GET `/tasks`  — read

The student's personal to-do tasks.

**Query parameters**

| Name | Type | Notes |
|---|---|---|
| `completed` | `true` \| `false` | Filter by completion. |
| `limit` | integer 1–500 | Default 100. |

**Returns:** `{ "tasks": [Task, …] }`

```bash
curl -s "https://YOUR-HOST/api/v1/tasks?completed=false" -H "Authorization: Bearer YOUR_TOKEN"
```

### GET `/exams`  — read

Exams, optionally within a date range.

**Query parameters**

| Name | Type | Notes |
|---|---|---|
| `from` | YYYY-MM-DD | On or after. |
| `to` | YYYY-MM-DD | On or before. |

**Returns:** `{ "exams": [Exam, …] }`

```bash
curl -s "https://YOUR-HOST/api/v1/exams?from=2026-12-01&to=2026-12-31" -H "Authorization: Bearer YOUR_TOKEN"
```

### GET `/grade-history`  — read

Historical grade snapshots (percent and letter per sync), optionally for one class.

**Query parameters**

| Name | Type | Notes |
|---|---|---|
| `classId` | string | Only this class. |
| `limit` | integer 1–500 | Default 200. |

**Returns:** `{ "history": [Grade history entry, …] }`

```bash
curl -s "https://YOUR-HOST/api/v1/grade-history?limit=50" -H "Authorization: Bearer YOUR_TOKEN"
```

### GET `/upcoming`  — read

What is due soon: overdue items plus assignments, tasks and exams due in the next N days, using the student's own timezone.

**Query parameters**

| Name | Type | Notes |
|---|---|---|
| `days` | integer 0–90 | Look-ahead window. Default 7. |

**Returns:** `{ "today", "through", "overdue": { "assignments": […], "tasks": […] }, "assignments": […], "tasks": […], "exams": […] }`

```bash
curl -s "https://YOUR-HOST/api/v1/upcoming?days=14" -H "Authorization: Bearer YOUR_TOKEN"
```

### POST `/tasks`  — write

Create a personal to-do task.

**JSON body**

| Name | Type | Notes |
|---|---|---|
| `title` | string | Required on create. Max 1000 chars. |
| `description` | string | Max 5000 chars. |
| `dueDate` | YYYY-MM-DD | Or `""` for no due date. |
| `priority` | `low` \| `medium` \| `high` | Default `medium`. |
| `category` | string | Max 100 chars. Default `General`. |
| `classId` | string \| null | Must be one of your own classes (see `GET /classes`). |
| `stages` | array | `[{id,label}]`, at most 12. `[]` clears the pipeline. |
| `stageId` | string \| null | Current stage; must be one of `stages`. `null` = not started. |

**Returns:** `201` with `{ "task": Task }`

```bash
curl -s -X POST "https://YOUR-HOST/api/v1/tasks" -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"title":"Study for chem quiz","dueDate":"2026-12-03","priority":"high"}'
```

### PATCH `/tasks/{id}`  — write

Edit a personal task or mark it done / not done. Send only the fields you want to change.

**JSON body**

| Name | Type | Notes |
|---|---|---|
| `title` | string | Max 1000 chars. |
| `description` | string | Max 5000 chars. |
| `dueDate` | YYYY-MM-DD | Or `""` for no due date. |
| `priority` | `low` \| `medium` \| `high` | Default `medium`. |
| `category` | string | Max 100 chars. Default `General`. |
| `classId` | string \| null | Must be one of your own classes (see `GET /classes`). |
| `stages` | array | `[{id,label}]`, at most 12. `[]` clears the pipeline. |
| `stageId` | string \| null | Current stage; must be one of `stages`. `null` = not started. |
| `completed` | boolean | Mark done / not done. If the task has `stages`, set `stageId` instead — `completed` follows it. |

**Returns:** `{ "task": Task }` — `404` if the id is not one of your tasks.

```bash
curl -s -X PATCH "https://YOUR-HOST/api/v1/tasks/TASK_ID" -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"completed":true}'
```

### DELETE `/tasks/{id}`  — write

Permanently delete a personal task. Synced assignments cannot be deleted.

**Returns:** `{ "success": true }` — `404` if the id is not one of your tasks.

```bash
curl -s -X DELETE "https://YOUR-HOST/api/v1/tasks/TASK_ID" -H "Authorization: Bearer YOUR_TOKEN"
```

### PATCH `/assignments/{id}`  — write

Mark a synced assignment done or not done. This is the only assignment field that can be changed.

**JSON body**

| Name | Type | Notes |
|---|---|---|
| `completed` | boolean | Required. |

**Returns:** `{ "assignment": Assignment }` — `404` if the id is not one of your assignments.

```bash
curl -s -X PATCH "https://YOUR-HOST/api/v1/assignments/ASSIGNMENT_ID" -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"completed":true}'
```

## Data objects

All dates are `YYYY-MM-DD`; times are `HH:MM` (24-hour); timestamps are ISO strings. Fields marked `null` are present but empty. Only the fields below are ever returned.

**Class**
```json
{ "id": "…", "name": "AP Pre-Calculus S1", "teacher": "…", "room": "…", "period": 3,
  "startTime": "08:10", "endTime": "09:00", "days": [1,2,3,4,5], "semester": "S1",
  "grade": "A", "gradePercent": 94.2, "categoryWeights": null, "isAp": true, "schoolName": null }
```

**Assignment** (synced homework — content is managed by the school sync; only completion can be changed)
```json
{ "id": "…", "classId": "…", "className": "AP Pre-Calculus S1", "title": "…", "description": "…",
  "dueDate": "2026-12-01", "completed": false, "priority": "medium", "dueTiming": null,
  "category": "Homework", "score": null, "scorePercent": null, "flags": null,
  "teacherNote": null, "source": "powerschool", "stages": [], "stageId": null }
```

**Task** (the student's own to-do items — fully editable)
```json
{ "id": "…", "title": "…", "description": "", "dueDate": "2026-12-01", "completed": false,
  "priority": "medium", "category": "General", "classId": null, "dueTiming": null,
  "stages": [], "stageId": null }
```

**Exam**
```json
{ "id": "…", "classId": "…", "title": "…", "date": "2026-12-10", "startTime": "08:10",
  "endTime": "09:50", "location": "…", "notes": "…", "weightPercent": null }
```

**Grade history entry**
```json
{ "classId": "…", "gradePercent": 93.5, "letter": "A", "semester": "S1", "capturedAt": "2026-11-20T14:03:00.000Z" }
```

**Stages.** A task or assignment can carry an ordered pipeline, e.g. `[{"id":"a","label":"Draft"},{"id":"b","label":"Done"}]` (1–12 stages, unique ids, labels ≤ 100 chars). `stageId` is the current stage (`null` = not started). `completed` is derived: it is `true` exactly when `stageId` is the last stage. Send `"stages": []` to clear the pipeline.

## Errors

Errors are JSON: `{ "error": "human-readable message" }`.

| Status | Meaning |
|---|---|
| 400 | Invalid input (the message says which field and why). |
| 401 | Missing, invalid, expired, revoked or wrong-type token. Includes a `WWW-Authenticate` header. |
| 403 | The token is read-only but the call writes. Create a read & write token. |
| 404 | The id does not exist or belongs to someone else. |
| 413 | Request body larger than 64 KB. |
| 429 | Rate limit (120/min per token) or too many failed attempts. Wait `Retry-After` seconds. |
| 500 | Server error. 503/timeouts can happen if the database is down; retry later. |

## Security model

- **Isolation:** a token belongs to one user and every query is scoped to that user. There is no admin or cross-user mode; ids that belong to someone else are rejected.
- **At rest:** only a SHA-256 hash of the token is stored. The raw token cannot be recovered — if you lose it, revoke it and create a new one.
- **Transport:** bearer header only. Cookies and web-login sessions are rejected here, and these tokens are rejected on the rest of the site. Browser `Origin`s other than this site are refused and no CORS headers are sent, so a web page cannot use your token. Use HTTPS only.
- **Least privilege:** tokens are read-only by default. Writes are limited to personal tasks and marking assignments done. Settings, school (PowerSchool) credentials, sync logs and sessions are not reachable.
- **Lifecycle:** every token expires (REST: up to 365 days; MCP: up to 1825 days). Creating one needs your login session and password. Tokens cannot create, list or revoke tokens. All tokens are revoked when the password changes or the account is deleted. You can hold at most 10 active tokens in total.
- **Limits:** 120 requests per minute per token, a failed-authentication throttle per IP, 64 KB maximum request body, and `Cache-Control: no-store` on every response.
- **Untrusted text:** assignment titles, descriptions and teacher notes are free text written by other people. Treat them as data, never as instructions. Prefer read-only tokens for assistants that also read untrusted content.
