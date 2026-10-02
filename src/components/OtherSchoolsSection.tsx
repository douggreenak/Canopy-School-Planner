'use client';
import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SchoolIcon from '@mui/icons-material/School';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import CircularProgress from '@mui/material/CircularProgress';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SyncIcon from '@mui/icons-material/Sync';
import { useFetch, apiPost, apiDelete } from '@/lib/hooks';

interface SchoolAccountSummary {
  id: string;
  schoolName: string;
  url: string;
  username: string;
}

function useSchoolAccounts() {
  return useFetch<SchoolAccountSummary[]>('/api/powerschool/schools');
}

// Secondary to the primary PowerSchool login above it — only has content
// once a user actually adds a school here, so a single-school user sees an
// empty, low-key "+ Add another school" affordance and nothing else changes
// about their experience.
export default function OtherSchoolsSection() {
  const { data: accounts, loading, refetch } = useSchoolAccounts();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ schoolName: '', url: '', username: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SchoolAccountSummary | null>(null);

  const resetForm = () => setForm({ schoolName: '', url: '', username: '', password: '' });

  const handleAdd = async () => {
    if (!form.schoolName || !form.url || !form.username || !form.password) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost('/api/powerschool/schools', form);
      setAddOpen(false);
      resetForm();
      refetch();
    } catch {
      setError('Could not save this school. Check the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      await apiPost('/api/powerschool/schools', { action: 'sync', id });
      // The scrape runs in the background (same pattern as the primary
      // sync) — there's no fine-grained status to poll for a secondary
      // school, so just give it a reasonable window before refetching.
      setTimeout(() => { refetch(); setSyncingId(null); }, 15000);
    } catch {
      setSyncingId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await apiDelete(`/api/powerschool/schools?id=${confirmDelete.id}`);
    setConfirmDelete(null);
    refetch();
  };

  return (
    <Accordion disableGutters sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SchoolIcon color="primary" />
          <Typography variant="h6">Other Schools</Typography>
          <Chip label="Optional" size="small" variant="outlined" />
          {accounts && accounts.length > 0 && (
            <Chip label={accounts.length} size="small" color="primary" />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          If you take classes at more than one school — each with its own PowerSchool login — add the extra ones here. Your main PowerSchool login above is unaffected.
        </Typography>

        {!loading && accounts && accounts.length > 0 && (
          <List dense sx={{ mb: 2 }}>
            {accounts.map((a) => (
              <ListItem
                key={a.id}
                disableGutters
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => handleSync(a.id)} disabled={syncingId === a.id} title="Sync now">
                      {syncingId === a.id ? <CircularProgress size={18} /> : <SyncIcon fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => setConfirmDelete(a)} title="Remove">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText primary={a.schoolName} secondary={a.username} />
              </ListItem>
            ))}
          </List>
        )}

        <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={() => setAddOpen(true)}>
          Add Another School
        </Button>
      </AccordionDetails>

      <Dialog open={addOpen} onClose={() => { setAddOpen(false); resetForm(); setError(''); }} maxWidth="xs" fullWidth>
        <DialogTitle>Add a School</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField fullWidth label="School Name" value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} placeholder="e.g. Lathrop High School" />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="PowerSchool URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-school.powerschool.com" />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Student Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth type="password" label="Student Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Grid>
            {error && <Grid size={12}><Typography color="error.main" variant="body2">{error}</Typography></Grid>}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddOpen(false); resetForm(); setError(''); }}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={saving}>
            {saving ? 'Saving…' : 'Add School'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove {confirmDelete?.schoolName}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This stops syncing that school. Classes already imported from it stay in your roster — you can delete them individually from the Classes page if you want them gone too.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Accordion>
  );
}
