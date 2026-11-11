import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ auth: { user: { id: 'viewer' } as { id: string } | null, isLoading: false, isAuthReady: true, isAdmin: false, isStaff: false, isAccountPending: false, isAccountSuspended: false, authError: false, retryUserData: vi.fn(), signOut: vi.fn() }, nda: { needsNda: false, isLoading: false, verificationError: false, retryVerification: vi.fn() }, founder: { status: 'not_founder', isLoading: false } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/hooks/useMentorNdaStatus', () => ({ useMentorNdaStatus: () => state.nda }));
vi.mock('@/hooks/useFounderOnboardingState', () => ({ useFounderOnboardingState: () => state.founder }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/command/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/support/BugReportWidget', () => ({ BugReportWidget: () => null }));
vi.mock('./SessionTimeoutWarning', () => ({ SessionTimeoutWarning: () => null }));
import { ProtectedRoute } from './ProtectedRoute';
function Location() { const l = useLocation(); return <output data-testid="destination">{l.pathname + l.search + l.hash}</output>; }
function open(path = '/workspace/w?tab=documents#file', props = {}) {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/workspace/:id" element={<ProtectedRoute {...props}><span data-testid="protected">private content</span></ProtectedRoute>} /><Route path="*" element={<Location />} /></Routes></MemoryRouter>);
}
describe('real protected route with simulated auth context', () => {
  beforeEach(() => { Object.assign(state.auth, { user: { id: 'viewer' }, isLoading: false, isAuthReady: true, isAdmin: false, isStaff: false, isAccountPending: false, isAccountSuspended: false, authError: false }); Object.assign(state.nda, { needsNda: false, isLoading: false, verificationError: false }); state.founder = { status: 'not_founder', isLoading: false }; });
  afterEach(cleanup);
  it('retains the exact deep link through login', () => { state.auth.user = null; open(); expect(screen.getByTestId('destination').textContent).toBe('/login?returnTo=%2Fworkspace%2Fw%3Ftab%3Ddocuments%23file'); });
  it('denies suspended staff even with the admin role', () => { Object.assign(state.auth, { isAccountSuspended: true, isAdmin: true, isStaff: true }); open(); expect(screen.getByTestId('destination').textContent).toBe('/suspended'); });
  it('redirects pending non-staff to approval', () => { state.auth.isAccountPending = true; open(); expect(screen.getByTestId('destination').textContent).toBe('/pending-approval'); });
  it('redirects pending staff to approval too', () => { Object.assign(state.auth, { isAccountPending: true, isAdmin: true, isStaff: true }); open(); expect(screen.getByTestId('destination').textContent).toBe('/pending-approval'); });
  it.each(['auth', 'nda'])('blocks private content on %s verification errors', kind => { if (kind === 'auth') state.auth.authError = true; else state.nda.verificationError = true; open(); expect(screen.queryByTestId('protected')).toBeNull(); expect(screen.queryByTestId('destination')).toBeNull(); });
  it('requires mentor NDA acceptance', () => { state.nda.needsNda = true; open(); expect(screen.getByTestId('destination').textContent).toBe('/mentor-nda'); });
  it('allows the existing onboarding wizard without a claim redirect', () => { state.founder.status = 'needs_onboarding'; open('/workspace/w?onboarding=true'); expect(screen.getByTestId('protected')).toBeInTheDocument(); });
  it('keeps pending workspace access available', () => { state.founder.status = 'has_pending_workspace'; open(); expect(screen.getByTestId('protected')).toBeInTheDocument(); });
  it('requires a claim for a founder without a workspace', () => { state.founder.status = 'needs_claim_verification'; open(); expect(screen.getByTestId('destination').textContent).toBe('/claim-startup'); });
  it.each(['staffOnly', 'adminOnly'])('does not grant %s based on a session alone', permission => { open('/workspace/w', { [permission]: true }); expect(screen.getByTestId('destination').textContent).toBe('/my-workspaces'); });
  it('does not expose content before authentication is ready', () => { state.auth.isAuthReady = false; open(); expect(screen.queryByTestId('protected')).toBeNull(); });
});
