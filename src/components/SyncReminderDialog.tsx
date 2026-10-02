'use client';
import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import SyncIcon from '@mui/icons-material/Sync';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useEnterConfirm, useSettings, apiPost } from '@/lib/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation shown before a MANUAL "Sync Now"/"Sync" click, from all three
 * places one can be triggered (Settings' PowerSchool Import section, the
 * Grades page, and a Grade Detail page) — a shared component so the wording
 * can't drift between them. Canopy already syncs with PowerSchool
 * automatically (see the Scheduled Sync toggle in Settings), so a manual
 * sync is only actually useful right after grades were just updated in
 * PowerSchool and the user doesn't want to wait for the next automatic run —
 * this exists to say that up front rather than leave people habitually
 * clicking Sync Now every time they open the app.
 *
 * Also surfaces the Scheduled Sync toggle itself (self-contained — it reads
 * and writes the `powerschoolAutoSync` setting directly, same as Settings'
 * own copy of this toggle) so someone who's here specifically because they
 * forgot scheduled sync was running can see/change it without navigating
 * away. Scheduled sync is opt-out, so turning it off asks for confirmation;
 * turning it on does not.
 */
export default function SyncReminderDialog({ open, onClose, onConfirm }: Props) {
  const { data: settings, mutate } = useSettings();
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    if (!settings?.powerschoolAutoSync) return;
    try {
      const raw = settings.powerschoolAutoSync;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      setAutoSyncEnabled(!!parsed.enabled);
    } catch {
      // ignore malformed stored value — keep the optimistic default
    }
  }, [settings?.powerschoolAutoSync]);

  const saveAutoSync = async (enabled: boolean) => {
    const previous = autoSyncEnabled;
    setAutoSyncEnabled(enabled);
    try {
      await apiPost('/api/settings', { key: 'powerschoolAutoSync', value: { enabled } });
      mutate({ ...settings, powerschoolAutoSync: { enabled } });
    } catch {
      setAutoSyncEnabled(previous);
    }
  };

  const handleToggle = (checked: boolean) => {
    if (checked) { saveAutoSync(true); return; }
    setConfirmDisable(true);
  };

  const confirm = () => {
    onClose();
    onConfirm();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        onKeyDown={useEnterConfirm(open, confirm)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SyncIcon color="primary" fontSize="small" /> Heads up
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Canopy already syncs with PowerSchool automatically once a day, so this is really only worth doing if grades were just updated in PowerSchool and you don&apos;t want to wait for the next automatic sync.
          </DialogContentText>

          <Divider sx={{ my: 2 }} />

          <FormControlLabel
            control={<Switch checked={autoSyncEnabled} onChange={(e) => handleToggle(e.target.checked)} size="small" />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ScheduleIcon sx={{ fontSize: 16 }} /> Scheduled Sync
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Automatically sync PowerSchool once a day. Changes here save immediately.
                </Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.25 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={confirm} startIcon={<SyncIcon />}>
            Sync Now
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Turn off scheduled sync?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Canopy will stop automatically checking PowerSchool for new grades and assignments once a day. You can still sync manually, and you can turn this back on anytime.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDisable(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { setConfirmDisable(false); saveAutoSync(false); }}>
            Turn Off
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
