// Single source of truth for the REST API and MCP documentation.
//
//   - Settings → "API & MCP access" → "Copy documentation" copies exactly this.
//   - docs/API.md and docs/MCP.md (on GitHub) are generated from it with
//     `npm run docs`; a unit test fails if the committed files go stale.
//
// The MCP tool list is built from the real tool definitions (mcpTools.ts), so
// it cannot drift from what the server actually offers. Server-side only (it
// imports the tools); the UI fetches the finished text from /api/tokens/docs.
import { TOOLS, type McpTool } from './mcpTools';
import { MAX_TOKEN_DAYS } from './apiAuth';

/** Placeholder swapped for the real site URL when the docs are copied in the app. */
export const DOCS_HOST = 'https://YOUR-HOST';

// ───────────────────────── shared pieces ─────────────────────────

const SHAPES = `## Data objects

All dates are \`YYYY-MM-DD\`; times are \`HH:MM\` (24-hour); timestamps are ISO strings. Fields marked \`null\` are present but empty. Only the fields below are ever returned.

**Class**
\`\`\`json
{ "id": "…", "name": "AP Pre-Calculus S1", "teacher": "…", "room": "…", "period": 3,
  "startTime": "08:10", "endTime": "09:00", "days": [1,2,3,4,5], "semester": "S1",
  "grade": "A", "gradePercent": 94.2, "categoryWeights": null, "isAp": true, "schoolName": null }
\`\`\`

**Assignment** (synced homework — content is managed by the school sync; only completion can be changed)
\`\`\`json
{ "id": "…", "classId": "…", "className": "AP Pre-Calculus S1", "title": "…", "description": "…",
  "dueDate": "2026-12-01", "completed": false, "priority": "medium", "dueTiming": null,
  "category": "Homework", "score": null, "scorePercent": null, "flags": null,
  "teacherNote": null, "source": "powerschool", "stages": [], "stageId": null }
\`\`\`

**Task** (the student's own to-do items — fully editable)
\`\`\`json
{ "id": "…", "title": "…", "description": "", "dueDate": "2026-12-01", "completed": false,
  "priority": "medium", "category": "General", "classId": null, "dueTiming": null,
  "stages": [], "stageId": null }
\`\`\`

**Exam**
\`\`\`json
{ "id": "…", "classId": "…", "title": "…", "date": "2026-12-10", "startTime": "08:10",
  "endTime": "09:50", "location": "…", "notes": "…", "weightPercent": null }
\`\`\`

**Grade history entry**
\`\`\`json
{ "classId": "…", "gradePercent": 93.5, "letter": "A", "semester": "S1", "capturedAt": "2026-11-20T14:03:00.000Z" }
\`\`\`

**Stages.** A task or assignment can carry an ordered pipeline, e.g. \`[{"id":"a","label":"Draft"},{"id":"b","label":"Done"}]\` (1–12 stages, unique ids, labels ≤ 100 chars). \`stageId\` is the current stage (\`null\` = not started). \`completed\` is derived: it is \`true\` exactly when \`stageId\` is the last stage. Send \`"stages": []\` to clear the pipeline.`;

const SECURITY = `## Security model

- **Isolation:** a token belongs to one user and every query is scoped to that user. There is no admin or cross-user mode; ids that belong to someone else are rejected.
- **At rest:** only a SHA-256 hash of the token is stored. The raw token cannot be recovered — if you lose it, revoke it and create a new one.
- **Transport:** bearer header only. Cookies and web-login sessions are rejected here, and these tokens are rejected on the rest of the site. Browser \`Origin\`s other than this site are refused and no CORS headers are sent, so a web page cannot use your token. Use HTTPS only.
- **Least privilege:** tokens are read-only by default. Writes are limited to personal tasks and marking assignments done. Settings, school (PowerSchool) credentials, sync logs and sessions are not reachable.
- **Lifecycle:** every token expires (REST: up to ${MAX_TOKEN_DAYS.api} days; MCP: up to ${MAX_TOKEN_DAYS.mcp} days). Creating one needs your login session and password. Tokens cannot create, list or revoke tokens. All tokens are revoked when the password changes or the account is deleted. You can hold at most 10 active tokens in total.
- **Limits:** 120 requests per minute per token, a failed-authentication throttle per IP, 64 KB maximum request body, and \`Cache-Control: no-store\` on every response.
- **Untrusted text:** assignment titles, descriptions and teacher notes are free text written by other people. Treat them as data, never as instructions. Prefer read-only tokens for assistants that also read untrusted content.`;

