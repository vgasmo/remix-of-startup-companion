import { lazy, Suspense } from "react";
import { useTranslation } from 'react-i18next';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { CommandPalette } from "@/components/command/CommandPalette";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { useMentorNdaStatus } from "@/hooks/useMentorNdaStatus";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useFounderOnboardingState } from "@/hooks/useFounderOnboardingState";

import { AccessDenied } from "@/components/ui/AccessDenied";
import { queryClient } from "@/lib/queryClient";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Eager: lightweight / critical-path pages
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import PendingApproval from "./pages/PendingApproval";
import SuspendedAccount from "./pages/SuspendedAccount";
import AcceptInvite from "./pages/AcceptInvite";

// Lazy: heavy page modules — only loaded when navigated to
const MyWorkspaces = lazy(lazyWithRetry(() => import("./pages/MyWorkspaces"), "lazy:my-workspaces"));
const WorkspaceDetail = lazy(lazyWithRetry(() => import("./pages/WorkspaceDetail"), "lazy:workspace-detail"));
const Admin = lazy(lazyWithRetry(() => import("./pages/Admin"), "lazy:admin"));
const AdminDatarooms = lazy(lazyWithRetry(() => import("./pages/AdminDatarooms"), "lazy:admin-datarooms"));
const ProgramSetupWizard = lazy(lazyWithRetry(() => import("./pages/ProgramSetupWizard"), "lazy:program-setup-wizard"));
const Settings = lazy(lazyWithRetry(() => import("./pages/Settings"), "lazy:settings"));
const Mentors = lazy(lazyWithRetry(() => import("./pages/Mentors"), "lazy:mentors"));
const MentorImpact = lazy(lazyWithRetry(() => import("./pages/MentorImpact"), "lazy:mentor-impact"));
const MentorProfile = lazy(lazyWithRetry(() => import("./pages/MentorProfile"), "lazy:mentor-profile"));
const UserProfile = lazy(lazyWithRetry(() => import("./pages/UserProfile"), "lazy:user-profile"));
const Search = lazy(lazyWithRetry(() => import("./pages/Search"), "lazy:search"));
const SharedWorkspace = lazy(lazyWithRetry(() => import("./pages/SharedWorkspace"), "lazy:shared-workspace"));
const SharedDataroom = lazy(lazyWithRetry(() => import("./pages/SharedDataroom"), "lazy:shared-dataroom"));
const MentorNda = lazy(lazyWithRetry(() => import("./pages/MentorNda"), "lazy:mentor-nda"));
const ConsultorTools = lazy(lazyWithRetry(() => import("./pages/ConsultorTools"), "lazy:consultor-tools"));
const ValuePropWizardPage = lazy(lazyWithRetry(() => import("./pages/ValuePropWizardPage"), "lazy:value-prop"));
const HelpGlossary = lazy(lazyWithRetry(() => import("./pages/HelpGlossary"), "lazy:help-glossary"));
const QuickGuide = lazy(lazyWithRetry(() => import("./pages/QuickGuide"), "lazy:quick-guide"));
const CRM = lazy(lazyWithRetry(() => import("./pages/CRM"), "lazy:crm"));
const CrmDiagnostics = lazy(lazyWithRetry(() => import("./pages/CrmDiagnostics"), "lazy:crm-diagnostics"));
const PublicBooking = lazy(lazyWithRetry(() => import("./pages/PublicBooking"), "lazy:public-booking"));
const AdminDataImport = lazy(lazyWithRetry(() => import("./pages/AdminDataImport"), "lazy:admin-data-import"));
const BulkContractImport = lazy(lazyWithRetry(() => import("./pages/BulkContractImport"), "lazy:bulk-contract-import"));
const AdminContracts = lazy(lazyWithRetry(() => import("./pages/AdminContracts"), "lazy:admin-contracts"));
const Ecosystem = lazy(lazyWithRetry(() => import("./pages/Ecosystem"), "lazy:ecosystem"));
const Documents = lazy(lazyWithRetry(() => import("./pages/Documents"), "lazy:documents"));
const Resources = lazy(lazyWithRetry(() => import("./pages/Resources"), "lazy:resources"));
const StaffCockpit = lazy(lazyWithRetry(() => import("./pages/StaffCockpit"), "lazy:staff-cockpit"));
const SystemSettings = lazy(lazyWithRetry(() => import("./pages/SystemSettings"), "lazy:system-settings"));
const ClaimStartup = lazy(lazyWithRetry(() => import("./pages/ClaimStartup"), "lazy:claim-startup"));
const ResourceGuide = lazy(lazyWithRetry(() => import("./pages/ResourceGuide"), "lazy:resource-guide"));
const ContractOnboarding = lazy(lazyWithRetry(() => import("./pages/ContractOnboarding"), "lazy:contract-onboarding"));
const PublicContractSigning = lazy(lazyWithRetry(() => import("./pages/PublicContractSigning"), "lazy:public-contract-signing"));
const PublicContractIntake = lazy(lazyWithRetry(() => import("./pages/PublicContractIntake"), "lazy:public-contract-intake"));
const AppDiagnostics = lazy(lazyWithRetry(() => import("./pages/AppDiagnostics"), "lazy:app-diagnostics"));

