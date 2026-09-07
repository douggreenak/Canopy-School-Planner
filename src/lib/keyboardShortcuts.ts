// Canonical keyboard-shortcut definitions — shared by GlobalShortcuts (the
// listener that actually acts on them) and KeyboardShortcutsModal (the
// "Show keyboard shortcuts" help panel), so the two can't drift apart.

/** A "g" then <key> navigation sequence (Gmail/GitHub/Linear-style "go to"). */
export interface NavShortcut {
  sequence: string; // lowercase, e.g. "gd" — the full key sequence after "g"
  path: string;
  label: string;
}

export const NAV_SHORTCUTS: NavShortcut[] = [
  { sequence: 'gd', path: '/',          label: 'Dashboard' },
  { sequence: 'gc', path: '/classes',   label: 'Classes' },
  { sequence: 'gs', path: '/schedule',  label: 'Schedule' },
  { sequence: 'gg', path: '/grades',    label: 'Grades' },
  { sequence: 'ge', path: '/exams',     label: 'Exams' },
  { sequence: 'gt', path: '/tasks',     label: 'Tasks' },
  { sequence: 'gp', path: '/settings',  label: 'Settings' },
];

export interface ShortcutItem {
  keys: string[]; // rendered as separate key-cap chips, e.g. ['G', 'then', 'D']
  description: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: NAV_SHORTCUTS.map((s) => ({
      keys: ['G', 'then', s.sequence[1].toUpperCase()],
      description: `Go to ${s.label}`,
    })),
  },
  {
    title: 'General',
    items: [
      { keys: ['?'], description: 'Show this keyboard shortcuts panel' },
      { keys: ['Esc'], description: 'Close the open dialog or menu' },
      { keys: ['Tab'], description: 'Move focus to the next control' },
      { keys: ['Shift', 'Tab'], description: 'Move focus to the previous control' },
      { keys: ['Enter'], description: 'Activate the focused button, link, or card' },
      { keys: ['Space'], description: 'Activate the focused button or toggle a checkbox' },
    ],
  },
];
