'use client';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import NextLink from 'next/link';
import { useFetch } from '@/lib/hooks';

interface SyncStatus {
  status?: 'idle' | 'running' | 'success' | 'error';
  error?: string | null;
  finishedAt?: string;
}

// Matches the scraper's login-rejected errors ("PowerSchool login failed:
// Invalid Username or Password!") but not unrelated failures like timeouts.
const LOGIN_ERROR = /login failed|invalid (username|password)|incorrect (username|password)/i;

// Shown on Home and Grades when the most recent sync (scheduled or manual)
// failed because PowerSchool rejected the saved login. It clears itself the
// next time a sync succeeds, since that overwrites the stored status.
export default function PowerSchoolLoginWarning() {
  const { data } = useFetch<SyncStatus>('/api/powerschool/status');
  if (!data || data.status !== 'error' || !data.error || !LOGIN_ERROR.test(data.error)) return null;

  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
      action={
        <Button color="inherit" size="small" component={NextLink} href="/settings">
          Fix in Settings
        </Button>
      }
    >
      <AlertTitle>PowerSchool sync failed — check your password</AlertTitle>
      PowerSchool rejected your saved username or password, so your grades and assignments aren&apos;t updating. Re-enter your PowerSchool password in Settings and run Sync Now.
    </Alert>
  );
}
