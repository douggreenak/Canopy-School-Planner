'use client';
import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import SchoolIcon from '@mui/icons-material/School';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StorageIcon from '@mui/icons-material/Storage';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import TimezonePicker from '@/components/TimezonePicker';

const STEPS = ['Welcome', 'School Info', 'PowerSchool', 'Done'];

interface Props {
  open: boolean;
  onClose: () => void;
  required?: boolean;
}

export default function SetupWizard({ open, onClose, required = false }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — school info
  const [schoolName, setSchoolName] = useState('');
  const [semesterStart, setSemesterStart] = useState('');
  const [semesterEnd, setSemesterEnd] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/New_York'; }
  });

  // Step 2 — PowerSchool
  const [psUrl, setPsUrl] = useState('');
  const [psUser, setPsUser] = useState('');
  const [psPass, setPsPass] = useState('');
  const [showPsPass, setShowPsPass] = useState(false);
  const [psSynced, setPsSynced] = useState(false);
  const [psLog, setPsLog] = useState<string[]>([]);
  const [psSummary, setPsSummary] = useState('');

  // ---- actions ----

  const saveSchoolInfo = async () => {
    setError('');
    setBusy(true);
    try {
      const settings: Record<string, string> = { schoolName, semesterStart, semesterEnd, timezone };
      for (const [key, value] of Object.entries(settings)) {
        if (!value) continue;
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      setStep(2);
    } catch {
      setError('Failed to save school info.');
    }
    setBusy(false);
  };

  const syncPowerSchool = async () => {
    setError('');
    setBusy(true);
    setPsLog([]);
    setPsSummary('');
    try {
      await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-powerschool', url: psUrl, username: psUser, password: psPass }),
      });
      const res = await fetch('/api/powerschool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: psUrl, username: psUser, password: psPass }),
      });
      const data = await res.json();
      if (data.log) setPsLog(data.log);
      if (data.success) {
        const parts: string[] = [];
        if (data.classAdded) parts.push(`${data.classAdded} classes added`);
        if (data.classUpdated) parts.push(`${data.classUpdated} updated`);
        if (data.assignmentCount) parts.push(`${data.assignmentCount} assignments synced`);
        setPsSummary(parts.length > 0 ? parts.join(', ') : 'Sync complete — no changes.');
        setPsSynced(true);
        setStep(3);
      } else {
        setError(data.error || 'PowerSchool sync failed.');
      }
    } catch (e) {
      setError(`Connection error: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sp-wizard-dismissed', '1');
    }
    onClose();
  };

  const canSyncPS = psUrl.trim() && psUser.trim() && psPass.trim();

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      onClose={required ? undefined : handleClose}
      sx={{ '& .MuiDialog-paper': { borderRadius: 3 } }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', px: 3, pt: 3, pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <SchoolIcon sx={{ fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Setup Wizard</Typography>
          </Box>
          <Stepper
            activeStep={step}
            alternativeLabel
            sx={{
              '& .MuiStepLabel-label': { color: 'primary.contrastText', opacity: 0.7 },
              '& .MuiStepLabel-label.Mui-active': { opacity: 1, fontWeight: 600 },
              '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.3)' },
              '& .MuiStepIcon-root.Mui-active': { color: 'white' },
              '& .MuiStepIcon-root.Mui-completed': { color: 'rgba(255,255,255,0.8)' },
              '& .MuiStepConnector-line': { borderColor: 'rgba(255,255,255,0.3)' },
            }}
          >
            {STEPS.map((label) => (
              <Step key={label}><StepLabel>{label}</StepLabel></Step>
            ))}
          </Stepper>
        </Box>

        {/* Body */}
        <Box sx={{ px: 3, py: 3 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

          {/* ===== STEP 0: Welcome ===== */}
          {step === 0 && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="h6" gutterBottom>Welcome to Canopy!</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Your data is stored in a Neon PostgreSQL database — no spreadsheet setup needed. This wizard helps you add your school info and optionally import your schedule from PowerSchool.
                </Typography>
                <Alert severity="success" icon={<StorageIcon />} sx={{ mt: 1.5 }}>
                  Database connected and ready.
                </Alert>
              </Box>
              <Button
                variant="contained"
                size="large"
                fullWidth
                endIcon={<ArrowForwardIcon />}
                onClick={() => setStep(1)}
              >
                Get Started
              </Button>
              {!required && (
                <Button size="small" color="inherit" sx={{ color: 'text.disabled' }} onClick={handleClose}>
                  Skip — I&apos;ll set up in Settings
                </Button>
              )}
            </Stack>
          )}

          {/* ===== STEP 1: School Info ===== */}
          {step === 1 && (
            <Stack spacing={2.5}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <SchoolIcon color="primary" />
                  <Typography variant="h6">School Information</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  These settings are saved to your database and sync across all devices automatically.
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="School Name"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. Lincoln High School"
                helperText="Shown as a label throughout the app"
              />

              <Stack direction="row" spacing={2}>
                <TextField
                  fullWidth
                  label="Semester Start Date"
                  type="date"
                  value={semesterStart}
                  onChange={(e) => setSemesterStart(e.target.value)}
                  helperText="First day of your current semester"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  fullWidth
                  label="Semester End Date"
                  type="date"
                  value={semesterEnd}
                  onChange={(e) => setSemesterEnd(e.target.value)}
                  helperText="Last day of finals / end of term"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>

              <Alert severity="info" sx={{ py: 0.5 }}>
                Your Dashboard and Schedule only show classes that fall within these dates — so outside the semester (e.g. over summer) they&apos;ll look empty. You can change these anytime in Settings.
              </Alert>

              <TimezonePicker
                value={timezone}
                onChange={setTimezone}
                label="Your timezone"
                size="medium"
                helperText="Used for calendar feed and schedule display"
              />

              <Stack direction="row" spacing={1.5}>
                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(0)} disabled={busy}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  sx={{ flex: 1 }}
                  startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardIcon />}
                  onClick={saveSchoolInfo}
                  disabled={busy}
                >
                  Save &amp; Continue
                </Button>
                {!required && (
                  <Button variant="outlined" onClick={() => setStep(2)} disabled={busy}>
                    Skip
                  </Button>
                )}
              </Stack>
            </Stack>
          )}

          {/* ===== STEP 2: PowerSchool ===== */}
          {step === 2 && (
            <Stack spacing={2.5}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <SyncIcon color="primary" />
                  <Typography variant="h6">PowerSchool Import</Typography>
                  <Chip label="Optional" size="small" variant="outlined" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Import your class schedule, assignments, and grades directly from PowerSchool. Credentials are saved securely so future syncs need just one click.
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="PowerSchool URL"
                value={psUrl}
                onChange={(e) => { setPsUrl(e.target.value); setError(''); }}
                placeholder="https://your-school.powerschool.com"
                helperText="Any URL from your school's PowerSchool portal"
              />

              <Stack direction="row" spacing={2}>
                <TextField
                  fullWidth
                  label="Student Username"
                  value={psUser}
                  onChange={(e) => { setPsUser(e.target.value); setError(''); }}
                  helperText="e.g. s123456"
                  autoComplete="off"
                />
                <TextField
                  fullWidth
                  label="Student Password"
                  type={showPsPass ? 'text' : 'password'}
                  value={psPass}
                  onChange={(e) => { setPsPass(e.target.value); setError(''); }}
                  autoComplete="new-password"
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPsPass((v) => !v)}>
                            {showPsPass ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Stack>

              {psLog.length > 0 && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2">Sync log ({psLog.length} entries)</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ fontSize: '0.72rem', maxHeight: 160, overflowY: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                      {psLog.map((line, i) => <div key={i}>{line}</div>)}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )}

              <Stack direction="row" spacing={1.5}>
                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(1)} disabled={busy}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  sx={{ flex: 1 }}
                  startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
                  onClick={syncPowerSchool}
                  disabled={!canSyncPS || busy}
                >
                  {busy ? 'Syncing…' : 'Connect & Sync'}
                </Button>
                <Button variant="outlined" onClick={() => setStep(3)} disabled={busy}>
                  Skip
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                You can always sync PowerSchool later from the Settings page.
              </Typography>
            </Stack>
          )}

          {/* ===== STEP 3: Done ===== */}
          {step === 3 && (
            <Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
              <Typography variant="h5" sx={{ fontWeight: 600 }}>You&apos;re all set!</Typography>

              {psSynced && psSummary && (
                <Alert severity="success" sx={{ width: '100%', textAlign: 'left' }}>
                  PowerSchool sync: {psSummary}
                </Alert>
              )}

              {psSynced && psLog.length > 0 && (
                <Accordion sx={{ width: '100%' }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2" sx={{ textAlign: 'left' }}>Sync log ({psLog.length} entries)</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ fontSize: '0.72rem', maxHeight: 160, overflowY: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1, textAlign: 'left' }}>
                      {psLog.map((line, i) => <div key={i}>{line}</div>)}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )}

              <Typography variant="body2" color="text.secondary">
                Head to the <strong>Dashboard</strong> to see your schedule, or visit <strong>Settings</strong> to configure the iCal calendar feed and PowerSchool sync.
              </Typography>

              <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button variant="contained" size="large" sx={{ flex: 1 }} endIcon={<ArrowForwardIcon />} onClick={handleClose}>
                  Go to Dashboard
                </Button>
              </Stack>
            </Stack>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
