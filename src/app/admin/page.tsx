'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ParkIcon from '@mui/icons-material/Park';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import ClassIcon from '@mui/icons-material/Class';
import AssignmentIcon from '@mui/icons-material/Assignment';
import QuizIcon from '@mui/icons-material/Quiz';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import type { SystemStats } from '@/lib/db';

function StatCard({ label, value, icon, sub }: { label: string; value: number | string; icon: React.ReactNode; sub?: string }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ color: 'primary.main' }}>{icon}</Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1 }}>{value}</Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            {sub && <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>{sub}</Typography>}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((data) => {
        if (!data.user || data.user.role !== 'admin') {
          router.replace('/');
          return;
        }
        return fetch('/api/admin/stats');
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data?.error) setError(data.error);
        else if (data) setStats(data);
      })
      .catch(() => setError('Failed to load stats.'));
  }, [router]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', pt: 4 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 4 }}>
        <ParkIcon sx={{ color: 'primary.main', fontSize: 32 }} />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1 }}>Admin Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">Aggregate stats only — no private user data</Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {!stats && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {stats && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            Users
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5, mb: 3 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <StatCard label="Registered users" value={stats.totalUsers} icon={<PeopleIcon />} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <StatCard label="Active last 7 days" value={stats.activeUsersLast7Days} icon={<PersonIcon />} sub="by session" />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <StatCard label="Active last 30 days" value={stats.activeUsersLast30Days} icon={<PersonIcon />} sub="by session" />
            </Grid>
          </Grid>

          <Divider sx={{ mb: 3 }} />

          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            Content
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5, mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard label="Classes" value={stats.totalClasses} icon={<ClassIcon />} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard label="Assignments" value={stats.totalAssignments} icon={<AssignmentIcon />} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard label="Exams" value={stats.totalExams} icon={<QuizIcon />} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard label="Tasks" value={stats.totalTasks} icon={<TaskAltIcon />} />
            </Grid>
          </Grid>

          {stats.registrationsByMonth.length > 0 && (
            <>
              <Divider sx={{ mb: 3 }} />
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
                Registrations by Month
              </Typography>
              <Card variant="outlined" sx={{ mt: 1 }}>
                {stats.registrationsByMonth.map(({ month, count }, i) => (
                  <Box
                    key={month}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: 2,
                      py: 1.25,
                      borderBottom: i < stats.registrationsByMonth.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{month}</Typography>
                    <Box sx={{ flex: 3, mx: 2 }}>
                      <Box
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          bgcolor: 'primary.main',
                          width: `${Math.max(4, (count / Math.max(...stats.registrationsByMonth.map((r) => r.count))) * 100)}%`,
                          opacity: 0.8,
                        }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 24, textAlign: 'right' }}>{count}</Typography>
                  </Box>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Box>
  );
}