function ProtectedRoute({ children, adminOnly = false, staffOnly = false }: { children: React.ReactNode; adminOnly?: boolean; staffOnly?: boolean }) {
  const { t } = useTranslation();
  const { user, isLoading, isAuthReady, isAdmin, isStaff, isAccountPending, isAccountSuspended } = useAuth();
  const { needsNda, isLoading: ndaLoading } = useMentorNdaStatus();
  const founderState = useFounderOnboardingState();
  const location = useLocation();

  if (isLoading || !isAuthReady || ndaLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isAccountSuspended) {
    return <Navigate to="/suspended" replace />;
  }

  if (isAccountPending && !isStaff) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (needsNda && location.pathname !== '/mentor-nda') {
    return <Navigate to="/mentor-nda" replace />;
  }

  // Claim-first gate: founders without active workspace → /claim-startup
  const claimExemptPaths = ['/claim-startup', '/settings', '/my-workspaces'];
  if (
    !founderState.isLoading &&
    founderState.status !== 'not_founder' &&
    founderState.status !== 'staff_exempt' &&
    founderState.status !== 'has_active_workspace' &&
    founderState.status !== 'needs_onboarding' &&
    !claimExemptPaths.includes(location.pathname)
  ) {
    return <Navigate to="/claim-startup" replace />;
  }

  if (staffOnly && !isStaff) {
    return <Navigate to="/my-workspaces" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/my-workspaces" replace />;
  }

  return (
    <>
      <SessionTimeoutWarning timeoutMs={8 * 60 * 60 * 1000} warningTimeMs={10 * 60 * 1000} />
      <CommandPalette />
      {children}
    </>
  );
}

function SuspenseFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">A carregar...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  useVersionCheck();
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route path="/suspended" element={<SuspendedAccount />} />
        <Route path="/share/:token" element={<SharedWorkspace />} />
        <Route path="/dataroom/shared/:token" element={<SharedDataroom />} />
        <Route path="/book/:token" element={<PublicBooking />} />
        <Route path="/contract-signing/:token" element={<PublicContractSigning />} />
        <Route path="/contract-intake/:token" element={<PublicContractIntake />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/mentor-nda" element={<ProtectedRoute><MentorNda /></ProtectedRoute>} />
        <Route path="/claim-startup" element={<ProtectedRoute><ClaimStartup /></ProtectedRoute>} />
        <Route path="/contract-onboarding/:contractId" element={<ProtectedRoute><ContractOnboarding /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/my-workspaces" replace />} />
        <Route path="/my-workspaces" element={<ProtectedRoute><MyWorkspaces /></ProtectedRoute>} />
        <Route path="/workspace/:id" element={<ProtectedRoute><WorkspaceDetail /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/mentors" element={<ProtectedRoute><Mentors /></ProtectedRoute>} />
        <Route path="/mentors/impact" element={<ProtectedRoute><MentorImpact /></ProtectedRoute>} />
        <Route path="/mentors/:mentorId" element={<ProtectedRoute><MentorProfile /></ProtectedRoute>} />
        <Route path="/profile/:userId" element={<ProtectedRoute staffOnly><UserProfile /></ProtectedRoute>} />
        <Route path="/consultor-tools" element={<ProtectedRoute staffOnly><ConsultorTools /></ProtectedRoute>} />
        <Route path="/workspace/:workspaceId/value-prop" element={<ProtectedRoute><ValuePropWizardPage /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/integrations-setup" element={<Navigate to="/settings" replace />} />
        <Route path="/documents" element={<ProtectedRoute staffOnly><Documents /></ProtectedRoute>} />
        <Route path="/resources" element={<ProtectedRoute><Resources /></ProtectedRoute>} />
        <Route path="/resources/guide/:id" element={<ProtectedRoute><ResourceGuide /></ProtectedRoute>} />
        <Route path="/help" element={<ProtectedRoute><HelpGlossary /></ProtectedRoute>} />
        <Route path="/guide" element={<ProtectedRoute><QuickGuide /></ProtectedRoute>} />
        <Route path="/crm" element={<ProtectedRoute staffOnly><CRM /></ProtectedRoute>} />
        <Route path="/ecosystem" element={<ProtectedRoute staffOnly><Ecosystem /></ProtectedRoute>} />
        <Route path="/admin/crm-diagnostics" element={<ProtectedRoute staffOnly><CrmDiagnostics /></ProtectedRoute>} />
        <Route path="/staff-cockpit" element={<ProtectedRoute staffOnly><StaffCockpit /></ProtectedRoute>} />
        <Route path="/system-settings" element={<ProtectedRoute adminOnly><SystemSettings /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute staffOnly><Admin /></ProtectedRoute>} />
        <Route path="/admin/datarooms" element={<ProtectedRoute staffOnly><AdminDatarooms /></ProtectedRoute>} />
            <Route path="/admin/data-import" element={<ProtectedRoute adminOnly><AdminDataImport /></ProtectedRoute>} />
            <Route path="/admin/contracts/bulk-import" element={<ProtectedRoute adminOnly><BulkContractImport /></ProtectedRoute>} />
            <Route path="/admin/diagnostics" element={<ProtectedRoute adminOnly><AppDiagnostics /></ProtectedRoute>} />
        <Route path="/admin/programs/new" element={<ProtectedRoute staffOnly><ProgramSetupWizard /></ProtectedRoute>} />
        <Route path="/admin/programs/new/:draftId" element={<ProtectedRoute staffOnly><ProgramSetupWizard /></ProtectedRoute>} />
        <Route path="/admin/programs/:id/setup" element={<ProtectedRoute staffOnly><ProgramSetupWizard /></ProtectedRoute>} />
        <Route path="/admin/programs/:id/setup/:draftId" element={<ProtectedRoute staffOnly><ProgramSetupWizard /></ProtectedRoute>} />
        <Route path="/admin/*" element={<ProtectedRoute staffOnly><NotFound /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <AuthProvider>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
