import type { MetadataRoute } from 'next';

// Makes Canopy an installable, "clean" PWA — critically, `start_url: '/'` and
// `display: 'standalone'` are what iOS Safari's "Add to Home Screen" actually
// reads (Safari 16.4+): without a manifest at all, iOS falls back to
// bookmarking whatever URL was on-screen at the moment of "Add to Home
// Screen" AND opens the address bar every time, since there's nothing
// telling it this is a standalone app with a fixed entry point. That's the
// literal cause of "it shows the address bar and always opens to Settings" —
// there was no manifest, so the installed icon was just a bookmark of
// whichever page happened to be open when it was added, not a real app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Canopy',
    short_name: 'Canopy',
    description: 'Your personal school planner — classes, schedule, grades, homework, and tasks in one place.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f3f3f1',
    // Matches the "Canopy" preset's light-mode primary (theme.ts) — the
    // default accent theme, since a static manifest can't read a signed-in
    // user's saved accent color pick.
    theme_color: '#2E7D32',
    icons: [
      { src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/icon-192-maskable.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
      { src: '/icon-512-maskable.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
      { src: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180', purpose: 'any' },
    ],
  };
}
