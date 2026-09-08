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
import LinearProgress from '@mui/material/LinearProgress';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import SchoolIcon from '@mui/icons-material/School';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StorageIcon from '@mui/icons-material/Storage';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import TimezonePicker from '@/components/TimezonePicker';
import { useEnterConfirm } from '@/lib/hooks';

// PowerSchool moved ahead of School Info — connecting it is the single
// highest-leverage step (it pre-fills classes/schedule automatically), so
// it's asked first rather than after a form with no payoff yet.
const STEPS = ['Welcome', 'PowerSchool', 'School Info', 'Done'];

function defaultSemesterDates() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 4);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

interface Props {
  open: boolean;
  onClose: () => void;
  required?: boolean;
}

export default function SetupWizard({ open, onClose, required = false }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Step 2 — school info. Semester dates default to "today through 4 months
  // out" rather than starting blank — a new user isn't blocked staring at
  // empty date pickers, and can always fine-tune (or leave as-is) later in
  // Settings.
  const [schoolName, setSchoolName] = useState('');
  const [{ start: defaultSemStart, end: defaultSemEnd }] = useState(defaultSemesterDates);
  const [semesterStart, setSemesterStart] = useState(defaultSemStart);
  const [semesterEnd, setSemesterEnd] = useState(defaultSemEnd);
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/New_York'; }
  });

  // Step 1 — PowerSchool
  const [psUrl, setPsUrl] = useState('');
  const [psUser, setPsUser] = useState('');
  const [psPass, setPsPass] = useState('');
  const [showPsPass, setShowPsPass] = useState(false);
  const [psSynced, setPsSynced] = useState(false);
  const [psLog, setPsLog] = useState<string[]>([]);
  const [psSummary, setPsSummary] = useState('');
  // Confirmation sub-view shown when "Skip" is clicked on the PowerSchool
  // step — the user sees exactly what they're giving up before it's final.
  const [confirmSkipPs, setConfirmSkipPs] = useState(false);
  // Tracks whether the user actually declined PowerSchool (vs. connected
  // it) so the Done step can offer the manual/Lathrop path only when it's
  // actually relevant.
  const [declinedPowerSchool, setDeclinedPowerSchool] = useState(false);
  const [manualLathropEnabled, setManualLathropEnabled] = useState(false);

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
      setStep(3);
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
        setDeclinedPowerSchool(false);
        // A successful connection is exactly the case where scheduled sync
        // is most worth defaulting to on — the user just proved their
        // credentials work, so keeping data fresh going forward shouldn't
        // need a second trip to Settings. utcHour matches the same default
        // the Settings page's own picker starts from; easy to change there.
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'powerschoolAutoSync', value: { enabled: true, utcHour: 12 } }),
        }).catch(() => {});
        setStep(2);
      } else {
        setError(data.error || 'PowerSchool sync failed.');
      }
    } catch (e) {
      setError(`Connection error: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  const toggleManualLathrop = async (enabled: boolean) => {
    setManualLathropEnabled(enabled);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'lathropMode', value: enabled }),
    }).catch(() => {});
  };

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sp-wizard-dismissed', '1');
    }
    onClose();
  };

  const canSyncPS = psUrl.trim() && psUser.trim() && psPass.trim();

  // Enter confirms whichever primary action the *currently visible* step's
  // contained button performs — matching each step's own onClick/disabled
  // exactly, since a step change swaps out what "primary" even means.
  const primaryAction = () => {
    if (step === 0) { setStep(1); return; }
    if (step === 1) {
      if (confirmSkipPs) { setDeclinedPowerSchool(true); setConfirmSkipPs(false); setStep(2); }
      else syncPowerSchool();
      return;
    }
    if (step === 2) { saveSchoolInfo(); return; }
    handleClose(); // step === 3
  };
  const primaryEnabled =
    step === 0 ? true :
    step === 1 ? (confirmSkipPs ? true : (!!canSyncPS && !busy)) :
    step === 2 ? !busy :
    true; // step === 3

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      onClose={required ? undefined : handleClose}
      onKeyDown={useEnterConfirm(open && primaryEnabled, primaryAction)}
      sx={{ '& .MuiDialog-paper': { borderRadius: fullScreen ? 0 : 3 } }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', px: 3, pt: 3, pb: 2, position: 'relative' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <SchoolIcon sx={{ fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, flex: 1 }}>Setup Wizard</Typography>
            {!required && (
              <IconButton onClick={handleClose} aria-label="Close" sx={{ color: 'primary.contrastText', mr: -1 }}>
                <CloseIcon />
              </IconButton>
            )}
          </Box>
          {/* Mobile: compact "Step X of Y" progress bar — a full labeled
              stepper doesn't fit a phone width without labels wrapping and
              throwing off the connector lines. Desktop keeps the classic
              Material stepper. */}
          {fullScreen ? (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{STEPS[step]}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>Step {step + 1} of {STEPS.length}</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={((step + 1) / STEPS.length) * 100}
                sx={(theme) => ({
                  height: 4,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.contrastText, 0.25),
                  '& .MuiLinearProgress-bar': { bgcolor: theme.palette.primary.contrastText, borderRadius: 2 },
                })}
              />
            </Box>
          ) : (
            <Stepper
              activeStep={step}
              alternativeLabel
              sx={(theme) => ({
                '& .MuiStepLabel-label': { color: 'primary.contrastText', opacity: 0.7 },
                '& .MuiStepLabel-label.Mui-active': { opacity: 1, fontWeight: 600 },
                '& .MuiStepIcon-root': { color: alpha(theme.palette.primary.contrastText, 0.3) },
                '& .MuiStepIcon-root.Mui-active': { color: theme.palette.primary.contrastText },
                '& .MuiStepIcon-root.Mui-completed': { color: alpha(theme.palette.primary.contrastText, 0.8) },
                '& .MuiStepConnector-line': { borderColor: alpha(theme.palette.primary.contrastText, 0.3) },
              })}
            >
              {STEPS.map((label) => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>
          )}
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
                  Your data is stored in a Neon PostgreSQL database — no spreadsheet setup needed. We&apos;ll start by connecting PowerSchool (it does most of the setup for you), then fill in a few school details.
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

          {/* ===== STEP 1: PowerSchool ===== */}
          {step === 1 && (
            <Stack spacing={2.5}>
              {!confirmSkipPs ? (
                <>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <SyncIcon color="primary" />
                      <Typography variant="h6">Connect PowerSchool</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      This is the fastest way to set up Canopy — it imports your classes and schedule automatically, keeps your grades in sync, and unlocks grade analytics (velocity alerts, missing-work triage, what-if calculator). Credentials are saved securely so future syncs need just one click.
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

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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

                  {fullScreen ? (
                    <Stack spacing={1.5}>
                      <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
                        onClick={syncPowerSchool}
                        disabled={!canSyncPS || busy}
                      >
                        {busy ? 'Syncing…' : 'Connect & Sync'}
                      </Button>
                      <Stack direction="row" spacing={1.5}>
                        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(0)} disabled={busy} sx={{ flex: 1 }}>
                          Back
                        </Button>
                        <Button variant="outlined" onClick={() => setConfirmSkipPs(true)} disabled={busy} sx={{ flex: 1 }}>
                          Skip
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={1.5}>
                      <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(0)} disabled={busy}>
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
                      <Button variant="outlined" onClick={() => setConfirmSkipPs(true)} disabled={busy}>
                        Skip
                      </Button>
                    </Stack>
                  )}
                </>
              ) : (
                // Skip confirmation — shown in place of the form so declining
                // is a deliberate choice, not an easy-to-miss link.
                <>
                  <Box>
                    <Typography variant="h6" gutterBottom>Skip PowerSchool?</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      Without PowerSchool connected, Canopy can&apos;t automatically:
                    </Typography>
                    <Stack spacing={0.5} sx={{ pl: 1 }}>
                      {[
                        'Import your classes, teachers, and room numbers',
                        'Sync your grades and assignments',
                        'Show grade velocity alerts and missing-work triage',
                        'Run the what-if and final-exam grade calculators',
                        'Keep any of the above updated automatically over time',
                      ].map((line) => (
                        <Typography key={line} variant="body2" sx={{ display: 'flex', gap: 1 }}>
                          <Box component="span" sx={{ color: 'error.main' }}>✕</Box> {line}
                        </Typography>
                      ))}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      You can still set up your schedule manually — including a one-click Lathrop High School bell schedule — and connect PowerSchool anytime later from Settings.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1.5}>
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setConfirmSkipPs(false)} sx={{ flex: 1 }}>
                      Go back
                    </Button>
                    <Button
                      variant="contained"
                      color="error"
                      sx={{ flex: 1 }}
                      onClick={() => { setDeclinedPowerSchool(true); setConfirmSkipPs(false); setStep(2); }}
                    >
                      Continue without PowerSchool
                    </Button>
                  </Stack>
                </>
              )}
            </Stack>
          )}

          {/* ===== STEP 2: School Info ===== */}
          {step === 2 && (
            <Stack spacing={2.5}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <SchoolIcon color="primary" />
                  <Typography variant="h6">School Information</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  These settings are saved to your database and sync across all devices automatically. Every field below already has a sensible default — change only what you need to.
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="School Name"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. Lincoln High School"
                helperText="Shown as a label throughout the app — optional"
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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

              {fullScreen ? (
                <Stack spacing={1.5}>
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardIcon />}
                    onClick={saveSchoolInfo}
                    disabled={busy}
                  >
                    Save &amp; Continue
                  </Button>
                  <Stack direction="row" spacing={1.5}>
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(1)} disabled={busy} sx={{ flex: 1 }}>
                      Back
                    </Button>
                    {!required && (
                      <Button variant="outlined" onClick={() => setStep(3)} disabled={busy} sx={{ flex: 1 }}>
                        Skip
                      </Button>
                    )}
                  </Stack>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1.5}>
                  <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(1)} disabled={busy}>
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
                    <Button variant="outlined" onClick={() => setStep(3)} disabled={busy}>
                      Skip
                    </Button>
                  )}
                </Stack>
              )}
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

              {/* Manual schedule setup nudge — only relevant when the user
                  actually declined PowerSchool, since a successful sync
                  already populated the schedule automatically. */}
              {declinedPowerSchool && (
                <Alert
                  severity="info"
                  variant="outlined"
                  sx={{ width: '100%', textAlign: 'left' }}
                  icon={<SchoolIcon fontSize="small" />}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Set up your schedule manually</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    If your school follows Lathrop High School&apos;s bell schedule, turn this on and Canopy fills in each class&apos;s period times automatically once you&apos;ve added your classes. Otherwise, add classes yourself anytime from the Classes page.
                  </Typography>
                  <Button
                    variant={manualLathropEnabled ? 'contained' : 'outlined'}
                    size="small"
                    startIcon={manualLathropEnabled ? <CheckCircleIcon /> : undefined}
                    onClick={() => toggleManualLathrop(!manualLathropEnabled)}
                  >
                    {manualLathropEnabled ? 'Lathrop Mode enabled' : 'Enable Lathrop Mode'}
                  </Button>
                </Alert>
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
