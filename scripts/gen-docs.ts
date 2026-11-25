// Regenerates docs/API.md and docs/MCP.md from src/lib/apiDocs.ts.
//   npm run docs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApiDocs, buildMcpDocs } from '../src/lib/apiDocs';

const docs = join(__dirname, '..', 'docs');
writeFileSync(join(docs, 'API.md'), buildApiDocs());
writeFileSync(join(docs, 'MCP.md'), buildMcpDocs());
console.log('wrote docs/API.md and docs/MCP.md');
