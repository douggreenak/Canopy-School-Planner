import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import ThemeRegistry from '@/components/ThemeRegistry';
import AppShell from '@/components/AppShell';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { getServerSessionUser } from '@/lib/auth';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Canopy',
  description: 'Your personal school planner — classes, schedule, grades, homework, and tasks in one place.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the session server-side so AppShell can paint the real page on
  // the very first render instead of a blank screen while a client-side
  // fetch('/api/auth') round-trip resolves. Defensive try/catch: on a fresh
  // deploy the `sessions` table may not exist yet (created lazily by
  // initializeDatabase() on first API call) — fall back to "logged out"
  // rather than failing the whole page.
  let initialUser: { id: string; username: string; role: string } | null = null;
  try {
    initialUser = await getServerSessionUser();
  } catch {
    initialUser = null;
  }

  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <ThemeRegistry>
            <AppShell initialUser={initialUser}>{children}</AppShell>
          </ThemeRegistry>
        </AppRouterCacheProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
