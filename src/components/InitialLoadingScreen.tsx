import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Image from 'next/image';

export default function InitialLoadingScreen() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Image src="/favicon.svg" alt="" width={36} height={36} loading="eager" unoptimized />
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '-0.3px' }}>
          Canopy
        </Typography>
      </Box>
      <CircularProgress size={24} aria-label="Checking your session" />
      <Typography variant="body2" color="text.secondary">
        Loading your planner…
      </Typography>
    </Box>
  );
}
