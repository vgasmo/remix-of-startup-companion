// Application types derived from database schema

export type AppRole = 'admin' | 'consultor' | 'mentor_externo' | 'founder' | 'team_member' | 'backoffice';
export type StartupStage = 'ideation' | 'validation' | 'mvp' | 'growth' | 'scale';
export type HealthScore = 'critical' | 'at_risk' | 'stable' | 'healthy' | 'thriving';
export type WorkspacePriority = 'star' | 'high' | 'standard' | 'maintenance';
export type ActionStatus = 'pending' | 'in_progress' | 'awaiting_validation' | 'completed' | 'cancelled';
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed';
export type ActionPriority = 'low' | 'medium' | 'high' | 'urgent';
export type KpiDirection = 'up' | 'down' | 'neutral';
export type TemplateInstanceStatus = 'draft' | 'in_progress' | 'completed' | 'archived';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: string;
  program_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
  // Joined
  program?: Program;
}

export interface Startup {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  founded_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  startup_id: string;
  program_id: string;
  stage: StartupStage; // Legacy enum column
  stage_id: string | null; // New FK to stages table
  health_score: HealthScore | null;
  health_score_override: HealthScore | null;
  health_status: string | null;
  health_notes: string | null;
  last_checkin_at: string | null;
  priority_level: WorkspacePriority;
  priority_notes: string | null;
  priority_set_at: string | null;
  priority_set_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  startup?: Startup;
  program?: Program;
  stage_ref?: Stage;
}

export interface WorkspaceUser {
  id: string;
  workspace_id: string;
  user_id: string;
  role: AppRole;
  active: boolean;
  created_at: string;
  // Joined
  profile?: Profile;
}

export interface Session {
  id: string;
  workspace_id: string;
  title: string;
  notes: string | null;
  agenda: string | null;
  decisions: string | null;
  scheduled_at: string;
  duration: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  workspace_id: string;
  session_id: string | null;
  title: string;
  description: string | null;
  status: ActionStatus;
  priority: ActionPriority;
  due_date: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  owner_profile?: Profile;
}

export interface Milestone {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  target_date: string | null;
  position: number;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpiDefinition {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  direction: KpiDirection;
  category: string | null;
  is_global: boolean;
  program_id: string | null;
  created_at: string;
}

export interface WorkspaceKpi {
  id: string;
  workspace_id: string;
  kpi_definition_id: string;
  required: boolean;
  target_value: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  kpi_definition?: KpiDefinition;
}

export interface KpiValue {
  id: string;
  workspace_id: string;
  kpi_definition_id: string;
  value: number | null;
  target_value: number | null;
  period_month: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  kpi_definition?: KpiDefinition;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  schema_json: Record<string, unknown> | null;
  is_global: boolean;
  program_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateInstance {
  id: string;
  workspace_id: string;
  template_id: string;
  data_json: Record<string, unknown> | null;
  status: TemplateInstanceStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  template?: Template;
}

export interface Document {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  document_type: 'file' | 'link';
  file_path: string | null;
  external_url: string | null;
  category: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  provider: string | null;
  provider_event_id: string | null;
  join_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Extended workspace with counts for list view
export interface WorkspaceWithStats extends Workspace {
  pending_actions_count?: number;
  overdue_actions_count?: number;
  has_current_month_kpi?: boolean;
}
