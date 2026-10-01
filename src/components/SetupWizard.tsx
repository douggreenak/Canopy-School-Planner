'use client';
import { useState } from 'react';
import dayjs from 'dayjs';
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

import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { v4 as uuid } from 'uuid';
import TimezonePicker from '@/components/TimezonePicker';
import { useEnterConfirm } from '@/lib/hooks';
import { usePowerSchoolSyncStatus, pokePowerSchoolStatus } from '@/lib/powerschoolStatusStore';
import VerifiedIcon from '@mui/icons-material/Verified';
import DeleteIcon from '@mui/icons-material/Delete';
import EventBusyIcon from '@mui/icons-material/EventBusy';

// PowerSchool moved ahead of School Info — connecting it is the single
// highest-leverage step (it pre-fills classes/schedule automatically), so
// it's asked first rather than after a form with no payoff yet. Bell
// Schedule (Lathrop Mode) comes before PowerSchool so the choice is made up
// front regardless of whether the user goes on to connect PowerSchool or
// skips it — previously this only ever surfaced as a toggle on the Done step,
// and only for someone who'd declined PowerSchool, so most users never
// actually made the choice at all (it silently defaulted to on).
const STEPS = ['Welcome', 'Bell Schedule', 'PowerSchool', 'School Info', 'Done'];

interface SchoolBreak {
  id: string;
  label: string;
  start: string;
  end: string;
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

