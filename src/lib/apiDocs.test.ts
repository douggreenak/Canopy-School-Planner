import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApiDocs, buildMcpDocs, buildDocs, DOCS_HOST } from '@/lib/apiDocs';
import { TOOLS } from '@/lib/mcpTools';

const root = join(__dirname, '..', '..');

describe('API / MCP documentation', () => {
  it('documents every MCP tool, with its parameters', () => {
    const md = buildMcpDocs();
    for (const t of TOOLS) {
      expect(md).toContain(`### \`${t.name}\``);
      const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
      for (const p of props) expect(md).toContain(`\`${p}\``);
    }
  });

  it('documents every REST endpoint', () => {
    const md = buildApiDocs();
    for (const h of [
      'GET `/me`', 'GET `/classes`', 'GET `/assignments`', 'GET `/tasks`', 'GET `/exams`',
      'GET `/grade-history`', 'GET `/upcoming`', 'POST `/tasks`', 'PATCH `/tasks/{id}`',
      'DELETE `/tasks/{id}`', 'PATCH `/assignments/{id}`',
    ]) expect(md).toContain(`### ${h}`);
  });

  it('is different for REST and MCP, and uses the right host and token prefix', () => {
    expect(buildDocs('api')).toContain('/api/v1');
    expect(buildDocs('api')).not.toContain('## Read tools');
    expect(buildDocs('mcp')).toContain('/api/mcp');
    expect(buildDocs('mcp')).toContain('## Read tools');
    expect(buildDocs('mcp', 'https://x.test')).toContain('https://x.test/api/mcp');
    expect(buildDocs('mcp')).toContain(DOCS_HOST);
  });

  it('never contains a real token', () => {
    for (const md of [buildApiDocs(), buildMcpDocs()]) expect(md).not.toMatch(/sp[km]_[A-Za-z0-9_-]{43}/);
  });

  it('matches the committed docs/ files (run `npm run docs` to refresh)', () => {
    expect(readFileSync(join(root, 'docs', 'API.md'), 'utf8')).toBe(buildApiDocs());
    expect(readFileSync(join(root, 'docs', 'MCP.md'), 'utf8')).toBe(buildMcpDocs());
  });
});
