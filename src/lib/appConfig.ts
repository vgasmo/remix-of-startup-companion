/**
 * Centralized Application Configuration
 * All environment-dependent URLs and settings should be defined here
 */

// Get the current app URL based on environment
function getAppUrl(): string {
  // Check for explicit environment variable first
  if (import.meta.env.VITE_APP_URL) {
    return import.meta.env.VITE_APP_URL;
  }
  
  // In development
  if (import.meta.env.DEV) {
    return window.location.origin;
  }
  
  // In production, use the current origin
  return window.location.origin;
}

export const AppConfig = {
  // Base URLs
  appUrl: getAppUrl(),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseProjectId: import.meta.env.VITE_SUPABASE_PROJECT_ID as string,
  
  // Derived URLs
  get functionsUrl() {
    return `${this.supabaseUrl}/functions/v1`;
  },
  
  // Helper to build deep links
  buildLink(path: string): string {
    const base = this.appUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  },
  
  // Build workspace link
  workspaceLink(workspaceId: string, tab?: string): string {
    let path = `/workspace/${workspaceId}`;
    if (tab) path += `?tab=${tab}`;
    return this.buildLink(path);
  },
  
  // Build session link
  sessionLink(workspaceId: string, sessionId: string): string {
    return this.buildLink(`/workspace/${workspaceId}?tab=agenda&session=${sessionId}`);
  },
  
  // Build action link  
  actionLink(workspaceId: string, actionId: string): string {
    return this.buildLink(`/workspace/${workspaceId}?tab=milestones-actions&sub=actions&action=${actionId}`);
  },
  
  // Calendar feed URL (with secure token)
  calendarFeedUrl(token: string): string {
    return `${this.functionsUrl}/calendar-feed?token=${token}`;
  },
  
  // Calendar feed URL for workspace (requires auth)
  workspaceCalendarUrl(workspaceId: string): string {
    return `${this.functionsUrl}/calendar-feed?workspace_id=${workspaceId}`;
  },
} as const;

export default AppConfig;