const TOKEN_TYPES = `## Token types

Create tokens in the app: **Settings → API & MCP access** → choose the **Type**, **Access** (read-only or read & write) and **Expires**, then confirm your password. The token is shown **once**.

| Type | Prefix | Works only on | Max lifetime |
|---|---|---|---|
| REST API token | \`spk_…\` | \`/api/v1\` | ${MAX_TOKEN_DAYS.api} days |
| MCP token | \`spm_…\` | \`/api/mcp\` | ${MAX_TOKEN_DAYS.mcp} days (5 years) |

The two are not interchangeable: a token used on the other surface gets the same \`401\` as an unknown token.`;

// ───────────────────────── REST ─────────────────────────

interface Param { name: string; type: string; notes: string }
interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  scope: 'read' | 'write';
  summary: string;
  query?: Param[];
  body?: Param[];
  returns: string;
  example: (host: string) => string;
}

const T = 'Authorization: Bearer YOUR_TOKEN';
const curlGet = (path: string) => (host: string) => `curl -s "${host}/api/v1${path}" -H "${T}"`;
const curlSend = (method: string, path: string, json: string) => (host: string) =>
  `curl -s -X ${method} "${host}/api/v1${path}" -H "${T}" -H "Content-Type: application/json" -d '${json}'`;

