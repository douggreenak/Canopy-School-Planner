'use client';
import { useCallback, useEffect, useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ApiIcon from '@mui/icons-material/Api';
import DeleteIcon from '@mui/icons-material/Delete';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface TokenRow { id: string; name: string; hint: string; scope: 'read' | 'write'; kind: 'api' | 'mcp'; createdAt: number; expiresAt: number; lastUsedAt: number | null }

const fmt = (ms: number) => new Date(ms).toLocaleDateString();

export default function ApiAccessSection() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [kind, setKind] = useState<'api' | 'mcp'>('api');
  const [days, setDays] = useState('90');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ token: string; kind: 'api' | 'mcp' } | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    const r = await fetch('/api/tokens');
    if (r.ok) setTokens((await r.json()).tokens);
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const create = async () => {
    setBusy(true); setError(''); setCreated(null);
    try {
      const r = await fetch('/api/tokens', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, scope, kind, expiresInDays: Number(days), password }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Could not create token.'); return; }
      setCreated({ token: data.token, kind }); setName(''); setPassword('');
      await load();
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  };

  return (
    <Accordion id="settings-api" disableGutters sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ApiIcon color="primary" /> API &amp; MCP access
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Let your own tools or AI assistants (via MCP) read your planner. A token only ever sees <b>your</b> data,
          is shown once, and can be revoked any time. Treat it like a password. Default to read-only.
        </Typography>

        {created && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCreated(null)}>
            Copy this token now — it won&apos;t be shown again.
            <Box component="code" sx={{ display: 'block', mt: 1, wordBreak: 'break-all', userSelect: 'all' }}>{created.token}</Box>
            <Box sx={{ mt: 1, fontSize: '0.8rem' }}>
              {created.kind === 'mcp'
                ? <>MCP URL: <code>{origin}/api/mcp</code> (works only there)</>
                : <>REST base: <code>{origin}/api/v1</code> (works only there)</>}
              {' '}· header <code>Authorization: Bearer &lt;token&gt;</code>
            </Box>
          </Alert>
        )}

        <Stack spacing={1.5} sx={{ maxWidth: 420, mb: 3 }}>
          <TextField size="small" label="Token name (e.g. Claude Desktop)" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
          <TextField size="small" select label="Type" value={kind}
            onChange={(e) => { const k = e.target.value as 'api' | 'mcp'; setKind(k); if (k === 'api' && Number(days) > 365) setDays('365'); }}>
            <MenuItem value="api">REST API token (/api/v1)</MenuItem>
            <MenuItem value="mcp">MCP token (/api/mcp, for AI assistants)</MenuItem>
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" select fullWidth label="Access" value={scope} onChange={(e) => setScope(e.target.value as 'read' | 'write')}>
              <MenuItem value="read">Read-only</MenuItem>
              <MenuItem value="write">Read &amp; write (tasks, mark done)</MenuItem>
            </TextField>
            <TextField size="small" select fullWidth label="Expires" value={days} onChange={(e) => setDays(e.target.value)}>
              <MenuItem value="30">30 days</MenuItem>
              <MenuItem value="90">90 days</MenuItem>
              <MenuItem value="365">1 year</MenuItem>
              {kind === 'mcp' && <MenuItem value="1825">5 years</MenuItem>}
            </TextField>
          </Stack>
          <TextField size="small" type="password" label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="contained" onClick={create} disabled={busy || !name.trim() || !password} sx={{ alignSelf: 'flex-start' }}>
            Create token
          </Button>
        </Stack>

        {tokens.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No active tokens.</Typography>
        ) : (
          <Stack spacing={1}>
            {tokens.map((t) => (
              <Stack key={t.id} direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.name} <Typography component="span" variant="caption" color="text.secondary">…{t.hint}</Typography></Typography>
                  <Typography variant="caption" color="text.secondary">
                    Created {fmt(t.createdAt)} · expires {fmt(t.expiresAt)} · {t.lastUsedAt ? `last used ${fmt(t.lastUsedAt)}` : 'never used'}
                  </Typography>
                </Box>
                <Chip size="small" variant="outlined" label={t.kind === 'mcp' ? 'MCP' : 'REST'} />
                <Chip size="small" label={t.scope === 'write' ? 'read & write' : 'read-only'} color={t.scope === 'write' ? 'warning' : 'default'} />
                <IconButton size="small" aria-label={`Revoke ${t.name}`} onClick={() => revoke(t.id)}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
