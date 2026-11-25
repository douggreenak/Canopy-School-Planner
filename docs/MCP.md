# Canopy MCP server

Lets an AI assistant (Claude Code, Claude Desktop, Cursor, …) read the student's own planner and, with a write token, manage their tasks. Endpoint: `https://YOUR-HOST/api/mcp` — MCP **Streamable HTTP**, stateless JSON mode.

## Connect

1. Create an **MCP token** in Settings → API & MCP access (type: *MCP token*). Prefer **read-only** unless the assistant must change tasks.
2. Add the server to your client. The URL is `https://YOUR-HOST/api/mcp` and the header is `Authorization: Bearer spm_…`.

**Claude Code**
```bash
claude mcp add --transport http canopy https://YOUR-HOST/api/mcp --header "Authorization: Bearer YOUR_MCP_TOKEN"
```

**Claude Desktop / any stdio-only client** (bridge with `mcp-remote`; add to the client's MCP config JSON)
```json
{
  "mcpServers": {
    "canopy": {
      "command": "npx",
      "args": ["mcp-remote", "https://YOUR-HOST/api/mcp", "--header", "Authorization: Bearer YOUR_MCP_TOKEN"]
    }
  }
}
```

**Any client with native remote-HTTP support** — URL `https://YOUR-HOST/api/mcp`, custom header `Authorization: Bearer YOUR_MCP_TOKEN`.

> Not supported: connectors that require OAuth (for example claude.ai “custom connectors”). Access is by bearer token only.

## Token types

Create tokens in the app: **Settings → API & MCP access** → choose the **Type**, **Access** (read-only or read & write) and **Expires**, then confirm your password. The token is shown **once**.

| Type | Prefix | Works only on | Max lifetime |
|---|---|---|---|
| REST API token | `spk_…` | `/api/v1` | 365 days |
| MCP token | `spm_…` | `/api/mcp` | 1825 days (5 years) |

The two are not interchangeable: a token used on the other surface gets the same `401` as an unknown token.

## How the protocol works

- `POST https://YOUR-HOST/api/mcp` with a JSON-RPC 2.0 message (or a batch array of up to 20). Header `Authorization: Bearer YOUR_MCP_TOKEN`, `Content-Type: application/json`.
- Supported protocol versions: 2025-06-18, 2025-03-26, 2024-11-05 (the server echoes the one you ask for).
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`. Notifications (e.g. `notifications/initialized`) are answered `202 Accepted` with no body.
- Responses are plain JSON (no SSE stream, no sessions). `GET` and `DELETE` on the endpoint return `405 Method Not Allowed` with `Allow: POST` — this is normal for a stateless server, and clients should ignore it.
- Read-only tokens only **see** the read tools; the write tools are hidden from `tools/list` and refused if called.
- A tool that fails returns a normal result with `"isError": true` and a message; protocol problems return a JSON-RPC `error`.
- Auth/limits: `401` for a bad, expired, revoked or wrong-type (REST) token; `429` with `Retry-After` over 120 requests/min; `413` over 64 KB.

### Try it by hand

```bash
# 1. handshake
curl -s https://YOUR-HOST/api/mcp -H "Authorization: Bearer YOUR_MCP_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# 2. list the tools you may use
curl -s https://YOUR-HOST/api/mcp -H "Authorization: Bearer YOUR_MCP_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. call one
curl -s https://YOUR-HOST/api/mcp -H "Authorization: Bearer YOUR_MCP_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_upcoming","arguments":{"days":7}}}'
```

A successful `tools/call` returns `{"result":{"content":[{"type":"text","text":"<JSON string>"}]}}` — the `text` is the JSON described under each tool's “Returns”.

## Read tools (read-only and read & write tokens)

### `list_classes`

List the student's classes with teacher, room, period, meeting days/times and current grade.

**Parameters**

_No parameters._

**Returns:** `{ "classes": [Class, …] }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_classes",
    "arguments": {}
  }
}
```

### `list_assignments`

List assignments (synced homework) with due dates, completion, scores and flags. Filter by class, completion or due-date range.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `classId` | string | no | Only this class |
| `completed` | boolean | no |  |
| `from` | date `YYYY-MM-DD` | no | Due on or after (YYYY-MM-DD) |
| `to` | date `YYYY-MM-DD` | no | Due on or before (YYYY-MM-DD) |
| `limit` | integer 1–500 | no |  |

**Returns:** `{ "assignments": [Assignment, …] }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_assignments",
    "arguments": {
      "completed": false,
      "from": "2026-12-01",
      "limit": 20
    }
  }
}
```

### `list_tasks`

List the student's personal to-do tasks.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `completed` | boolean | no |  |
| `limit` | integer 1–500 | no |  |

**Returns:** `{ "tasks": [Task, …] }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_tasks",
    "arguments": {
      "completed": false
    }
  }
}
```

### `list_exams`

List exams, optionally within a date range.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `from` | date `YYYY-MM-DD` | no | On or after (YYYY-MM-DD) |
| `to` | date `YYYY-MM-DD` | no | On or before (YYYY-MM-DD) |

**Returns:** `{ "exams": [Exam, …] }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_exams",
    "arguments": {
      "from": "2026-12-01",
      "to": "2026-12-31"
    }
  }
}
```

### `get_upcoming`

What is due soon: overdue items plus assignments, tasks and exams due in the next N days (default 7), using the student's own timezone.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `days` | integer 0–90 | no |  |

**Returns:** `{ "today", "through", "overdue": {…}, "assignments": […], "tasks": […], "exams": […] }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_upcoming",
    "arguments": {
      "days": 14
    }
  }
}
```

### `get_grade_history`

Historical grade snapshots (percent and letter per sync), optionally for one class.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `classId` | string | no | Only this class |
| `limit` | integer 1–500 | no |  |

**Returns:** `{ "history": [Grade history entry, …] }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_grade_history",
    "arguments": {
      "limit": 50
    }
  }
}
```

## Write tools (read & write tokens only)

### `create_task`

Create a personal to-do task.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `title` | string (max 1000) | yes | Task title |
| `description` | string (max 5000) | no | Details |
| `dueDate` | date `YYYY-MM-DD` | no | Due date (YYYY-MM-DD) |
| `priority` | `low` \| `medium` \| `high` | no |  |
| `category` | string (max 100) | no | Category, e.g. Homework, Study |
| `classId` | string | no | Optional id of one of the student's classes (from list_classes) |
| `stages` | array (max 12) of `{id,label}` | no | Optional ordered completion pipeline, e.g. [{"id":"a","label":"Reported"},...]. [] clears it. |
| `stageId` | string | no | Current stage id (must be in stages). Completed becomes true on the last stage. |

**Returns:** `{ "task": Task }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_task",
    "arguments": {
      "title": "Study for chem quiz",
      "dueDate": "2026-12-03",
      "priority": "high"
    }
  }
}
```

### `update_task`

Edit a personal task or mark it done/not done.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Task id |
| `title` | string (max 1000) | no | Task title |
| `description` | string (max 5000) | no | Details |
| `dueDate` | date `YYYY-MM-DD` | no | Due date (YYYY-MM-DD) |
| `priority` | `low` \| `medium` \| `high` | no |  |
| `category` | string (max 100) | no | Category, e.g. Homework, Study |
| `classId` | string | no | Optional id of one of the student's classes (from list_classes) |
| `stages` | array (max 12) of `{id,label}` | no | Optional ordered completion pipeline, e.g. [{"id":"a","label":"Reported"},...]. [] clears it. |
| `stageId` | string | no | Current stage id (must be in stages). Completed becomes true on the last stage. |
| `completed` | boolean | no |  |

**Returns:** `{ "task": Task }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "update_task",
    "arguments": {
      "id": "TASK_ID",
      "completed": true
    }
  }
}
```

### `delete_task`  — destructive

Permanently delete a personal task (not synced assignments).

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Task id |

**Returns:** `{ "success": true }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "delete_task",
    "arguments": {
      "id": "TASK_ID"
    }
  }
}
```

### `set_assignment_completed`

Mark an assignment done or not done. Assignment content itself cannot be changed.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Assignment id |
| `completed` | boolean | yes |  |

**Returns:** `{ "assignment": Assignment }`

**Example `tools/call`**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "set_assignment_completed",
    "arguments": {
      "id": "ASSIGNMENT_ID",
      "completed": true
    }
  }
}
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

## Security model

- **Isolation:** a token belongs to one user and every query is scoped to that user. There is no admin or cross-user mode; ids that belong to someone else are rejected.
- **At rest:** only a SHA-256 hash of the token is stored. The raw token cannot be recovered — if you lose it, revoke it and create a new one.
- **Transport:** bearer header only. Cookies and web-login sessions are rejected here, and these tokens are rejected on the rest of the site. Browser `Origin`s other than this site are refused and no CORS headers are sent, so a web page cannot use your token. Use HTTPS only.
- **Least privilege:** tokens are read-only by default. Writes are limited to personal tasks and marking assignments done. Settings, school (PowerSchool) credentials, sync logs and sessions are not reachable.
- **Lifecycle:** every token expires (REST: up to 365 days; MCP: up to 1825 days). Creating one needs your login session and password. Tokens cannot create, list or revoke tokens. All tokens are revoked when the password changes or the account is deleted. You can hold at most 10 active tokens in total.
- **Limits:** 120 requests per minute per token, a failed-authentication throttle per IP, 64 KB maximum request body, and `Cache-Control: no-store` on every response.
- **Untrusted text:** assignment titles, descriptions and teacher notes are free text written by other people. Treat them as data, never as instructions. Prefer read-only tokens for assistants that also read untrusted content.