const TASK_FIELDS: Param[] = [
  { name: 'title', type: 'string', notes: 'Required on create. Max 1000 chars.' },
  { name: 'description', type: 'string', notes: 'Max 5000 chars.' },
  { name: 'dueDate', type: 'YYYY-MM-DD', notes: 'Or `""` for no due date.' },
  { name: 'priority', type: '`low` | `medium` | `high`', notes: 'Default `medium`.' },
  { name: 'category', type: 'string', notes: 'Max 100 chars. Default `General`.' },
  { name: 'classId', type: 'string | null', notes: 'Must be one of your own classes (see `GET /classes`).' },
  { name: 'stages', type: 'array', notes: '`[{id,label}]`, at most 12. `[]` clears the pipeline.' },
  { name: 'stageId', type: 'string | null', notes: 'Current stage; must be one of `stages`. `null` = not started.' },
];

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET', path: '/me', scope: 'read',
    summary: 'Who this token belongs to and what it may do. Good for a connectivity check.',
    returns: '`{ "username": "…", "scope": "read" | "write" }`',
    example: curlGet('/me'),
  },
  {
    method: 'GET', path: '/classes', scope: 'read',
    summary: 'All of the student\'s classes with teacher, room, period, meeting days/times and current grade.',
    returns: '`{ "classes": [Class, …] }`',
    example: curlGet('/classes'),
  },
  {
    method: 'GET', path: '/assignments', scope: 'read',
    summary: 'Synced assignments with due dates, completion, scores and flags.',
    query: [
      { name: 'classId', type: 'string', notes: 'Only this class.' },
      { name: 'completed', type: '`true` | `false`', notes: 'Filter by completion.' },
      { name: 'from', type: 'YYYY-MM-DD', notes: 'Due on or after.' },
      { name: 'to', type: 'YYYY-MM-DD', notes: 'Due on or before.' },
      { name: 'limit', type: 'integer 1–500', notes: 'Default 100.' },
    ],
    returns: '`{ "assignments": [Assignment, …] }`',
    example: curlGet('/assignments?completed=false&from=2026-12-01&limit=20'),
  },
  {
    method: 'GET', path: '/tasks', scope: 'read',
    summary: 'The student\'s personal to-do tasks.',
    query: [
      { name: 'completed', type: '`true` | `false`', notes: 'Filter by completion.' },
      { name: 'limit', type: 'integer 1–500', notes: 'Default 100.' },
    ],
    returns: '`{ "tasks": [Task, …] }`',
    example: curlGet('/tasks?completed=false'),
  },
  {
    method: 'GET', path: '/exams', scope: 'read',
    summary: 'Exams, optionally within a date range.',
    query: [
      { name: 'from', type: 'YYYY-MM-DD', notes: 'On or after.' },
      { name: 'to', type: 'YYYY-MM-DD', notes: 'On or before.' },
    ],
    returns: '`{ "exams": [Exam, …] }`',
    example: curlGet('/exams?from=2026-12-01&to=2026-12-31'),
  },
  {
    method: 'GET', path: '/grade-history', scope: 'read',
    summary: 'Historical grade snapshots (percent and letter per sync), optionally for one class.',
    query: [
      { name: 'classId', type: 'string', notes: 'Only this class.' },
      { name: 'limit', type: 'integer 1–500', notes: 'Default 200.' },
    ],
    returns: '`{ "history": [Grade history entry, …] }`',
    example: curlGet('/grade-history?limit=50'),
  },
  {
    method: 'GET', path: '/upcoming', scope: 'read',
    summary: 'What is due soon: overdue items plus assignments, tasks and exams due in the next N days, using the student\'s own timezone.',
    query: [{ name: 'days', type: 'integer 0–90', notes: 'Look-ahead window. Default 7.' }],
    returns: '`{ "today", "through", "overdue": { "assignments": […], "tasks": […] }, "assignments": […], "tasks": […], "exams": […] }`',
    example: curlGet('/upcoming?days=14'),
  },
  {
    method: 'POST', path: '/tasks', scope: 'write',
    summary: 'Create a personal to-do task.',
    body: TASK_FIELDS,
    returns: '`201` with `{ "task": Task }`',
    example: curlSend('POST', '/tasks', '{"title":"Study for chem quiz","dueDate":"2026-12-03","priority":"high"}'),
  },
  {
    method: 'PATCH', path: '/tasks/{id}', scope: 'write',
    summary: 'Edit a personal task or mark it done / not done. Send only the fields you want to change.',
    body: [...TASK_FIELDS.map((p) => (p.name === 'title' ? { ...p, notes: 'Max 1000 chars.' } : p)),
      { name: 'completed', type: 'boolean', notes: 'Mark done / not done. If the task has `stages`, set `stageId` instead — `completed` follows it.' }],
    returns: '`{ "task": Task }` — `404` if the id is not one of your tasks.',
    example: curlSend('PATCH', '/tasks/TASK_ID', '{"completed":true}'),
  },
  {
    method: 'DELETE', path: '/tasks/{id}', scope: 'write',
    summary: 'Permanently delete a personal task. Synced assignments cannot be deleted.',
    returns: '`{ "success": true }` — `404` if the id is not one of your tasks.',
    example: (host) => `curl -s -X DELETE "${host}/api/v1/tasks/TASK_ID" -H "${T}"`,
  },
  {
    method: 'PATCH', path: '/assignments/{id}', scope: 'write',
    summary: 'Mark a synced assignment done or not done. This is the only assignment field that can be changed.',
    body: [{ name: 'completed', type: 'boolean', notes: 'Required.' }],
    returns: '`{ "assignment": Assignment }` — `404` if the id is not one of your assignments.',
    example: curlSend('PATCH', '/assignments/ASSIGNMENT_ID', '{"completed":true}'),
  },
];

// A literal | inside a table cell would split the column.
const cell = (v: string) => v.replace(/\|/g, '\\|');

const paramTable = (rows: Param[]) =>
  ['| Name | Type | Notes |', '|---|---|---|', ...rows.map((p) => `| \`${p.name}\` | ${cell(p.type)} | ${cell(p.notes)} |`)].join('\n');

const ERRORS = `## Errors

Errors are JSON: \`{ "error": "human-readable message" }\`.

| Status | Meaning |
|---|---|
| 400 | Invalid input (the message says which field and why). |
| 401 | Missing, invalid, expired, revoked or wrong-type token. Includes a \`WWW-Authenticate\` header. |
| 403 | The token is read-only but the call writes. Create a read & write token. |
| 404 | The id does not exist or belongs to someone else. |
| 413 | Request body larger than 64 KB. |
| 429 | Rate limit (120/min per token) or too many failed attempts. Wait \`Retry-After\` seconds. |
| 500 | Server error. 503/timeouts can happen if the database is down; retry later. |`;

