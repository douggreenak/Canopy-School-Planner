import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import ThemeRegistry from '@/components/ThemeRegistry';
import AppShell from '@/components/AppShell';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Canopy',
  description: 'Your personal school planner — classes, schedule, grades, homework, and tasks in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <ThemeRegistry>
            <AppShell>{children}</AppShell>
          </ThemeRegistry>
        </AppRouterCacheProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
