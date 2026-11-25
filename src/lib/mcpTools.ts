// MCP tool definitions. Each tool is a thin wrapper over plannerApi.ts, so MCP
// has exactly the same per-user scoping and field allowlists as the REST API.
import type { ApiScope } from './apiAuth';
import * as api from './plannerApi';

export interface McpTool {
  name: string;
  description: string;
  scope: ApiScope;
  readOnly: boolean;
  destructive?: boolean;
  inputSchema: Record<string, unknown>;
  run: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const date = (d: string) => str(`${d} (YYYY-MM-DD)`, { pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const obj = (properties: Record<string, unknown> = {}, required: string[] = []) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const taskProps = {
  title: str('Task title', { maxLength: 1000 }),
  description: str('Details', { maxLength: 5000 }),
  dueDate: date('Due date'),
  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
  category: str('Category, e.g. Homework, Study', { maxLength: 100 }),
  classId: str('Optional id of one of the student\'s classes (from list_classes)'),
};

export const TOOLS: McpTool[] = [
  {
    name: 'list_classes', scope: 'read', readOnly: true,
    description: 'List the student\'s classes with teacher, room, period, meeting days/times and current grade.',
    inputSchema: obj(), run: (u) => api.listClasses(u).then((classes) => ({ classes })),
  },
  {
    name: 'list_assignments', scope: 'read', readOnly: true,
    description: 'List assignments (synced homework) with due dates, completion, scores and flags. Filter by class, completion or due-date range.',
    inputSchema: obj({
      classId: str('Only this class'), completed: { type: 'boolean' },
      from: date('Due on or after'), to: date('Due on or before'),
      limit: { type: 'integer', minimum: 1, maximum: 500 },
    }),
    run: (u, a) => api.listAssignments(u, a).then((assignments) => ({ assignments })),
  },
  {
    name: 'list_tasks', scope: 'read', readOnly: true,
    description: 'List the student\'s personal to-do tasks.',
    inputSchema: obj({ completed: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 500 } }),
    run: (u, a) => api.listTasks(u, a).then((tasks) => ({ tasks })),
  },
  {
    name: 'list_exams', scope: 'read', readOnly: true,
    description: 'List exams, optionally within a date range.',
    inputSchema: obj({ from: date('On or after'), to: date('On or before') }),
    run: (u, a) => api.listExams(u, a).then((exams) => ({ exams })),
  },
  {
    name: 'get_upcoming', scope: 'read', readOnly: true,
    description: 'What is due soon: overdue items plus assignments, tasks and exams due in the next N days (default 7), using the student\'s own timezone.',
    inputSchema: obj({ days: { type: 'integer', minimum: 0, maximum: 90 } }),
    run: (u, a) => api.getUpcoming(u, a.days ?? 7),
  },
  {
    name: 'get_grade_history', scope: 'read', readOnly: true,
    description: 'Historical grade snapshots (percent and letter per sync), optionally for one class.',
    inputSchema: obj({ classId: str('Only this class'), limit: { type: 'integer', minimum: 1, maximum: 500 } }),
    run: (u, a) => api.listGradeHistory(u, a).then((history) => ({ history })),
  },
  {
    name: 'create_task', scope: 'write', readOnly: false,
    description: 'Create a personal to-do task.',
    inputSchema: obj(taskProps, ['title']),
    run: (u, a) => api.createTask(u, a).then((task) => ({ task })),
  },
  {
    name: 'update_task', scope: 'write', readOnly: false,
    description: 'Edit a personal task or mark it done/not done.',
    inputSchema: obj({ id: str('Task id'), ...taskProps, completed: { type: 'boolean' } }, ['id']),
    run: (u, a) => api.patchTask(u, String(a.id ?? ''), a).then((task) => ({ task })),
  },
  {
    name: 'delete_task', scope: 'write', readOnly: false, destructive: true,
    description: 'Permanently delete a personal task (not synced assignments).',
    inputSchema: obj({ id: str('Task id') }, ['id']),
    run: (u, a) => api.removeTask(u, String(a.id ?? '')).then(() => ({ success: true })),
  },
  {
    name: 'set_assignment_completed', scope: 'write', readOnly: false,
    description: 'Mark an assignment done or not done. Assignment content itself cannot be changed.',
    inputSchema: obj({ id: str('Assignment id'), completed: { type: 'boolean' } }, ['id', 'completed']),
    run: (u, a) => api.setAssignmentCompleted(u, String(a.id ?? ''), a.completed).then((assignment) => ({ assignment })),
  },
];
