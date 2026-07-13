/**
 * Canonical save-state taxonomy shared by every autosave surface
 * (contract intake, template drafts, program setup wizard, etc.).
 *
 * Keeping this one union in one place means:
 *  - all status UIs (indicator dots, toasts, aria-live regions) can
 *    branch on the same set of strings;
 *  - adding a new state (e.g. 'offline_queued') is a single edit that
 *    surfaces through TypeScript everywhere it's consumed.
 *
 * Semantics
 * ---------
 *  idle      — no pending edits, nothing in flight.
 *  dirty     — user has typed but the debounce timer hasn't fired yet.
 *  saving    — request in flight to the server.
 *  saved     — last request succeeded; transient state that decays to `idle`.
 *  conflict  — server refused because the caller's revision was stale;
 *              the surface should reconcile (cache refreshed) and either
 *              silently re-flush or prompt the user.
 *  error     — network or server error; user-visible remediation needed.
 */
export type SaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error';

/** True when the surface has unsaved local changes the user shouldn't lose. */
export function isSaveStateDirty(s: SaveState): boolean {
  return s === 'dirty' || s === 'saving' || s === 'conflict' || s === 'error';
}

/** True while a network round-trip is in progress. */
export function isSaveStateBusy(s: SaveState): boolean {
  return s === 'saving';
}

/** True when it's safe to navigate away without losing edits. */
export function isSaveStateSettled(s: SaveState): boolean {
  return s === 'idle' || s === 'saved';
}
