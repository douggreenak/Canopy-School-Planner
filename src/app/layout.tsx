import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import ThemeRegistry from '@/components/ThemeRegistry';
import AppShell from '@/components/AppShell';
import { SpeedInsights } from '@vercel/speed-insights/next';

// "Google Sans" itself isn't available for general web embedding — Roboto is
// what Google's own web apps (Classroom, Calendar, Workspace) actually ship.
// The theme's typography previously just NAMED "Google Sans"/"Roboto" in its
// font stack without ever loading either, so it silently fell back to plain
// Arial everywhere — self-hosted via next/font (no external request, no
// layout shift) so the app actually renders in a real Google-style typeface.
const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
});

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

// Deliberately a plain synchronous component — NOT async, no cookies()/DB
// call here. A previous version resolved the session server-side to avoid
// a blank first paint, but since this is the ROOT layout (wrapping every
// route), any dynamic API call in it forces the whole app out of the
// Router Cache: every client-side navigation — not just the first load —
// had to hit the server fresh, which is what caused the sidebar's active-
// tab highlight to visibly lag behind the click. AppShell resolves the
// session client-side instead; see its comment for the tradeoff.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={roboto.variable}>
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
