'use client';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { SHORTCUT_GROUPS } from '@/lib/keyboardShortcuts';

interface Props {
  open: boolean;
  onClose: () => void;
}

function KeyCap({ label }: { label: string }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 24,
        height: 24,
        px: 0.75,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
        fontFamily: 'inherit',
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      {label}
    </Box>
  );
}

export default function KeyboardShortcutsModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <KeyboardIcon color="primary" />
        <Box sx={{ flex: 1 }}>Keyboard Shortcuts</Box>
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          {SHORTCUT_GROUPS.map((group) => (
            <Box key={group.title}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                {group.title}
              </Typography>
              <Stack spacing={1} sx={{ mt: 0.5 }}>
                {group.items.map((item, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2">{item.description}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
                      {item.keys.map((k, ki) => (
                        <Box key={ki} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {ki > 0 && k !== 'then' && (
                            <Typography variant="caption" color="text.disabled">+</Typography>
                          )}
                          {k === 'then' ? (
                            <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>then</Typography>
                          ) : (
                            <KeyCap label={k} />
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
              <Divider sx={{ mt: 2 }} />
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          These are additive — every action in Canopy still works with a mouse or touch.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