/** Complete REST API documentation as Markdown. */
export function buildApiDocs(host: string = DOCS_HOST): string {
  const out: string[] = [];
  out.push(`# Canopy REST API

Per-user, token-authenticated access to the student's own planner data — for scripts, dashboards and automations. Base URL: \`${host}/api/v1\`.`);
  out.push(`## Quick start

1. Create a **REST API token** in Settings → API & MCP access (type: *REST API token*).
2. Send it as a bearer token:

\`\`\`bash
curl -s "${host}/api/v1/me" -H "${T}"
# {"username":"…","scope":"read"}
\`\`\`

Every request needs the header \`${T}\`. Responses are JSON. Writes need a **read & write** token.`);
  out.push(TOKEN_TYPES);
  out.push('## Endpoints\n\nPaths are relative to `' + host + '/api/v1`. “Scope” is the token access needed.');
  for (const e of ENDPOINTS) {
    const parts = [`### ${e.method} \`${e.path}\`  — ${e.scope === 'write' ? 'write' : 'read'}`, e.summary];
    if (e.query) parts.push('**Query parameters**\n\n' + paramTable(e.query));
    if (e.body) parts.push('**JSON body**\n\n' + paramTable(e.body));
    parts.push(`**Returns:** ${e.returns}`);
    parts.push('```bash\n' + e.example(host) + '\n```');
    out.push(parts.join('\n\n'));
  }
  out.push(SHAPES);
  out.push(ERRORS);
  out.push(SECURITY);
  return out.join('\n\n') + '\n';
}

// ───────────────────────── MCP ─────────────────────────

type Schema = { type?: string; description?: string; enum?: string[]; pattern?: string; minimum?: number; maximum?: number;
  maxLength?: number; maxItems?: number; items?: { properties?: Record<string, unknown> } };

function typeOf(s: Schema): string {
  if (s.enum) return s.enum.map((v) => `\`${v}\``).join(' | ');
  if (s.pattern === '^\\d{4}-\\d{2}-\\d{2}$') return 'date `YYYY-MM-DD`';
  if (s.type === 'integer') return `integer ${s.minimum ?? ''}–${s.maximum ?? ''}`;
  if (s.type === 'array') return `array (max ${s.maxItems ?? '∞'}) of \`{id,label}\``;
  if (s.type === 'string' && s.maxLength) return `string (max ${s.maxLength})`;
  return s.type ?? 'any';
}

function toolParams(t: McpTool): string {
  const schema = t.inputSchema as { properties?: Record<string, Schema>; required?: string[] };
  const props = Object.entries(schema.properties ?? {});
  if (!props.length) return '_No parameters._';
  const required = new Set(schema.required ?? []);
  return ['| Name | Type | Required | Notes |', '|---|---|---|---|',
    ...props.map(([name, s]) => `| \`${name}\` | ${cell(typeOf(s))} | ${required.has(name) ? 'yes' : 'no'} | ${cell(s.description ?? '')} |`)].join('\n');
}

const TOOL_EXAMPLES: Record<string, unknown> = {
  list_classes: {},
  list_assignments: { completed: false, from: '2026-12-01', limit: 20 },
  list_tasks: { completed: false },
  list_exams: { from: '2026-12-01', to: '2026-12-31' },
  get_upcoming: { days: 14 },
  get_grade_history: { limit: 50 },
  create_task: { title: 'Study for chem quiz', dueDate: '2026-12-03', priority: 'high' },
  update_task: { id: 'TASK_ID', completed: true },
  delete_task: { id: 'TASK_ID' },
  set_assignment_completed: { id: 'ASSIGNMENT_ID', completed: true },
};

const TOOL_RETURNS: Record<string, string> = {
  list_classes: '`{ "classes": [Class, …] }`',
  list_assignments: '`{ "assignments": [Assignment, …] }`',
  list_tasks: '`{ "tasks": [Task, …] }`',
  list_exams: '`{ "exams": [Exam, …] }`',
  get_upcoming: '`{ "today", "through", "overdue": {…}, "assignments": […], "tasks": […], "exams": […] }`',
  get_grade_history: '`{ "history": [Grade history entry, …] }`',
  create_task: '`{ "task": Task }`',
  update_task: '`{ "task": Task }`',
  delete_task: '`{ "success": true }`',
  set_assignment_completed: '`{ "assignment": Assignment }`',
};

