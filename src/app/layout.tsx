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
  // Matches the manifest's theme_color (the default "Canopy" preset's
  // primary) — colors the iOS status bar / Android task-switcher chrome once
  // installed as a standalone app.
  themeColor: '#2E7D32',
};

export const metadata: Metadata = {
  title: 'Canopy',
  description: 'Your personal school planner — classes, schedule, grades, homework, and tasks in one place.',
  // `manifest` isn't strictly needed — Next.js auto-links app/manifest.ts —
  // but is explicit here since a missing manifest is exactly what caused the
  // PWA install bug (see manifest.ts's comment) and shouldn't regress silently.
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // iOS ignores the Web Manifest's `display`/`start_url` on older versions
  // (pre-16.4) entirely and instead looks ONLY at these apple-specific meta
  // tags to decide whether "Add to Home Screen" opens as a standalone app
  // (no address bar) at all. `capable: true` is the actual fix for "shows
  // the address bar" on those devices; the manifest above covers 16.4+ and
  // Android. `title` sets the name under the home-screen icon independent of
  // the page <title>.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Canopy',
  },
  // Next 16's `appleWebApp.capable` only renders the newer, non-prefixed
  // `mobile-web-app-capable` tag (verified against this app's own built
  // output) — Apple's own "Configuring Web Applications" docs still name
  // the `apple-` prefixed tag as what iOS Safari's "Add to Home Screen"
  // checks for standalone (no address bar) mode, and it's what every real
  // iOS device out there was actually tested against, so it's set
  // explicitly here rather than trusted to a helper that (in this Next
  // version) doesn't emit it.
  other: {
    'apple-mobile-web-app-capable': 'yes',
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
