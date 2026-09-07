'use client';
// ============================================================
// GlobalShortcuts — app-wide keyboard shortcut listener. Renders nothing;
// mounted once in AppShell. Purely additive: every action here already has
// a mouse/touch equivalent, so this never removes a way to do something.
// ============================================================
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { NAV_SHORTCUTS } from '@/lib/keyboardShortcuts';

const SEQUENCE_TIMEOUT_MS = 900;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export default function GlobalShortcuts() {
  const router = useRouter();
  // A pending "g" prefix waiting for its follow-up key, with an expiry so an
  // old "g" press can't silently combine with an unrelated later keystroke.
  const pendingRef = useRef<{ prefix: string; expiresAt: number } | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never hijack a modified key (browser/OS shortcuts, e.g. Cmd+F) or
      // anything typed into a real input.
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        window.dispatchEvent(new Event('open-keyboard-shortcuts'));
        return;
      }

      const now = Date.now();
      const pending = pendingRef.current;
      if (pending && now < pending.expiresAt) {
        pendingRef.current = null;
        const sequence = pending.prefix + e.key.toLowerCase();
        const match = NAV_SHORTCUTS.find((s) => s.sequence === sequence);
        if (match) {
          e.preventDefault();
          router.push(match.path);
        }
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        pendingRef.current = { prefix: 'g', expiresAt: now + SEQUENCE_TIMEOUT_MS };
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return null;
}
