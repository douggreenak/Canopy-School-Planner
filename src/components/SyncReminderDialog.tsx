'use client';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import SyncIcon from '@mui/icons-material/Sync';
import { useEnterConfirm } from '@/lib/hooks';

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
 */
export default function SyncReminderDialog({ open, onClose, onConfirm }: Props) {
  const confirm = () => {
    onClose();
    onConfirm();
  };

  return (
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
        <DialogContentText sx={{ mt: 1.5 }}>
          You can check or change the automatic sync schedule in <strong>Settings → PowerSchool Import → Scheduled Sync</strong>.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={confirm} startIcon={<SyncIcon />}>
          Sync Now
        </Button>
      </DialogActions>
    </Dialog>
  );
}
