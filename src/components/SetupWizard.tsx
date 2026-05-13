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
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import SchoolIcon from '@mui/icons-material/School';
import StorageIcon from '@mui/icons-material/Storage';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const STEPS = ['Welcome', 'Google Sheets', 'School Info', 'PowerSchool', 'Done'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SetupWizard({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Step 0 — paste config
  const [pastedConfig, setPastedConfig] = useState('');
  const [showPasted, setShowPasted] = useState(false);

  // Step 1 — Google Sheets
  const [serviceEmail, setServiceEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');

  // Step 2 — school info
  const [schoolName, setSchoolName] = useState('');
  const [semesterStart, setSemesterStart] = useState('');
  const [semesterEnd, setSemesterEnd] = useState('');

  // Step 3 — PowerSchool
  const [psUrl, setPsUrl] = useState('');
  const [psUser, setPsUser] = useState('');
  const [psPass, setPsPass] = useState('');
  const [showPsPass, setShowPsPass] = useState(false);
  const [psSynced, setPsSynced] = useState(false);
  const [psLog, setPsLog] = useState<string[]>([]);
  const [psSummary, setPsSummary] = useState('');

  // ---- actions ----

  const applyPastedConfig = async () => {
    setError('');
    setBusy(true);
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(pastedConfig.trim());
    } catch {
      setError('Invalid JSON — check the pasted text and try again.');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import-config', config: parsed }),
      });
      const data = await res.json();
      if (data.success) {
        setSpreadsheetTitle(data.spreadsheetTitle || '');
        setSheetsConnected(true);
        if (parsed.powerschoolUrl) {
          setPsUrl(parsed.powerschoolUrl);
          setPsUser(parsed.powerschoolUsername || '');
        }
        setSuccessMsg(data.message || 'All credentials applied and connected!');
        setStep(4); // jump to done
      } else {
        setError(data.hint || data.error || 'Failed to apply config.');
      }
    } catch {
      setError('Network error while applying config.');
    }
    setBusy(false);
  };

  const saveCredentials = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-credentials',
          serviceAccountEmail: serviceEmail,
          privateKey,
          spreadsheetId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSheetsConnected(true);
        setSpreadsheetTitle(data.spreadsheetTitle || '');
        setStep(2);
      } else {
        setError(data.hint || data.error || 'Connection failed. Check your credentials.');
      }
    } catch {
      setError('Network error saving credentials.');
    }
    setBusy(false);
  };

  const saveSchoolInfo = async () => {
    setError('');
    setBusy(true);
    try {
      const settings: Record<string, string> = { schoolName, semesterStart, semesterEnd };
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
      // Save credentials first
      await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-powerschool', url: psUrl, username: psUser, password: psPass }),
      });
      // Run sync
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
        setStep(4);
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

  // ---- render helpers ----

  const canSaveSheets = serviceEmail.trim() && privateKey.trim() && spreadsheetId.trim();
  const canSyncPS = psUrl.trim() && psUser.trim() && psPass.trim();

  return (
    <Dialog open={open} maxWidth="sm" fullWidth sx={{ '& .MuiDialog-paper': { borderRadius: 3 } }}>
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', px: 3, pt: 3, pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <SchoolIcon sx={{ fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Setup Wizard
            </Typography>
          </Box>
          <Stepper activeStep={step} alternativeLabel sx={{ '& .MuiStepLabel-label': { color: 'primary.contrastText', opacity: 0.7 }, '& .MuiStepLabel-label.Mui-active': { opacity: 1, fontWeight: 600 }, '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.3)' }, '& .MuiStepIcon-root.Mui-active': { color: 'white' }, '& .MuiStepIcon-root.Mui-completed': { color: 'rgba(255,255,255,0.8)' }, '& .MuiStepConnector-line': { borderColor: 'rgba(255,255,255,0.3)' } }}>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Body */}
        <Box sx={{ px: 3, py: 3 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

          {/* ===== STEP 0: Welcome + Paste Config ===== */}
          {step === 0 && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="h6" gutterBottom>Welcome to School Planner!</Typography>
                <Typography variant="body2" color="text.secondary">
                  This wizard will connect your Google Sheet (where all your data is stored), add your school info, and optionally import your schedule from PowerSchool. It takes about 5 minutes.
                </Typography>
              </Box>

              <Divider>
                <Chip label="Already set up on another device?" size="small" />
              </Divider>

              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ContentPasteIcon fontSize="small" /> Paste Config (fastest)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  If you already have this app running somewhere else, go to <strong>Settings → Copy Config</strong> on that device, then paste the JSON here. This imports all credentials in one shot.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <TextField
                    fullWidth
                    label="Config JSON"
                    value={pastedConfig}
                    onChange={(e) => { setPastedConfig(e.target.value); setError(''); }}
                    placeholder='{ "serviceAccountEmail": "...", "privateKey": "...", ... }'
                    multiline={showPasted}
                    rows={showPasted ? 4 : 1}
                    type={showPasted ? 'text' : 'password'}
                    slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.8rem' } } }}
                  />
                  <IconButton onClick={() => setShowPasted((v) => !v)} sx={{ mt: 1 }}>
                    {showPasted ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </Box>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  sx={{ mt: 1.5 }}
                  startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <ContentPasteIcon />}
                  onClick={applyPastedConfig}
                  disabled={!pastedConfig.trim() || busy}
                >
                  Apply Config &amp; Connect
                </Button>
              </Box>

              <Divider>
                <Chip label="Or start fresh" size="small" />
              </Divider>

              <Button
                variant="outlined"
                size="large"
                fullWidth
                endIcon={<ArrowForwardIcon />}
                onClick={() => setStep(1)}
              >
                Set Up Manually
              </Button>

              <Button size="small" color="inherit" sx={{ color: 'text.disabled' }} onClick={handleClose}>
                Skip for now — I&apos;ll set up in Settings
              </Button>
            </Stack>
          )}

          {/* ===== STEP 1: Google Sheets ===== */}
          {step === 1 && (
            <Stack spacing={2.5}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <StorageIcon color="primary" />
                  <Typography variant="h6">Connect Google Sheets</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  All your data — classes, homework, grades, exams — lives in a Google Sheet that you own. This keeps your data private and syncs across all your devices automatically.
                </Typography>
              </Box>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">How to create a Service Account (one-time, ~3 min)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1.5}>
                    <Alert severity="info" sx={{ fontSize: '0.82rem' }}>
                      A service account is a special Google account that this app uses to read and write your Sheet without you having to log in every time.
                    </Alert>
                    <Typography variant="body2">
                      1. Open{' '}
                      <Link href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" sx={{ fontWeight: 600 }}>
                        Google Cloud Console → Credentials <OpenInNewIcon sx={{ fontSize: 13, verticalAlign: 'middle' }} />
                      </Link>
                    </Typography>
                    <Typography variant="body2">
                      2. Click <strong>"Create Project"</strong>, name it "School Planner", click <strong>Create</strong>.
                    </Typography>
                    <Typography variant="body2">
                      3. Go to <strong>"Enabled APIs &amp; Services" → "+ ENABLE APIS"</strong>, search for <strong>"Google Sheets API"</strong>, and enable it.
                    </Typography>
                    <Typography variant="body2">
                      4. Go to{' '}
                      <Link href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener" sx={{ fontWeight: 600 }}>
                        Service Accounts <OpenInNewIcon sx={{ fontSize: 13, verticalAlign: 'middle' }} />
                      </Link>{' '}
                      → <strong>"+ CREATE SERVICE ACCOUNT"</strong>. Name it anything. Click <strong>Done</strong>.
                    </Typography>
                    <Typography variant="body2">
                      5. Click the new service account → <strong>"Keys" tab → "Add Key" → "Create new key" → JSON</strong>. A <code>.json</code> file downloads — open it.
                    </Typography>
                    <Typography variant="body2">
                      6. Copy <code>client_email</code> and <code>private_key</code> from that file into the fields below.
                    </Typography>
                    <Divider />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Then create and share your Sheet:</Typography>
                    <Typography variant="body2">
                      1.{' '}
                      <Link href="https://sheets.new" target="_blank" rel="noopener" sx={{ fontWeight: 600 }}>
                        Create a new Google Sheet <OpenInNewIcon sx={{ fontSize: 13, verticalAlign: 'middle' }} />
                      </Link>{' '}
                      (name it "School Planner Data").
                    </Typography>
                    <Typography variant="body2">
                      2. Click <strong>Share</strong>, add the service account email as <strong>Editor</strong>.
                    </Typography>
                    <Typography variant="body2">
                      3. Copy the Spreadsheet ID from the URL (the long string between <code>/d/</code> and <code>/edit</code>).
                    </Typography>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              <TextField
                fullWidth
                label="Service Account Email"
                value={serviceEmail}
                onChange={(e) => { setServiceEmail(e.target.value); setError(''); }}
                placeholder="example@project-id.iam.gserviceaccount.com"
                helperText='The "client_email" field from your downloaded JSON key file'
                autoComplete="off"
              />

              <TextField
                fullWidth
                label="Private Key"
                value={privateKey}
                onChange={(e) => { setPrivateKey(e.target.value); setError(''); }}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
                multiline={showKey}
                rows={showKey ? 3 : 1}
                type={showKey ? 'text' : 'password'}
                helperText='The "private_key" field — include the full -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines'
                autoComplete="off"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowKey((v) => !v)}>
                          {showKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <TextField
                fullWidth
                label="Google Spreadsheet ID"
                value={spreadsheetId}
                onChange={(e) => { setSpreadsheetId(e.target.value.trim()); setError(''); }}
                placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                helperText="The long ID from your Sheet's URL — between /d/ and /edit"
              />

              {sheetsConnected && (
                <Alert severity="success" icon={<CheckCircleIcon />}>
                  Connected to &quot;{spreadsheetTitle}&quot; — all data tabs are ready!
                </Alert>
              )}

              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  size="large"
                  sx={{ flex: 1 }}
                  startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
                  onClick={saveCredentials}
                  disabled={!canSaveSheets || busy}
                >
                  Connect &amp; Continue
                </Button>
                <Button variant="outlined" onClick={() => setStep(0)} disabled={busy}>
                  Back
                </Button>
              </Stack>
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
                  These settings are stored in your Google Sheet so they sync automatically across all your devices. You can update them any time in Settings.
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

              <Stack direction="row" spacing={1.5}>
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
                <Button
                  variant="outlined"
                  startIcon={<SkipNextIcon />}
                  onClick={() => setStep(3)}
                  disabled={busy}
                >
                  Skip
                </Button>
              </Stack>
            </Stack>
          )}

          {/* ===== STEP 3: PowerSchool ===== */}
          {step === 3 && (
            <Stack spacing={2.5}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <SyncIcon color="primary" />
                  <Typography variant="h6">PowerSchool Import</Typography>
                  <Chip label="Optional" size="small" variant="outlined" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Import your class schedule, assignments, and current grades directly from PowerSchool. Your credentials are saved securely on the server so future syncs need just one click.
                </Typography>
              </Box>

              <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
                <strong>Requires Google Chrome</strong> to be installed on the computer running this app. PowerSchool uses Chromium to log in and extract your data.
              </Alert>

              <TextField
                fullWidth
                label="PowerSchool URL"
                value={psUrl}
                onChange={(e) => { setPsUrl(e.target.value); setError(''); }}
                placeholder="https://your-school.powerschool.com"
                helperText="Any URL from your school's PowerSchool portal — the app will use just the domain"
              />

              <Stack direction="row" spacing={2}>
                <TextField
                  fullWidth
                  label="Student Username"
                  value={psUser}
                  onChange={(e) => { setPsUser(e.target.value); setError(''); }}
                  helperText="Your student login (e.g. s123456)"
                  autoComplete="off"
                />
                <TextField
                  fullWidth
                  label="Student Password"
                  type={showPsPass ? 'text' : 'password'}
                  value={psPass}
                  onChange={(e) => { setPsPass(e.target.value); setError(''); }}
                  helperText="Stored encrypted on the server after sync"
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
                    <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem', maxHeight: 160, overflowY: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                      {psLog.map((line, i) => <div key={i}>{line}</div>)}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )}

              <Stack direction="row" spacing={1.5}>
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
                <Button
                  variant="outlined"
                  startIcon={<SkipNextIcon />}
                  onClick={() => setStep(4)}
                  disabled={busy}
                >
                  Skip
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                You can always sync PowerSchool later from the Settings page.
              </Typography>
            </Stack>
          )}

          {/* ===== STEP 4: Done ===== */}
          {step === 4 && (
            <Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                You&apos;re all set!
              </Typography>

              {successMsg && (
                <Alert severity="success" sx={{ width: '100%', textAlign: 'left' }}>{successMsg}</Alert>
              )}

              {sheetsConnected && !successMsg && (
                <Alert severity="success" sx={{ width: '100%', textAlign: 'left' }}>
                  {spreadsheetTitle ? `Connected to "${spreadsheetTitle}"` : 'Google Sheets connected and ready.'}
                </Alert>
              )}

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
                    <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem', maxHeight: 160, overflowY: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1, textAlign: 'left' }}>
                      {psLog.map((line, i) => <div key={i}>{line}</div>)}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )}

              <Typography variant="body2" color="text.secondary">
                Head to the <strong>Dashboard</strong> to see your schedule, or visit <strong>Settings</strong> to configure additional integrations like Google Classroom or the iCal feed.
              </Typography>

              <Button
                variant="contained"
                size="large"
                fullWidth
                endIcon={<ArrowForwardIcon />}
                onClick={handleClose}
              >
                Go to Dashboard
              </Button>
            </Stack>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