/** Complete MCP documentation as Markdown. Tools come from the live definitions. */
export function buildMcpDocs(host: string = DOCS_HOST): string {
  const url = `${host}/api/mcp`;
  const out: string[] = [];
  out.push(`# Canopy MCP server

Lets an AI assistant (Claude Code, Claude Desktop, Cursor, …) read the student's own planner and, with a write token, manage their tasks. Endpoint: \`${url}\` — MCP **Streamable HTTP**, stateless JSON mode.`);
  out.push(`## Connect

1. Create an **MCP token** in Settings → API & MCP access (type: *MCP token*). Prefer **read-only** unless the assistant must change tasks.
2. Add the server to your client. The URL is \`${url}\` and the header is \`Authorization: Bearer spm_…\`.

**Claude Code**
\`\`\`bash
claude mcp add --transport http canopy ${url} --header "Authorization: Bearer YOUR_MCP_TOKEN"
\`\`\`

**Claude Desktop / any stdio-only client** (bridge with \`mcp-remote\`; add to the client's MCP config JSON)
\`\`\`json
{
  "mcpServers": {
    "canopy": {
      "command": "npx",
      "args": ["mcp-remote", "${url}", "--header", "Authorization: Bearer YOUR_MCP_TOKEN"]
    }
  }
}
\`\`\`

**Any client with native remote-HTTP support** — URL \`${url}\`, custom header \`Authorization: Bearer YOUR_MCP_TOKEN\`.

> Not supported: connectors that require OAuth (for example claude.ai “custom connectors”). Access is by bearer token only.`);
  out.push(TOKEN_TYPES);
  out.push(`## How the protocol works

- \`POST ${url}\` with a JSON-RPC 2.0 message (or a batch array of up to 20). Header \`Authorization: Bearer YOUR_MCP_TOKEN\`, \`Content-Type: application/json\`.
- Supported protocol versions: 2025-06-18, 2025-03-26, 2024-11-05 (the server echoes the one you ask for).
- Methods: \`initialize\`, \`ping\`, \`tools/list\`, \`tools/call\`. Notifications (e.g. \`notifications/initialized\`) are answered \`202 Accepted\` with no body.
- Responses are plain JSON (no SSE stream, no sessions). \`GET\` and \`DELETE\` on the endpoint return \`405 Method Not Allowed\` with \`Allow: POST\` — this is normal for a stateless server, and clients should ignore it.
- Read-only tokens only **see** the read tools; the write tools are hidden from \`tools/list\` and refused if called.
- A tool that fails returns a normal result with \`"isError": true\` and a message; protocol problems return a JSON-RPC \`error\`.
- Auth/limits: \`401\` for a bad, expired, revoked or wrong-type (REST) token; \`429\` with \`Retry-After\` over 120 requests/min; \`413\` over 64 KB.

### Try it by hand

\`\`\`bash
# 1. handshake
curl -s ${url} -H "Authorization: Bearer YOUR_MCP_TOKEN" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# 2. list the tools you may use
curl -s ${url} -H "Authorization: Bearer YOUR_MCP_TOKEN" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. call one
curl -s ${url} -H "Authorization: Bearer YOUR_MCP_TOKEN" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_upcoming","arguments":{"days":7}}}'
\`\`\`

A successful \`tools/call\` returns \`{"result":{"content":[{"type":"text","text":"<JSON string>"}]}}\` — the \`text\` is the JSON described under each tool's “Returns”.`);

  const section = (title: string, tools: McpTool[]) => {
    out.push(`## ${title}`);
    for (const t of tools) {
      const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: t.name, arguments: TOOL_EXAMPLES[t.name] ?? {} } };
      out.push([
        `### \`${t.name}\`${t.destructive ? '  — destructive' : ''}`,
        t.description,
        '**Parameters**\n\n' + toolParams(t),
        `**Returns:** ${TOOL_RETURNS[t.name] ?? '`JSON`'}`,
        '**Example `tools/call`**\n\n```json\n' + JSON.stringify(call, null, 2) + '\n```',
      ].join('\n\n'));
    }
  };
  section('Read tools (read-only and read & write tokens)', TOOLS.filter((t) => t.scope === 'read'));
  section('Write tools (read & write tokens only)', TOOLS.filter((t) => t.scope === 'write'));
  out.push(SHAPES);
  out.push(SECURITY);
  return out.join('\n\n') + '\n';
}

export function buildDocs(kind: 'api' | 'mcp', host: string = DOCS_HOST): string {
  return kind === 'mcp' ? buildMcpDocs(host) : buildApiDocs(host);
}
