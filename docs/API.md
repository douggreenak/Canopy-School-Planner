# Canopy API & MCP

Per-user access to your own planner data for scripts and AI assistants.

## Get a token
Settings → **API & MCP access** → name it, choose **read-only** (default) or **read & write**, pick an expiry, confirm your password. The token (`spk_…`) is shown **once**. Up to 10 active tokens; revoke any time. Changing your password revokes all tokens.

## REST (`/api/v1`, header `Authorization: Bearer spk_…`)
| Method & path | Scope | Notes |
|---|---|---|
| GET `/me` | read | username + token scope |
| GET `/classes` | read | |
| GET `/assignments?classId&completed&from&to&limit` | read | dates `YYYY-MM-DD` |
| GET `/tasks?completed&limit` | read | |
| GET `/exams?from&to` | read | |
| GET `/grade-history?classId&limit` | read | |
| GET `/upcoming?days=7` | read | overdue + due soon, in your timezone |
| POST `/tasks` | write | `{title, description?, dueDate?, priority?, category?, classId?, stages?, stageId?}` |
| PATCH/DELETE `/tasks/{id}` | write | PATCH also takes `stages` (`[{id,label}]`, ≤12; `[]` clears) and `stageId` (`null` = not started). `completed` is derived: true iff `stageId` is the last stage. Tasks and assignments return `stages` and `stageId`. |
| PATCH `/assignments/{id}` | write | `{completed}` only |

## MCP (`POST /api/mcp`, Streamable HTTP, stateless)
Tools: `list_classes`, `list_assignments`, `list_tasks`, `list_exams`, `get_upcoming`, `get_grade_history` (read); `create_task`, `update_task`, `delete_task`, `set_assignment_completed` (write — hidden from read-only tokens).

Claude Code:
```
claude mcp add --transport http canopy https://YOUR-HOST/api/mcp --header "Authorization: Bearer spk_..."
```
Clients that only speak stdio can bridge with `npx mcp-remote https://YOUR-HOST/api/mcp --header "Authorization: Bearer spk_..."`. (OAuth-only connectors, e.g. claude.ai custom connectors, are not supported — tokens are bearer-header only.)

## Security model
- **Isolation:** a token maps to one user; every query is scoped to that user id. No admin/cross-user mode. Foreign ids (e.g. another student's `classId`) are rejected.
- **At rest:** only a SHA-256 of the token is stored; the raw value can't be recovered.
- **Transport/CSRF:** bearer header only — cookies and session tokens are rejected on `/api/v1` and `/api/mcp`, and API tokens are rejected everywhere else. Browser `Origin`s other than this site (or `MCP_ALLOWED_ORIGINS`) are refused; no CORS headers are sent.
- **Least privilege:** read-only by default; writes limited to personal tasks and assignment completion. Settings, PowerSchool credentials, sync logs, school accounts and sessions are not reachable. Output uses explicit field allowlists.
- **Token lifecycle:** mandatory expiry (≤1 year), creation needs session + password re-entry, tokens can't mint/list/revoke tokens, revoked on password change and account deletion.
- **Abuse limits:** 120 req/min per token, failed-auth throttle per IP, 64 KB body cap, `Cache-Control: no-store`.
- **Prompt injection:** assignment titles/notes are free text. The MCP server tells clients to treat them as data; prefer read-only tokens for assistants that also read untrusted content.
- Limiters are per-instance in-memory (like the login limiter); production should serve HTTPS only.
