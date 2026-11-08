'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import { useClasses, useHomework, useSettings } from '@/lib/hooks';
import {
  activeZeroAssignments, parseDismissedZeros, serializeDismissedZeros, zeroKey,
} from '@/lib/zeroGrades';

// Warns about PowerSchool assignments that scored 0. Dismissing is permanent
// for that assignment and saved server-side (settings.dismissedZeroAssignments)
// so it stays dismissed on every platform.
export default function ZeroGradeBanner() {
  const { data: homework } = useHomework();
  const { data: classes } = useClasses();
  const { data: settings, mutate } = useSettings();
  const router = useRouter();

  const dismissed = useMemo(() => parseDismissedZeros(settings?.dismissedZeroAssignments), [settings]);
  const zeros = useMemo(() => activeZeroAssignments(homework ?? [], dismissed), [homework, dismissed]);
  if (zeros.length === 0) return null;

  const className = (id: string) => (classes ?? []).find((c) => c.id === id)?.name ?? '';

  const dismiss = (keys: string[]) => {
    const next = serializeDismissedZeros([...dismissed, ...keys]);
    mutate((prev) => ({ ...(prev ?? {}), dismissedZeroAssignments: next }));
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'dismissedZeroAssignments', value: next }),
    }).catch(() => {});
  };

  const first = zeros[0];
  const cls = className(first.classId);
  const title = zeros.length === 1
    ? `You got a 0 on ${first.title}`
    : `You have ${zeros.length} assignments with a 0`;

  return (
    <Alert
      severity="warning"
      variant="outlined"
      sx={{ mb: 2 }}
      onClose={() => dismiss(zeros.map(zeroKey))}
      action={
        <Button color="inherit" size="small" onClick={() => router.push(`/grades/${first.classId}`)}>
          View
        </Button>
      }
    >
      <AlertTitle sx={{ mb: zeros.length > 1 ? 0.5 : 0 }}>{title}</AlertTitle>
      {zeros.length === 1
        ? (cls ? `${cls} — talk to your teacher about making it up.` : 'Talk to your teacher about making it up.')
        : zeros.slice(0, 4).map((h) => `${h.title}${className(h.classId) ? ` (${className(h.classId)})` : ''}`).join(' · ')}
    </Alert>
  );
}