  // Step 2 — school info. School is treated as in session every day by
  // default (no semester dates to fill in) — the only thing worth capturing
  // here is the reverse: known breaks (summer, winter, etc.) the user can
  // optionally add now, each saved as a "No School" disruption. More can
  // always be added later from the Schedule page.
  const [schoolName, setSchoolName] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/New_York'; }
  });
  const [breaks, setBreaks] = useState<SchoolBreak[]>([]);
  const [breakLabel, setBreakLabel] = useState('');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');

  const addBreak = () => {
    if (!breakStart) return;
    setBreaks((prev) => [...prev, { id: uuid(), label: breakLabel.trim(), start: breakStart, end: breakEnd || breakStart }]);
    setBreakLabel('');
    setBreakStart('');
    setBreakEnd('');
  };

  const removeBreak = (id: string) => setBreaks((prev) => prev.filter((b) => b.id !== id));

  // Step 1 — PowerSchool
  const [psUrl, setPsUrl] = useState('');
  const [psUser, setPsUser] = useState('');
  const [psPass, setPsPass] = useState('');
  const [showPsPass, setShowPsPass] = useState(false);
  const [psLog, setPsLog] = useState<string[]>([]);
  // Separate from `busy` (which also covers School Info's save) so the
  // button can say "Verifying…" specifically while the fast login-only
  // check is in flight, before the (slower, background) sync even starts.
  const [verifying, setVerifying] = useState(false);
  // Confirmation sub-view shown when "Skip" is clicked on the PowerSchool
  // step — the user sees exactly what they're giving up before it's final.
  const [confirmSkipPs, setConfirmSkipPs] = useState(false);
  // Tracks whether the user actually declined PowerSchool (vs. connected
  // it) so the Done step can offer the manual/Lathrop path only when it's
  // actually relevant.
  const [declinedPowerSchool, setDeclinedPowerSchool] = useState(false);
  // True once THIS wizard run has kicked off a background sync — gates the
  // Done step's live status banner so it doesn't show some unrelated
  // previous sync's leftover status after a user who declined PowerSchool.
  const [syncStarted, setSyncStarted] = useState(false);
  // Matches the server-side default set at registration (see /api/auth's
  // 'register' action) until the mandatory Bell Schedule step below saves
  // the user's actual choice — this only backs the Done step's own
  // "enable now" nudge for someone who declined PowerSchool.
  const [manualLathropEnabled, setManualLathropEnabled] = useState(true);
  // The mandatory Bell Schedule step's answer — null until the user actually
  // picks one, which is what makes Next stay disabled until they do. Unlike
  // manualLathropEnabled above (which only ever surfaced for someone who
  // declined PowerSchool), this step runs for every setup, regardless of
  // whether PowerSchool gets connected.
  const [lathropChoice, setLathropChoice] = useState<boolean | null>(null);
  const [savingLathropChoice, setSavingLathropChoice] = useState(false);

  // Live status of the background sync kicked off below — the same
  // subscribable store the Settings/Grades pages and the sidebar's
  // "Syncing PowerSchool…" indicator use, so the Done step's banner reflects
  // reality even if the sync is still running (or finishes) after the wizard
  // itself has been sitting on this step for a while.
  const psStatus = usePowerSchoolSyncStatus();

  // ---- actions ----

  const saveSchoolInfo = async () => {
    setError('');
    setBusy(true);
    try {
      const settings: Record<string, string> = { schoolName, timezone };
      for (const [key, value] of Object.entries(settings)) {
        if (!value) continue;
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      // Each break the user added becomes a "No School" disruption spanning
      // its date range — the mechanism that marks school as NOT in session,
      // since there's no semester boundary to set instead.
      for (const b of breaks) {
        await fetch('/api/disruptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: b.id,
            date: b.start,
            endDate: b.end !== b.start ? b.end : undefined,
            type: 'no_school',
            label: b.label,
            periodOverrides: [],
          }),
        }).catch(() => {});
      }
      setStep(4);
    } catch {
      setError('Failed to save school info.');
    }
    setBusy(false);
  };

  // Two-phase: first a fast, login-only check (catches a mistyped username/
  // password in a few seconds), THEN — only once that's confirmed — save the
  // credentials and kick off the real sync as a background job the flow
  // does NOT wait on, advancing to School Info right away. Previously this
  // awaited the full scrape (classes + every assignment) before letting the
  // user continue, which both blocked the wizard for however long that took
  // AND meant a wrong password wasn't caught until that entire wait was over.
  const verifyAndContinue = async () => {
    setError('');
    setPsLog([]);
    setVerifying(true);
    setBusy(true);
    try {
      const verifyRes = await fetch('/api/powerschool/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: psUrl, username: psUser, password: psPass }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (verifyData.log) setPsLog(verifyData.log);
      if (!verifyRes.ok || !verifyData.ok) {
        setError(verifyData.error || 'Could not log in to PowerSchool — check your URL, username, and password.');
        setVerifying(false);
        setBusy(false);
        return;
      }
      setVerifying(false);

      // Credentials are good — save them, then fire the sync and move on
      // without waiting for it. It keeps running server-side (see
      // src/lib/powerschoolSync.ts's after()-based runner) regardless of
      // which wizard step the user is on or whether they close the tab.
      await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-powerschool', url: psUrl, username: psUser, password: psPass }),
      });
      const syncRes = await fetch('/api/powerschool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: psUrl, username: psUser, password: psPass }),
      });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok || syncData.success === false) {
        setError(syncData.error || 'Verified, but could not start the sync. You can retry from Settings.');
        setBusy(false);
        return;
      }
      setSyncStarted(true);
      setDeclinedPowerSchool(false);
      // Nudges the shared status store to poll right away instead of waiting
      // for its own cadence, so the Done step's live banner (and the
      // sidebar's "Syncing PowerSchool…" indicator) reflect "running"
      // immediately rather than a stale "idle" for a few seconds.
      pokePowerSchoolStatus();
      // A successful connection is exactly the case where scheduled sync is
      // most worth defaulting to on — the user just proved their
      // credentials work, so keeping data fresh going forward shouldn't need
      // a second trip to Settings. utcHour matches the same default the
      // Settings page's own picker starts from; easy to change there.
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'powerschoolAutoSync', value: { enabled: true, utcHour: 12 } }),
      }).catch(() => {});
      setStep(3);
    } catch (e) {
      setError(`Connection error: ${(e as Error).message}`);
    }
    setVerifying(false);
    setBusy(false);
  };

  // Same "X added, Y updated" phrasing the Settings page's own sync-outcome
  // handler uses, applied here to the shared status store's `result` instead
  // of a one-off fetch response.
  const syncResultSummary = (result: Record<string, unknown> | null): string => {
    if (!result) return 'Sync complete — no changes.';
    const parts: string[] = [];
    const classAdded = Number(result.classAdded) || 0;
    const classUpdated = Number(result.classUpdated) || 0;
    const classRemoved = Number(result.classRemoved) || 0;
    const assignmentCount = Number(result.assignmentCount) || 0;
    if (classAdded) parts.push(`${classAdded} classes added`);
    if (classUpdated) parts.push(`${classUpdated} updated`);
    if (classRemoved) parts.push(`${classRemoved} removed`);
    if (assignmentCount) parts.push(`${assignmentCount} assignments synced`);
    return parts.length > 0 ? parts.join(', ') : 'Sync complete — no changes.';
  };

  // Confirms the mandatory Bell Schedule step's choice and saves it — this is
  // the one place that actually persists the user's real decision, rather
  // than leaving the server-side registration default (on) in place unless
  // they happen to visit Settings or decline PowerSchool later.
  const confirmLathropChoice = async () => {
    if (lathropChoice === null) return;
    setSavingLathropChoice(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'lathropMode', value: lathropChoice }),
      });
      setManualLathropEnabled(lathropChoice);
      setStep(2);
    } catch {
      setError('Failed to save your Bell Schedule choice.');
    }
    setSavingLathropChoice(false);
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
    if (step === 1) { confirmLathropChoice(); return; }
    if (step === 2) {
      if (confirmSkipPs) { setDeclinedPowerSchool(true); setConfirmSkipPs(false); setStep(3); }
      else verifyAndContinue();
      return;
    }
    if (step === 3) { saveSchoolInfo(); return; }
    handleClose(); // step === 4
  };
  const primaryEnabled =
    step === 0 ? true :
    step === 1 ? (lathropChoice !== null && !savingLathropChoice) :
    step === 2 ? (confirmSkipPs ? true : (!!canSyncPS && !busy)) :
    step === 3 ? !busy :
    true; // step === 4

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
                  Your data is securely stored and synced across all your devices. We&apos;ll start by connecting PowerSchool (it does most of the setup for you), then fill in a few school details.
                </Typography>
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

          {/* ===== STEP 1: Bell Schedule (Lathrop Mode) ===== */}
          {step === 1 && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="h6" gutterBottom>Bell Schedule</Typography>
                <Typography variant="body2" color="text.secondary">
                  If your school follows Lathrop High School&apos;s bell schedule, Canopy can fill in each class&apos;s period times automatically — after every PowerSchool sync, and with a one-click button when setting up classes manually. Otherwise, you&apos;ll set your own period times from the Classes/Settings pages.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1.5}>
                <Button
                  fullWidth
                  variant={lathropChoice === true ? 'contained' : 'outlined'}
                  size="large"
                  startIcon={lathropChoice === true ? <CheckCircleIcon /> : undefined}
                  onClick={() => setLathropChoice(true)}
                >
                  Use Lathrop Mode
                </Button>
                <Button
                  fullWidth
                  variant={lathropChoice === false ? 'contained' : 'outlined'}
                  size="large"
                  startIcon={lathropChoice === false ? <CheckCircleIcon /> : undefined}
                  onClick={() => setLathropChoice(false)}
                >
                  My school is different
                </Button>
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(0)} disabled={savingLathropChoice}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  sx={{ flex: 1 }}
                  endIcon={savingLathropChoice ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardIcon />}
                  onClick={confirmLathropChoice}
                  disabled={lathropChoice === null || savingLathropChoice}
                >
                  Continue
                </Button>
              </Stack>
            </Stack>
          )}

          {/* ===== STEP 2: PowerSchool ===== */}
          {step === 2 && (
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
                        <Typography variant="body2">Login log ({psLog.length} entries)</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        {/* overflow (both axes, not just Y) + wordBreak — a
                            raw scraper log line can contain a long unbroken
                            URL with no wrap point, which on a fullScreen
                            mobile dialog would otherwise push this wider
                            than the viewport instead of just scrolling. */}
                        <Box sx={{ fontSize: '0.72rem', maxHeight: 160, overflow: 'auto', wordBreak: 'break-all', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
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
                        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <VerifiedIcon />}
                        onClick={verifyAndContinue}
                        disabled={!canSyncPS || busy}
                      >
                        {verifying ? 'Verifying…' : busy ? 'Starting sync…' : 'Verify & Continue'}
                      </Button>
                      <Stack direction="row" spacing={1.5}>
                        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(1)} disabled={busy} sx={{ flex: 1 }}>
                          Back
                        </Button>
                        <Button variant="outlined" onClick={() => setConfirmSkipPs(true)} disabled={busy} sx={{ flex: 1 }}>
                          Skip
                        </Button>
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
                        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <VerifiedIcon />}
                        onClick={verifyAndContinue}
                        disabled={!canSyncPS || busy}
                      >
                        {verifying ? 'Verifying…' : busy ? 'Starting sync…' : 'Verify & Continue'}
                      </Button>
                      <Button variant="outlined" onClick={() => setConfirmSkipPs(true)} disabled={busy}>
                        Skip
                      </Button>
                    </Stack>
                  )}

                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center' }}>
                    Canopy is an independent, unofficial tool and isn&apos;t affiliated with or endorsed by PowerSchool. You connect your account at your own risk — use of your credentials here is your own responsibility.
                  </Typography>
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
                      onClick={() => { setDeclinedPowerSchool(true); setConfirmSkipPs(false); setStep(3); }}
                    >
                      Continue without PowerSchool
                    </Button>
                  </Stack>
                </>
              )}
            </Stack>
          )}

          {/* ===== STEP 3: School Info ===== */}
          {step === 3 && (
            <Stack spacing={2.5}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <SchoolIcon color="primary" />
                  <Typography variant="h6">School Information</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  These settings sync across all your devices automatically. Every field below already has a sensible default — change only what you need to.
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

              <TimezonePicker
                value={timezone}
                onChange={setTimezone}
                label="Your timezone"
                size="medium"
                helperText="Used for calendar feed and schedule display"
              />

              <Alert severity="info" sx={{ py: 0.5 }}>
                Canopy treats school as in session every day, all year — there&apos;s no semester range to set. Add any breaks below (optional) and they&apos;ll be skipped automatically; you can add more anytime from the Schedule page.
              </Alert>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>School Breaks (optional)</Typography>
                {breaks.length > 0 && (
                  <Stack spacing={1} sx={{ mb: 1.5 }}>
                    {breaks.map((b) => (
                      <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'action.hover' }}>
                        <EventBusyIcon fontSize="small" color="disabled" />
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {b.label || 'No School'} — {dayjs(b.start).format('MMM D')}{b.end !== b.start ? ` – ${dayjs(b.end).format('MMM D')}` : ''}
                        </Typography>
                        <IconButton size="small" onClick={() => removeBreak(b.id)} aria-label={`Remove ${b.label || 'break'}`}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Label"
                    value={breakLabel}
                    onChange={(e) => setBreakLabel(e.target.value)}
                    placeholder="e.g. Summer Break"
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Start"
                    type="date"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="End"
                    type="date"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Button variant="outlined" onClick={addBreak} disabled={!breakStart} sx={{ flexShrink: 0 }}>
                    Add
                  </Button>
                </Stack>
              </Box>

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
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(2)} disabled={busy} sx={{ flex: 1 }}>
                      Back
                    </Button>
                    {!required && (
                      <Button variant="outlined" onClick={() => setStep(4)} disabled={busy} sx={{ flex: 1 }}>
                        Skip
                      </Button>
                    )}
                  </Stack>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1.5}>
                  <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(2)} disabled={busy}>
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
                    <Button variant="outlined" onClick={() => setStep(4)} disabled={busy}>
                      Skip
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          )}

          {/* ===== STEP 4: Done ===== */}
          {step === 4 && (
            <Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
              <Typography variant="h5" sx={{ fontWeight: 600 }}>You&apos;re all set!</Typography>

              {/* Live PowerSchool sync status — the clear "still working in
                  the background" indication the Done step needs, since the
                  sync itself was kicked off back on the PowerSchool step and
                  keeps running independently of which step the wizard is on
                  now (or even whether it's still open at all). */}
              {syncStarted && (
                <Alert
                  severity={psStatus.status === 'error' ? 'error' : psStatus.status === 'success' ? 'success' : 'info'}
                  icon={psStatus.status === 'running' || psStatus.status === 'idle' ? <CircularProgress size={18} /> : undefined}
                  sx={{ width: '100%', textAlign: 'left' }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {psStatus.status === 'success'
                      ? 'PowerSchool sync complete'
                      : psStatus.status === 'error'
                      ? 'PowerSchool sync failed'
                      : 'Canopy is syncing with PowerSchool…'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {psStatus.status === 'success' && syncResultSummary(psStatus.result)}
                    {psStatus.status === 'error' && (psStatus.error || 'You can retry anytime from Settings.')}
                    {(psStatus.status === 'running' || psStatus.status === 'idle') &&
                      "Running in the background — this can take a minute or two. Feel free to head to the Dashboard now; it'll keep going, and you can check progress anytime from Settings."}
                  </Typography>
                </Alert>
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
                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(3)}>
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
