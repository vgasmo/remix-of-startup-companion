export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_comments: {
        Row: {
          action_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_comments_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
        ]
      }
      action_deliverables: {
        Row: {
          action_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          document_id: string | null
          external_url: string | null
          file_path: string | null
          id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          action_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          document_id?: string | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          action_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          document_id?: string | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_deliverables_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_deliverables_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      action_items: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          milestone_id: string | null
          owner_user_id: string | null
          planner_sync_status: string | null
          planner_task_id: string | null
          priority: string | null
          search_vector: unknown
          session_id: string | null
          source_deliverable_key: string | null
          status: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_id?: string | null
          owner_user_id?: string | null
          planner_sync_status?: string | null
          planner_task_id?: string | null
          priority?: string | null
          search_vector?: unknown
          session_id?: string | null
          source_deliverable_key?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_id?: string | null
          owner_user_id?: string | null
          planner_sync_status?: string | null
          planner_task_id?: string | null
          priority?: string | null
          search_vector?: unknown
          session_id?: string | null
          source_deliverable_key?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      action_tags: {
        Row: {
          action_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          action_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          action_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_tags_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_announcements: {
        Row: {
          building_id: string | null
          category: string
          created_at: string
          created_by: string
          email_sent_at: string | null
          expires_at: string | null
          id: string
          is_read: boolean
          message: string | null
          read_at: string | null
          send_email: boolean | null
          send_teams: boolean | null
          teams_sent_at: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          building_id?: string | null
          category: string
          created_at?: string
          created_by: string
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          send_email?: boolean | null
          send_teams?: boolean | null
          teams_sent_at?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          building_id?: string | null
          category?: string
          created_at?: string
          created_by?: string
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          send_email?: boolean | null
          send_teams?: boolean | null
          teams_sent_at?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_announcements_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_announcements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_rate_limits: {
        Row: {
          created_at: string
          function_name: string
          id: string
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_start?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_rate_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json
          role: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          role?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          role?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          automation_type: string
          channel: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          run_date: string
          user_id: string
        }
        Insert: {
          automation_type: string
          channel?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          run_date?: string
          user_id: string
        }
        Update: {
          automation_type?: string
          channel?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          run_date?: string
          user_id?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          console_errors: Json
          created_at: string
          description: string
          id: string
          metadata: Json
          resolution_notes: string | null
          resolved_at: string | null
          route: string | null
          screenshot_paths: string[]
          severity: string
          status: string
          updated_at: string
          url: string | null
          user_agent: string | null
          user_id: string | null
          viewport: string | null
          workspace_id: string | null
        }
        Insert: {
          console_errors?: Json
          created_at?: string
          description: string
          id?: string
          metadata?: Json
          resolution_notes?: string | null
          resolved_at?: string | null
          route?: string | null
          screenshot_paths?: string[]
          severity?: string
          status?: string
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
          workspace_id?: string | null
        }
        Update: {
          console_errors?: Json
          created_at?: string
          description?: string
          id?: string
          metadata?: Json
          resolution_notes?: string | null
          resolved_at?: string | null
          route?: string | null
          screenshot_paths?: string[]
          severity?: string
          status?: string
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          total_area_sqm: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          total_area_sqm?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          total_area_sqm?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      bulk_import_batches: {
        Row: {
          committed_count: number
          completed_at: string | null
          created_at: string
          created_by: string
          dry_run_report: Json | null
          extracted_count: number
          failed_count: number
          id: string
          mapping_mode: string
          notes: string | null
          package_kind: string | null
          package_manifest: Json | null
          plan_hash: string | null
          program_id: string | null
          service_program_map: Json
          status: string
          total_files: number
          updated_at: string
        }
        Insert: {
          committed_count?: number
          completed_at?: string | null
          created_at?: string
          created_by: string
          dry_run_report?: Json | null
          extracted_count?: number
          failed_count?: number
          id?: string
          mapping_mode?: string
          notes?: string | null
          package_kind?: string | null
          package_manifest?: Json | null
          plan_hash?: string | null
          program_id?: string | null
          service_program_map?: Json
          status?: string
          total_files?: number
          updated_at?: string
        }
        Update: {
          committed_count?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string
          dry_run_report?: Json | null
          extracted_count?: number
          failed_count?: number
          id?: string
          mapping_mode?: string
          notes?: string | null
          package_kind?: string | null
          package_manifest?: Json | null
          plan_hash?: string | null
          program_id?: string | null
          service_program_map?: Json
          status?: string
          total_files?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_batches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_import_rollbacks: {
        Row: {
          actor_user_id: string | null
          batch_id: string
          created_at: string
          executed_at: string
          id: string
          outcome: string
          reason: string | null
          row_id: string | null
          storage_objects_removed: Json
          undo_payload: Json
        }
        Insert: {
          actor_user_id?: string | null
          batch_id: string
          created_at?: string
          executed_at?: string
          id?: string
          outcome?: string
          reason?: string | null
          row_id?: string | null
          storage_objects_removed?: Json
          undo_payload: Json
        }
        Update: {
          actor_user_id?: string | null
          batch_id?: string
          created_at?: string
          executed_at?: string
          id?: string
          outcome?: string
          reason?: string | null
          row_id?: string | null
          storage_objects_removed?: Json
          undo_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_rollbacks_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "bulk_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rollbacks_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "bulk_import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_import_rows: {
        Row: {
          after_snapshot: Json | null
          ai_confidence: number | null
          batch_id: string
          before_snapshot: Json | null
          commit_authorized: boolean
          commit_idempotency_key: string | null
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_contract_id: string | null
          edited_json: Json | null
          error: Json | null
          error_message: string | null
          extracted_json: Json | null
          id: string
          idempotency_key: string | null
          match_method: string | null
          matched_startup_id: string | null
          matched_workspace_id: string | null
          pdf_filename: string | null
          pdf_path: string | null
          pdf_sha256: string | null
          pdf_verified: boolean
          rollback_state: string
          rolled_back_at: string | null
          selected: boolean
          service_group: string | null
          source_case: string | null
          status: string
          tomorrow_queue: string | null
          updated_at: string
        }
        Insert: {
          after_snapshot?: Json | null
          ai_confidence?: number | null
          batch_id: string
          before_snapshot?: Json | null
          commit_authorized?: boolean
          commit_idempotency_key?: string | null
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_contract_id?: string | null
          edited_json?: Json | null
          error?: Json | null
          error_message?: string | null
          extracted_json?: Json | null
          id?: string
          idempotency_key?: string | null
          match_method?: string | null
          matched_startup_id?: string | null
          matched_workspace_id?: string | null
          pdf_filename?: string | null
          pdf_path?: string | null
          pdf_sha256?: string | null
          pdf_verified?: boolean
          rollback_state?: string
          rolled_back_at?: string | null
          selected?: boolean
          service_group?: string | null
          source_case?: string | null
          status?: string
          tomorrow_queue?: string | null
          updated_at?: string
        }
        Update: {
          after_snapshot?: Json | null
          ai_confidence?: number | null
          batch_id?: string
          before_snapshot?: Json | null
          commit_authorized?: boolean
          commit_idempotency_key?: string | null
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_contract_id?: string | null
          edited_json?: Json | null
          error?: Json | null
          error_message?: string | null
          extracted_json?: Json | null
          id?: string
          idempotency_key?: string | null
          match_method?: string | null
          matched_startup_id?: string | null
          matched_workspace_id?: string | null
          pdf_filename?: string | null
          pdf_path?: string | null
          pdf_sha256?: string | null
          pdf_verified?: boolean
          rollback_state?: string
          rolled_back_at?: string | null
          selected?: boolean
          service_group?: string | null
          source_case?: string | null
          status?: string
          tomorrow_queue?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "bulk_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rows_created_contract_id_fkey"
            columns: ["created_contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rows_created_contract_id_fkey"
            columns: ["created_contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rows_matched_startup_id_fkey"
            columns: ["matched_startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rows_matched_startup_id_fkey"
            columns: ["matched_startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_rows_matched_workspace_id_fkey"
            columns: ["matched_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_table_entries: {
        Row: {
          cliff_months: number | null
          created_at: string
          funding_round_id: string | null
          holder_name: string
          holder_type: string
          id: string
          investment_amount: number | null
          notes: string | null
          share_type: string
          shares: number
          startup_id: string
          updated_at: string
          vesting_months: number | null
          vesting_start: string | null
        }
        Insert: {
          cliff_months?: number | null
          created_at?: string
          funding_round_id?: string | null
          holder_name: string
          holder_type?: string
          id?: string
          investment_amount?: number | null
          notes?: string | null
          share_type?: string
          shares?: number
          startup_id: string
          updated_at?: string
          vesting_months?: number | null
          vesting_start?: string | null
        }
        Update: {
          cliff_months?: number | null
          created_at?: string
          funding_round_id?: string | null
          holder_name?: string
          holder_type?: string
          id?: string
          investment_amount?: number | null
          notes?: string | null
          share_type?: string
          shares?: number
          startup_id?: string
          updated_at?: string
          vesting_months?: number | null
          vesting_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cap_table_entries_funding_round_id_fkey"
            columns: ["funding_round_id"]
            isOneToOne: false
            referencedRelation: "funding_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_table_entries_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_table_entries_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      census_reports: {
        Row: {
          csv_object_path: string | null
          duplicates: Json
          generated_at: string
          generated_by: string | null
          id: string
          notes: string | null
          phc_extract_object_path: string | null
          raw: Json
          service_breakdown: Json
          totals: Json
          workspace_breakdown: Json
        }
        Insert: {
          csv_object_path?: string | null
          duplicates?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          phc_extract_object_path?: string | null
          raw?: Json
          service_breakdown?: Json
          totals?: Json
          workspace_breakdown?: Json
        }
        Update: {
          csv_object_path?: string | null
          duplicates?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          phc_extract_object_path?: string | null
          raw?: Json
          service_breakdown?: Json
          totals?: Json
          workspace_breakdown?: Json
        }
        Relationships: []
      }
      checkin_definitions: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          is_active: boolean
          kpi_definition_ids: string[] | null
          name: string
          questions: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number
          id?: string
          is_active?: boolean
          kpi_definition_ids?: string[] | null
          name?: string
          questions?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          is_active?: boolean
          kpi_definition_ids?: string[] | null
          name?: string
          questions?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_definitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_instances: {
        Row: {
          compliance_status: Database["public"]["Enums"]["compliance_status"]
          created_at: string
          definition_id: string
          due_date: string
          id: string
          reminder_sent_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          week_start: string
          workspace_id: string
        }
        Insert: {
          compliance_status?: Database["public"]["Enums"]["compliance_status"]
          created_at?: string
          definition_id: string
          due_date: string
          id?: string
          reminder_sent_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          week_start: string
          workspace_id: string
        }
        Update: {
          compliance_status?: Database["public"]["Enums"]["compliance_status"]
          created_at?: string
          definition_id?: string
          due_date?: string
          id?: string
          reminder_sent_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          week_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_instances_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "checkin_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_response_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          instance_id: string | null
          kpi_definition_id: string | null
          new_number: number | null
          new_value: string | null
          old_number: number | null
          old_value: string | null
          question_id: string | null
          response_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          instance_id?: string | null
          kpi_definition_id?: string | null
          new_number?: number | null
          new_value?: string | null
          old_number?: number | null
          old_value?: string | null
          question_id?: string | null
          response_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          instance_id?: string | null
          kpi_definition_id?: string | null
          new_number?: number | null
          new_value?: string | null
          old_number?: number | null
          old_value?: string | null
          question_id?: string | null
          response_id?: string | null
        }
        Relationships: []
      }
      checkin_responses: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          kpi_definition_id: string | null
          question_id: string
          response_number: number | null
          response_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          kpi_definition_id?: string | null
          question_id: string
          response_number?: number | null
          response_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          kpi_definition_id?: string | null
          question_id?: string
          response_number?: number | null
          response_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_responses_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "checkin_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_responses_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_logs: {
        Row: {
          context: Json
          created_at: string
          error_id: string
          id: string
          message: string
          name: string | null
          severity: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          error_id: string
          id?: string
          message: string
          name?: string | null
          severity?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          error_id?: string
          id?: string
          message?: string
          name?: string | null
          severity?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cohort_benchmarks: {
        Row: {
          avg: number | null
          cohort_size: number
          computed_at: string
          created_at: string
          id: string
          metric_key: string
          metric_label: string | null
          p25: number | null
          p50: number | null
          p75: number | null
          p90: number | null
          program_id: string
          stage: string
        }
        Insert: {
          avg?: number | null
          cohort_size: number
          computed_at?: string
          created_at?: string
          id?: string
          metric_key: string
          metric_label?: string | null
          p25?: number | null
          p50?: number | null
          p75?: number | null
          p90?: number | null
          program_id: string
          stage: string
        }
        Update: {
          avg?: number | null
          cohort_size?: number
          computed_at?: string
          created_at?: string
          id?: string
          metric_key?: string
          metric_label?: string | null
          p25?: number | null
          p50?: number | null
          p75?: number | null
          p90?: number | null
          program_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_benchmarks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_log: {
        Row: {
          activity_type: string
          assigned_to: string | null
          body: string | null
          channel: string | null
          completed_at: string | null
          consultant_user_id: string | null
          created_at: string | null
          direction: string | null
          due_at: string | null
          external_id: string | null
          external_source: string | null
          from_address: string | null
          funnel_item_id: string | null
          id: string
          ignored: boolean | null
          internet_message_id: string | null
          last_synced_at: string | null
          matched_contact_email: string | null
          matched_startup_id: string | null
          matching_confidence: string | null
          matching_method: string | null
          metadata_json: Json | null
          needs_review: boolean | null
          occurred_at: string
          participants_json: Json | null
          preview: string | null
          priority: string | null
          provider_thread_id: string | null
          status: string
          subject: string | null
          sync_error: string | null
          sync_status: string | null
          visibility: string
          workspace_id: string | null
        }
        Insert: {
          activity_type?: string
          assigned_to?: string | null
          body?: string | null
          channel?: string | null
          completed_at?: string | null
          consultant_user_id?: string | null
          created_at?: string | null
          direction?: string | null
          due_at?: string | null
          external_id?: string | null
          external_source?: string | null
          from_address?: string | null
          funnel_item_id?: string | null
          id?: string
          ignored?: boolean | null
          internet_message_id?: string | null
          last_synced_at?: string | null
          matched_contact_email?: string | null
          matched_startup_id?: string | null
          matching_confidence?: string | null
          matching_method?: string | null
          metadata_json?: Json | null
          needs_review?: boolean | null
          occurred_at?: string
          participants_json?: Json | null
          preview?: string | null
          priority?: string | null
          provider_thread_id?: string | null
          status?: string
          subject?: string | null
          sync_error?: string | null
          sync_status?: string | null
          visibility?: string
          workspace_id?: string | null
        }
        Update: {
          activity_type?: string
          assigned_to?: string | null
          body?: string | null
          channel?: string | null
          completed_at?: string | null
          consultant_user_id?: string | null
          created_at?: string | null
          direction?: string | null
          due_at?: string | null
          external_id?: string | null
          external_source?: string | null
          from_address?: string | null
          funnel_item_id?: string | null
          id?: string
          ignored?: boolean | null
          internet_message_id?: string | null
          last_synced_at?: string | null
          matched_contact_email?: string | null
          matched_startup_id?: string | null
          matching_confidence?: string | null
          matching_method?: string | null
          metadata_json?: Json | null
          needs_review?: boolean | null
          occurred_at?: string
          participants_json?: Json | null
          preview?: string | null
          priority?: string | null
          provider_thread_id?: string | null
          status?: string
          subject?: string | null
          sync_error?: string | null
          sync_status?: string | null
          visibility?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_export"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_matched_startup_id_fkey"
            columns: ["matched_startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_matched_startup_id_fkey"
            columns: ["matched_startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      complementary_services: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_included: boolean | null
          name: string
          notes: string | null
          pricing_version_id: string
          sort_order: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_included?: boolean | null
          name: string
          notes?: string | null
          pricing_version_id: string
          sort_order?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_included?: boolean | null
          name?: string
          notes?: string | null
          pricing_version_id?: string
          sort_order?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "complementary_services_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: false
            referencedRelation: "pricing_table_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_private: boolean
          search_vector: unknown
          updated_at: string
          visibility: string | null
          workspace_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_private?: boolean
          search_vector?: unknown
          updated_at?: string
          visibility?: string | null
          workspace_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_private?: boolean
          search_vector?: unknown
          updated_at?: string
          visibility?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultant_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_discounts: {
        Row: {
          approved_by: string | null
          contract_id: string
          created_at: string
          discount_percentage: number
          end_date: string | null
          id: string
          reason: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          contract_id: string
          created_at?: string
          discount_percentage: number
          end_date?: string | null
          id?: string
          reason?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          contract_id?: string
          created_at?: string
          discount_percentage?: number
          end_date?: string | null
          id?: string
          reason?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_discounts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_discounts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_field_conflicts: {
        Row: {
          actor_id: string | null
          attempted_source: string | null
          attempted_value: Json | null
          contract_id: string
          created_at: string
          field_name: string
          field_owner: string | null
          id: string
          old_value: Json | null
          reason: string | null
          resolution: string
        }
        Insert: {
          actor_id?: string | null
          attempted_source?: string | null
          attempted_value?: Json | null
          contract_id: string
          created_at?: string
          field_name: string
          field_owner?: string | null
          id?: string
          old_value?: Json | null
          reason?: string | null
          resolution: string
        }
        Update: {
          actor_id?: string | null
          attempted_source?: string | null
          attempted_value?: Json | null
          contract_id?: string
          created_at?: string
          field_name?: string
          field_owner?: string | null
          id?: string
          old_value?: Json | null
          reason?: string | null
          resolution?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_field_conflicts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_field_conflicts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_field_ownership: {
        Row: {
          created_at: string
          description: string | null
          field_name: string
          owner: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          field_name: string
          owner: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          field_name?: string
          owner?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_intakes: {
        Row: {
          additional_representatives: Json
          approved_data_snapshot: Json | null
          assigned_to: string | null
          billing_email: string | null
          certidao_permanente_code: string | null
          changes_requested_notes: string | null
          company_address: string | null
          company_city: string | null
          company_country: string | null
          company_nif: string | null
          company_postal_code: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          documents_json: Json | null
          funnel_item_id: string | null
          iban: string | null
          id: string
          intake_token_expires_at: string | null
          intake_token_hash: string | null
          last_reminder_sent_at: string | null
          legal_representative_email: string | null
          legal_representative_name: string | null
          legal_representative_phone: string | null
          missing_documents: string[] | null
          organization_name: string | null
          project_name: string | null
          reminder_count: number | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          startup_description: string | null
          status: Database["public"]["Enums"]["intake_status"]
          submitted_at: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          additional_representatives?: Json
          approved_data_snapshot?: Json | null
          assigned_to?: string | null
          billing_email?: string | null
          certidao_permanente_code?: string | null
          changes_requested_notes?: string | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_nif?: string | null
          company_postal_code?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          documents_json?: Json | null
          funnel_item_id?: string | null
          iban?: string | null
          id?: string
          intake_token_expires_at?: string | null
          intake_token_hash?: string | null
          last_reminder_sent_at?: string | null
          legal_representative_email?: string | null
          legal_representative_name?: string | null
          legal_representative_phone?: string | null
          missing_documents?: string[] | null
          organization_name?: string | null
          project_name?: string | null
          reminder_count?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startup_description?: string | null
          status?: Database["public"]["Enums"]["intake_status"]
          submitted_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          additional_representatives?: Json
          approved_data_snapshot?: Json | null
          assigned_to?: string | null
          billing_email?: string | null
          certidao_permanente_code?: string | null
          changes_requested_notes?: string | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_nif?: string | null
          company_postal_code?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          documents_json?: Json | null
          funnel_item_id?: string | null
          iban?: string | null
          id?: string
          intake_token_expires_at?: string | null
          intake_token_hash?: string | null
          last_reminder_sent_at?: string | null
          legal_representative_email?: string | null
          legal_representative_name?: string | null
          legal_representative_phone?: string | null
          missing_documents?: string[] | null
          organization_name?: string | null
          project_name?: string | null
          reminder_count?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startup_description?: string | null
          status?: Database["public"]["Enums"]["intake_status"]
          submitted_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_intakes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_intakes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_intakes_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_lifecycle_events: {
        Row: {
          contract_id: string
          created_at: string | null
          details: Json | null
          event_date: string
          event_type: string
          id: string
          performed_by: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          details?: Json | null
          event_date: string
          event_type: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          details?: Json | null
          event_date?: string
          event_type?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_lifecycle_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lifecycle_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_notices: {
        Row: {
          contract_id: string
          created_at: string | null
          created_by: string | null
          details: Json | null
          id: string
          notice_type: string
          response_deadline: string | null
          response_received_date: string | null
          response_status: string | null
          sent_date: string | null
          updated_at: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          id?: string
          notice_type: string
          response_deadline?: string | null
          response_received_date?: string | null
          response_status?: string | null
          sent_date?: string | null
          updated_at?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          id?: string
          notice_type?: string
          response_deadline?: string | null
          response_received_date?: string | null
          response_status?: string | null
          sent_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_notices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_notices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_reminders: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          reminder_type: string
          scheduled_date: string
          sent_at: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          reminder_type: string
          scheduled_date: string
          sent_at?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          reminder_type?: string
          scheduled_date?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_reminders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_reminders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          contract_type: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          file_url: string | null
          funnel_item_id: string | null
          id: string
          notes: string | null
          signed_at: string | null
          signed_by: string | null
          start_date: string | null
          status: string
          updated_at: string
          value_amount: number | null
          value_currency: string | null
          workspace_id: string | null
        }
        Insert: {
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          file_url?: string | null
          funnel_item_id?: string | null
          id?: string
          notes?: string | null
          signed_at?: string | null
          signed_by?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          value_amount?: number | null
          value_currency?: string | null
          workspace_id?: string | null
        }
        Update: {
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          file_url?: string | null
          funnel_item_id?: string | null
          id?: string
          notes?: string | null
          signed_at?: string | null
          signed_by?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          value_amount?: number | null
          value_currency?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          is_group: boolean
          title: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_group?: boolean
          title?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_group?: boolean
          title?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stage_email_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          from_stage: string
          funnel_item_id: string
          id: string
          provider_message_id: string | null
          rule_id: string | null
          sent_at: string | null
          status: string | null
          to_stage: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          from_stage: string
          funnel_item_id: string
          id?: string
          provider_message_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          status?: string | null
          to_stage: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          from_stage?: string
          funnel_item_id?: string
          id?: string
          provider_message_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          status?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stage_email_log_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_email_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "crm_stage_email_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stage_email_rules: {
        Row: {
          body_html: string
          created_at: string | null
          created_by: string | null
          enabled: boolean | null
          from_email: string | null
          from_stage: string
          id: string
          reply_to: string | null
          subject: string
          to_stage: string
          updated_at: string | null
        }
        Insert: {
          body_html: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_stage: string
          id?: string
          reply_to?: string | null
          subject: string
          to_stage: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_stage?: string
          id?: string
          reply_to?: string | null
          subject?: string
          to_stage?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      data_import_jobs: {
        Row: {
          approved_by: string | null
          committed_at: string | null
          config_json: Json
          counts_json: Json
          created_at: string
          created_by: string | null
          file_hash: string | null
          filename: string
          id: string
          prepared_at: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          committed_at?: string | null
          config_json?: Json
          counts_json?: Json
          created_at?: string
          created_by?: string | null
          file_hash?: string | null
          filename: string
          id?: string
          prepared_at?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          committed_at?: string | null
          config_json?: Json
          counts_json?: Json
          created_at?: string
          created_by?: string | null
          file_hash?: string | null
          filename?: string
          id?: string
          prepared_at?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_import_rows: {
        Row: {
          approval_state: string
          approve_toggles_json: Json
          commit_result_json: Json | null
          created_at: string
          id: string
          job_id: string
          match_confidence: number | null
          match_entity_id: string | null
          match_entity_type: string | null
          match_method: string | null
          match_snapshot_updated_at: string | null
          normalized_json: Json
          proposed_action: string
          raw_json: Json
          row_hash: string
          row_number: number
          updated_at: string
          validation_errors_json: Json
        }
        Insert: {
          approval_state?: string
          approve_toggles_json?: Json
          commit_result_json?: Json | null
          created_at?: string
          id?: string
          job_id: string
          match_confidence?: number | null
          match_entity_id?: string | null
          match_entity_type?: string | null
          match_method?: string | null
          match_snapshot_updated_at?: string | null
          normalized_json?: Json
          proposed_action?: string
          raw_json: Json
          row_hash: string
          row_number: number
          updated_at?: string
          validation_errors_json?: Json
        }
        Update: {
          approval_state?: string
          approve_toggles_json?: Json
          commit_result_json?: Json | null
          created_at?: string
          id?: string
          job_id?: string
          match_confidence?: number | null
          match_entity_id?: string | null
          match_entity_type?: string | null
          match_method?: string | null
          match_snapshot_updated_at?: string | null
          normalized_json?: Json
          proposed_action?: string
          raw_json?: Json
          row_hash?: string
          row_number?: number
          updated_at?: string
          validation_errors_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "data_import_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "data_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      dataroom_items: {
        Row: {
          created_at: string
          created_by: string | null
          dataroom_id: string
          description: string | null
          document_id: string | null
          id: string
          investor_update_id: string | null
          sort_order: number
          title: string
          type: string
          url: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dataroom_id: string
          description?: string | null
          document_id?: string | null
          id?: string
          investor_update_id?: string | null
          sort_order?: number
          title: string
          type: string
          url?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dataroom_id?: string
          description?: string | null
          document_id?: string | null
          id?: string
          investor_update_id?: string | null
          sort_order?: number
          title?: string
          type?: string
          url?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataroom_items_dataroom_id_fkey"
            columns: ["dataroom_id"]
            isOneToOne: false
            referencedRelation: "datarooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataroom_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataroom_items_investor_update_id_fkey"
            columns: ["investor_update_id"]
            isOneToOne: false
            referencedRelation: "investor_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      dataroom_share_links: {
        Row: {
          access_count: number
          allow_download: boolean
          created_at: string
          created_by: string | null
          dataroom_id: string
          expires_at: string | null
          id: string
          last_access_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          access_count?: number
          allow_download?: boolean
          created_at?: string
          created_by?: string | null
          dataroom_id: string
          expires_at?: string | null
          id?: string
          last_access_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          access_count?: number
          allow_download?: boolean
          created_at?: string
          created_by?: string | null
          dataroom_id?: string
          expires_at?: string | null
          id?: string
          last_access_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataroom_share_links_dataroom_id_fkey"
            columns: ["dataroom_id"]
            isOneToOne: false
            referencedRelation: "datarooms"
            referencedColumns: ["id"]
          },
        ]
      }
      datarooms: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "datarooms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reviews: {
        Row: {
          ai_analysis_json: Json | null
          ai_analyzed_at: string | null
          approval_status: string
          comments: string | null
          created_at: string
          document_id: string
          id: string
          reviewer_id: string
          score_business_model: number | null
          score_design_clarity: number | null
          score_market: number | null
          score_problem_solution: number | null
          score_team: number | null
          score_traction: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_analysis_json?: Json | null
          ai_analyzed_at?: string | null
          approval_status?: string
          comments?: string | null
          created_at?: string
          document_id: string
          id?: string
          reviewer_id: string
          score_business_model?: number | null
          score_design_clarity?: number | null
          score_market?: number | null
          score_problem_solution?: number | null
          score_team?: number | null
          score_traction?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_analysis_json?: Json | null
          ai_analyzed_at?: string | null
          approval_status?: string
          comments?: string | null
          created_at?: string
          document_id?: string
          id?: string
          reviewer_id?: string
          score_business_model?: number | null
          score_design_clarity?: number | null
          score_market?: number | null
          score_problem_solution?: number | null
          score_team?: number | null
          score_traction?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          document_type: string
          external_url: string | null
          file_path: string | null
          id: string
          mime_type: string | null
          name: string
          search_vector: unknown
          updated_at: string
          uploaded_by: string | null
          visibility: string | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          document_type: string
          external_url?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          name: string
          search_vector?: unknown
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          document_type?: string
          external_url?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          search_vector?: unknown
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ecosystem_snapshots: {
        Row: {
          checksum: string | null
          completed_at: string | null
          created_at: string
          id: string
          initiated_by: string | null
          is_scheduled: boolean | null
          last_error: string | null
          record_counts: Json | null
          retention_class: string | null
          snapshot_type: string
          started_at: string
          status: string
          storage_path: string | null
        }
        Insert: {
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          is_scheduled?: boolean | null
          last_error?: string | null
          record_counts?: Json | null
          retention_class?: string | null
          snapshot_type?: string
          started_at?: string
          status?: string
          storage_path?: string | null
        }
        Update: {
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          is_scheduled?: boolean | null
          last_error?: string | null
          record_counts?: Json | null
          retention_class?: string | null
          snapshot_type?: string
          started_at?: string
          status?: string
          storage_path?: string | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          email_type: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          recipients: Json
          sent_at: string | null
          session_id: string | null
          status: string
          subject: string
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipients?: Json
          sent_at?: string | null
          session_id?: string | null
          status?: string
          subject: string
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipients?: Json
          sent_at?: string | null
          session_id?: string | null
          status?: string
          subject?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_status: {
        Row: {
          consultant_user_id: string
          created_at: string | null
          delta_link: string | null
          emails_ignored: number | null
          emails_logged: number | null
          emails_processed: number | null
          emails_unmatched: number | null
          id: string
          last_success_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          mailbox_email: string | null
          provider: string
          sync_state: string | null
          updated_at: string | null
        }
        Insert: {
          consultant_user_id: string
          created_at?: string | null
          delta_link?: string | null
          emails_ignored?: number | null
          emails_logged?: number | null
          emails_processed?: number | null
          emails_unmatched?: number | null
          id?: string
          last_success_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          mailbox_email?: string | null
          provider?: string
          sync_state?: string | null
          updated_at?: string | null
        }
        Update: {
          consultant_user_id?: string
          created_at?: string | null
          delta_link?: string | null
          emails_ignored?: number | null
          emails_logged?: number | null
          emails_processed?: number | null
          emails_unmatched?: number | null
          id?: string
          last_success_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          mailbox_email?: string | null
          provider?: string
          sync_state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      exercise_attachments: {
        Row: {
          created_at: string
          exercise_id: string
          external_url: string | null
          file_path: string | null
          id: string
          mime_type: string | null
          name: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          external_url?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          name: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          external_url?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_attachments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_library: {
        Row: {
          common_pitfalls: string | null
          created_at: string
          duration_minutes: number | null
          facilitator_tips: string | null
          group_size: string | null
          id: string
          materials_needed: string[] | null
          owner_user_id: string | null
          program_id: string | null
          purpose: string | null
          startup_context_tags: string[] | null
          status: string
          step_by_step: Json | null
          success_criteria: string | null
          title: string
          updated_at: string
          variations: string | null
        }
        Insert: {
          common_pitfalls?: string | null
          created_at?: string
          duration_minutes?: number | null
          facilitator_tips?: string | null
          group_size?: string | null
          id?: string
          materials_needed?: string[] | null
          owner_user_id?: string | null
          program_id?: string | null
          purpose?: string | null
          startup_context_tags?: string[] | null
          status?: string
          step_by_step?: Json | null
          success_criteria?: string | null
          title: string
          updated_at?: string
          variations?: string | null
        }
        Update: {
          common_pitfalls?: string | null
          created_at?: string
          duration_minutes?: number | null
          facilitator_tips?: string | null
          group_size?: string | null
          id?: string
          materials_needed?: string[] | null
          owner_user_id?: string | null
          program_id?: string | null
          purpose?: string | null
          startup_context_tags?: string[] | null
          status?: string
          step_by_step?: Json | null
          success_criteria?: string | null
          title?: string
          updated_at?: string
          variations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_library_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_entity_refs: {
        Row: {
          created_at: string
          external_id: string
          id: string
          internal_entity_id: string
          internal_entity_type: string
          metadata_json: Json
          object_type: string
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          internal_entity_id: string
          internal_entity_type: string
          metadata_json?: Json
          object_type: string
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          internal_entity_id?: string
          internal_entity_type?: string
          metadata_json?: Json
          object_type?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          program_id: string | null
          scope: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          program_id?: string | null
          scope?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          program_id?: string | null
          scope?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_assumptions: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          key: string
          last_validated_at: string | null
          owner_user_id: string | null
          period_index: number | null
          rationale: string | null
          scenario: Database["public"]["Enums"]["financial_plan_scenario"]
          source: Database["public"]["Enums"]["financial_assumption_source"]
          unit: string | null
          updated_at: string
          value_json: Json | null
          value_numeric: number | null
          version_id: string | null
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          key: string
          last_validated_at?: string | null
          owner_user_id?: string | null
          period_index?: number | null
          rationale?: string | null
          scenario?: Database["public"]["Enums"]["financial_plan_scenario"]
          source?: Database["public"]["Enums"]["financial_assumption_source"]
          unit?: string | null
          updated_at?: string
          value_json?: Json | null
          value_numeric?: number | null
          version_id?: string | null
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          key?: string
          last_validated_at?: string | null
          owner_user_id?: string | null
          period_index?: number | null
          rationale?: string | null
          scenario?: Database["public"]["Enums"]["financial_plan_scenario"]
          source?: Database["public"]["Enums"]["financial_assumption_source"]
          unit?: string | null
          updated_at?: string
          value_json?: Json | null
          value_numeric?: number | null
          version_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_assumptions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "financial_model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_assumptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_cell_map: {
        Row: {
          address: string
          created_at: string
          direction: string
          id: string
          metric_key: string
          notes: Json
          period_index: number | null
          period_kind: string | null
          schema_version: number
          sheet: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          direction: string
          id?: string
          metric_key: string
          notes?: Json
          period_index?: number | null
          period_kind?: string | null
          schema_version: number
          sheet: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          direction?: string
          id?: string
          metric_key?: string
          notes?: Json
          period_index?: number | null
          period_kind?: string | null
          schema_version?: number
          sheet?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      financial_model_metric_map: {
        Row: {
          created_at: string
          id: string
          kpi_definition_id: string | null
          metric_key: string
          program_id: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kpi_definition_id?: string | null
          metric_key: string
          program_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kpi_definition_id?: string | null
          metric_key?: string
          program_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_model_metric_map_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_model_metric_map_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_model_versions: {
        Row: {
          ai_review_generated_at: string | null
          ai_review_generated_by: string | null
          ai_review_json: Json | null
          content_sha256: string | null
          coverage_pct: number | null
          created_at: string
          document_id: string
          formula_cache_stale: boolean
          id: string
          key_metrics_json: Json | null
          parse_error: string | null
          parse_status: string | null
          parse_warnings: Json
          scenario_name: string
          snapshot_json: Json | null
          source_asset_id: string | null
          status: string
          template_schema_version: number | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          ai_review_generated_at?: string | null
          ai_review_generated_by?: string | null
          ai_review_json?: Json | null
          content_sha256?: string | null
          coverage_pct?: number | null
          created_at?: string
          document_id: string
          formula_cache_stale?: boolean
          id?: string
          key_metrics_json?: Json | null
          parse_error?: string | null
          parse_status?: string | null
          parse_warnings?: Json
          scenario_name?: string
          snapshot_json?: Json | null
          source_asset_id?: string | null
          status?: string
          template_schema_version?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          ai_review_generated_at?: string | null
          ai_review_generated_by?: string | null
          ai_review_json?: Json | null
          content_sha256?: string | null
          coverage_pct?: number | null
          created_at?: string
          document_id?: string
          formula_cache_stale?: boolean
          id?: string
          key_metrics_json?: Json | null
          parse_error?: string | null
          parse_status?: string | null
          parse_warnings?: Json
          scenario_name?: string
          snapshot_json?: Json | null
          source_asset_id?: string | null
          status?: string
          template_schema_version?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_model_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_model_versions_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "template_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_model_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_plan_sessions: {
        Row: {
          active_version_id: string | null
          completed_packs: string[]
          created_at: string
          created_by: string | null
          current_step: string
          diagnostic_json: Json
          id: string
          scenario: Database["public"]["Enums"]["financial_plan_scenario"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active_version_id?: string | null
          completed_packs?: string[]
          created_at?: string
          created_by?: string | null
          current_step?: string
          diagnostic_json?: Json
          id?: string
          scenario?: Database["public"]["Enums"]["financial_plan_scenario"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active_version_id?: string | null
          completed_packs?: string[]
          created_at?: string
          created_by?: string | null
          current_step?: string
          diagnostic_json?: Json
          id?: string
          scenario?: Database["public"]["Enums"]["financial_plan_scenario"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_plan_sessions_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "financial_model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_plan_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_prefill_proposals: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          key: string
          period_index: number | null
          proposed_value_json: Json | null
          proposed_value_numeric: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          scenario: Database["public"]["Enums"]["financial_plan_scenario"]
          source: Database["public"]["Enums"]["financial_assumption_source"]
          status: Database["public"]["Enums"]["financial_prefill_status"]
          unit: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          key: string
          period_index?: number | null
          proposed_value_json?: Json | null
          proposed_value_numeric?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario?: Database["public"]["Enums"]["financial_plan_scenario"]
          source: Database["public"]["Enums"]["financial_assumption_source"]
          status?: Database["public"]["Enums"]["financial_prefill_status"]
          unit?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          key?: string
          period_index?: number | null
          proposed_value_json?: Json | null
          proposed_value_numeric?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario?: Database["public"]["Enums"]["financial_plan_scenario"]
          source?: Database["public"]["Enums"]["financial_assumption_source"]
          status?: Database["public"]["Enums"]["financial_prefill_status"]
          unit?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_prefill_proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_maps: {
        Row: {
          created_at: string
          file_path: string
          floor: string | null
          id: string
          name: string
          space_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          floor?: string | null
          id?: string
          name: string
          space_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          floor?: string | null
          id?: string
          name?: string
          space_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floor_maps_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "office_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_staff_requests: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          request_type: string
          resolved_at: string | null
          resolved_by: string | null
          staff_notes: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          id?: string
          request_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          staff_notes?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          staff_notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "founder_staff_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_rounds: {
        Row: {
          announced_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          notes: string | null
          raised_amount: number | null
          round_type: string
          startup_id: string
          status: string
          target_amount: number | null
          updated_at: string
          valuation: number | null
        }
        Insert: {
          announced_at?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          raised_amount?: number | null
          round_type: string
          startup_id: string
          status?: string
          target_amount?: number | null
          updated_at?: string
          valuation?: number | null
        }
        Update: {
          announced_at?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          raised_amount?: number | null
          round_type?: string
          startup_id?: string
          status?: string
          target_amount?: number | null
          updated_at?: string
          valuation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_rounds_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_rounds_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_events: {
        Row: {
          created_at: string
          event_type: string
          from_stage: string | null
          funnel_item_id: string
          id: string
          metadata: Json | null
          performed_by: string | null
          to_stage: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          from_stage?: string | null
          funnel_item_id: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          to_stage?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          from_stage?: string | null
          funnel_item_id?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          to_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_events_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_items: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_at: string | null
          created_at: string
          deal_currency: string | null
          deal_value: number | null
          expected_close_date: string | null
          first_contact_at: string | null
          hubspot_company_id: string | null
          hubspot_deal_id: string | null
          id: string
          last_activity_at: string | null
          linked_contract_id: string | null
          linked_startup_id: string | null
          linked_workspace_id: string | null
          loss_reason: string | null
          metadata_json: Json
          next_action_at: string | null
          next_action_description: string | null
          nif_normalized: string | null
          notes: string | null
          organization_name: string | null
          owner_consultant_id: string | null
          phc_customer_id: string | null
          program_id: string | null
          qualified_at: string | null
          source: string | null
          source_system: string | null
          source_updated_at: string | null
          stage: string
          tags: string[] | null
          type: string
          updated_at: string
          verified_fields_json: Json
          win_probability: number | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_at?: string | null
          created_at?: string
          deal_currency?: string | null
          deal_value?: number | null
          expected_close_date?: string | null
          first_contact_at?: string | null
          hubspot_company_id?: string | null
          hubspot_deal_id?: string | null
          id?: string
          last_activity_at?: string | null
          linked_contract_id?: string | null
          linked_startup_id?: string | null
          linked_workspace_id?: string | null
          loss_reason?: string | null
          metadata_json?: Json
          next_action_at?: string | null
          next_action_description?: string | null
          nif_normalized?: string | null
          notes?: string | null
          organization_name?: string | null
          owner_consultant_id?: string | null
          phc_customer_id?: string | null
          program_id?: string | null
          qualified_at?: string | null
          source?: string | null
          source_system?: string | null
          source_updated_at?: string | null
          stage?: string
          tags?: string[] | null
          type?: string
          updated_at?: string
          verified_fields_json?: Json
          win_probability?: number | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_at?: string | null
          created_at?: string
          deal_currency?: string | null
          deal_value?: number | null
          expected_close_date?: string | null
          first_contact_at?: string | null
          hubspot_company_id?: string | null
          hubspot_deal_id?: string | null
          id?: string
          last_activity_at?: string | null
          linked_contract_id?: string | null
          linked_startup_id?: string | null
          linked_workspace_id?: string | null
          loss_reason?: string | null
          metadata_json?: Json
          next_action_at?: string | null
          next_action_description?: string | null
          nif_normalized?: string | null
          notes?: string | null
          organization_name?: string | null
          owner_consultant_id?: string | null
          phc_customer_id?: string | null
          program_id?: string | null
          qualified_at?: string | null
          source?: string | null
          source_system?: string | null
          source_updated_at?: string | null
          stage?: string
          tags?: string[] | null
          type?: string
          updated_at?: string
          verified_fields_json?: Json
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_items_linked_contract_id_fkey"
            columns: ["linked_contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_items_linked_contract_id_fkey"
            columns: ["linked_contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_items_linked_startup_id_fkey"
            columns: ["linked_startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_items_linked_startup_id_fkey"
            columns: ["linked_startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_items_linked_workspace_id_fkey"
            columns: ["linked_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      global_integration_settings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          integration_type: string
          is_enabled: boolean
          settings_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          integration_type: string
          is_enabled?: boolean
          settings_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          integration_type?: string
          is_enabled?: boolean
          settings_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      health_model_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          thresholds_json: Json
          updated_at: string
          weights_json: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          thresholds_json?: Json
          updated_at?: string
          weights_json?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          thresholds_json?: Json
          updated_at?: string
          weights_json?: Json
        }
        Relationships: []
      }
      incubation_types: {
        Row: {
          base_currency: string | null
          base_monthly_fee: number | null
          contract_type: string | null
          created_at: string
          description: string | null
          duration_months: number | null
          equity_percentage: number | null
          id: string
          includes_meeting_room_hours: number | null
          includes_mentoring_hours: number | null
          includes_office_space: boolean | null
          is_active: boolean | null
          is_virtual: boolean | null
          name: string
          price_per_sqm: number | null
          requires_space: boolean | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          base_currency?: string | null
          base_monthly_fee?: number | null
          contract_type?: string | null
          created_at?: string
          description?: string | null
          duration_months?: number | null
          equity_percentage?: number | null
          id?: string
          includes_meeting_room_hours?: number | null
          includes_mentoring_hours?: number | null
          includes_office_space?: boolean | null
          is_active?: boolean | null
          is_virtual?: boolean | null
          name: string
          price_per_sqm?: number | null
          requires_space?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          base_currency?: string | null
          base_monthly_fee?: number | null
          contract_type?: string | null
          created_at?: string
          description?: string | null
          duration_months?: number | null
          equity_percentage?: number | null
          id?: string
          includes_meeting_room_hours?: number | null
          includes_mentoring_hours?: number | null
          includes_office_space?: boolean | null
          is_active?: boolean | null
          is_virtual?: boolean | null
          name?: string
          price_per_sqm?: number | null
          requires_space?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      intake_events: {
        Row: {
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          intake_id: string
          metadata: Json | null
          performed_by: string | null
          to_status: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          intake_id: string
          metadata?: Json | null
          performed_by?: string | null
          to_status?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          intake_id?: string
          metadata?: Json | null
          performed_by?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "contract_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "contract_intakes_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_routing: {
        Row: {
          active: boolean
          consultant_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          mode: string
          program_id: string | null
          round_robin_index: number
          scope: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          consultant_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          program_id?: string | null
          round_robin_index?: number
          scope?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          consultant_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          program_id?: string | null
          round_robin_index?: number
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_routing_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_readiness_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          program_id: string | null
          sort_order: number
          stage: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          program_id?: string | null
          sort_order?: number
          stage: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          program_id?: string | null
          sort_order?: number
          stage?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_readiness_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_update_templates: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sections_json: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sections_json?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sections_json?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      investor_updates: {
        Row: {
          content_json: Json
          created_at: string
          generated_by: string | null
          id: string
          month: string
          sent_at: string | null
          sent_to: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_json?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          month: string
          sent_at?: string | null
          sent_to?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          month?: string
          sent_at?: string | null
          sent_to?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_updates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          startup_id: string
          status: string
          type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          startup_id: string
          status?: string
          type?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          startup_id?: string
          status?: string
          type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investors_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investors_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          reminder_sent_at: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number | null
          total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          line_items?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          reminder_sent_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal: number
          tax_amount: number
          tax_rate?: number | null
          total: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          reminder_sent_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number | null
          total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          direction: string | null
          id: string
          is_global: boolean
          name: string
          program_id: string | null
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          id?: string
          is_global?: boolean
          name: string
          program_id?: string | null
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          id?: string
          is_global?: boolean
          name?: string
          program_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_values: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kpi_definition_id: string
          locked_by_source: boolean
          notes: string | null
          period_month: string
          source_ref_id: string | null
          source_type: string
          target_value: number | null
          updated_at: string
          value: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_definition_id: string
          locked_by_source?: boolean
          notes?: string | null
          period_month: string
          source_ref_id?: string | null
          source_type?: string
          target_value?: number | null
          updated_at?: string
          value?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_definition_id?: string
          locked_by_source?: boolean
          notes?: string | null
          period_month?: string
          source_ref_id?: string | null
          source_type?: string
          target_value?: number | null
          updated_at?: string
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_entries_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_values_source_ref_fkey"
            columns: ["source_ref_id"]
            isOneToOne: false
            referencedRelation: "financial_model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          mentor_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          mentor_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          mentor_id?: string
          start_time?: string
        }
        Relationships: []
      }
      mentor_bookings: {
        Row: {
          created_at: string
          founder_id: string
          id: string
          mentor_id: string
          message: string | null
          requested_date: string
          requested_end_time: string
          requested_start_time: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          founder_id: string
          id?: string
          mentor_id: string
          message?: string | null
          requested_date: string
          requested_end_time: string
          requested_start_time: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          founder_id?: string
          id?: string
          mentor_id?: string
          message?: string | null
          requested_date?: string
          requested_end_time?: string
          requested_start_time?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_connections: {
        Row: {
          created_at: string
          founder_id: string
          id: string
          mentor_id: string
          message: string | null
          responded_at: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          founder_id: string
          id?: string
          mentor_id: string
          message?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          founder_id?: string
          id?: string
          mentor_id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      mentor_nda_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip_hash: string | null
          nda_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_hash?: string | null
          nda_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_hash?: string | null
          nda_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mentor_requests: {
        Row: {
          assigned_mentor_id: string | null
          created_at: string
          description: string | null
          expertise_tags: string[]
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          requested_by: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_mentor_id?: string | null
          created_at?: string
          description?: string | null
          expertise_tags?: string[]
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          requested_by: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_mentor_id?: string | null
          created_at?: string
          description?: string | null
          expertise_tags?: string[]
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          requested_by?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          search_vector: unknown
          sender_id: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          search_vector?: unknown
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          search_vector?: unknown
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_reminders: {
        Row: {
          days_before: number
          id: string
          milestone_id: string
          reminder_type: string
          sent_at: string
          workspace_id: string
        }
        Insert: {
          days_before: number
          id?: string
          milestone_id: string
          reminder_type: string
          sent_at?: string
          workspace_id: string
        }
        Update: {
          days_before?: number
          id?: string
          milestone_id?: string
          reminder_type?: string
          sent_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_reminders_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          position: number | null
          search_vector: unknown
          source_gate_id: string | null
          source_week_id: string | null
          status: Database["public"]["Enums"]["milestone_status"]
          target_date: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          position?: number | null
          search_vector?: unknown
          source_gate_id?: string | null
          source_week_id?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          target_date?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          position?: number | null
          search_vector?: unknown
          source_gate_id?: string | null
          source_week_id?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_source_gate_id_fkey"
            columns: ["source_gate_id"]
            isOneToOne: false
            referencedRelation: "program_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_source_week_id_fkey"
            columns: ["source_week_id"]
            isOneToOne: false
            referencedRelation: "program_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          calendar_sync_enabled: boolean | null
          created_at: string
          digest_day: number | null
          digest_frequency: string | null
          email_digest_enabled: boolean | null
          email_on_health_drop: boolean | null
          id: string
          last_digest_sent_at: string | null
          milestone_reminder_days: number | null
          milestone_reminders_enabled: boolean | null
          slack_enabled: boolean | null
          slack_webhook_url: string | null
          updated_at: string
          user_id: string
          weekly_health_digest: boolean | null
        }
        Insert: {
          calendar_sync_enabled?: boolean | null
          created_at?: string
          digest_day?: number | null
          digest_frequency?: string | null
          email_digest_enabled?: boolean | null
          email_on_health_drop?: boolean | null
          id?: string
          last_digest_sent_at?: string | null
          milestone_reminder_days?: number | null
          milestone_reminders_enabled?: boolean | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          updated_at?: string
          user_id: string
          weekly_health_digest?: boolean | null
        }
        Update: {
          calendar_sync_enabled?: boolean | null
          created_at?: string
          digest_day?: number | null
          digest_frequency?: string | null
          email_digest_enabled?: boolean | null
          email_on_health_drop?: boolean | null
          id?: string
          last_digest_sent_at?: string | null
          milestone_reminder_days?: number | null
          milestone_reminders_enabled?: boolean | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          updated_at?: string
          user_id?: string
          weekly_health_digest?: boolean | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_key: string | null
          id: string
          link: string | null
          message: string | null
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_key?: string | null
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_key?: string | null
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      office_spaces: {
        Row: {
          amenities: Json | null
          building_id: string | null
          capacity: number | null
          created_at: string
          floor: string | null
          id: string
          is_available: boolean | null
          monthly_cost: number | null
          name: string
          notes: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amenities?: Json | null
          building_id?: string | null
          capacity?: number | null
          created_at?: string
          floor?: string | null
          id?: string
          is_available?: boolean | null
          monthly_cost?: number | null
          name: string
          notes?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amenities?: Json | null
          building_id?: string | null
          capacity?: number | null
          created_at?: string
          floor?: string | null
          id?: string
          is_available?: boolean | null
          monthly_cost?: number | null
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_spaces_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      outlook_calendar_settings: {
        Row: {
          calendar_user_email: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          graph_client_id: string | null
          graph_tenant_id: string | null
          id: string
          sync_mode: string
          updated_at: string
          use_custom_calendar_email: boolean
          webhook_url: string | null
          workspace_id: string
        }
        Insert: {
          calendar_user_email?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          graph_client_id?: string | null
          graph_tenant_id?: string | null
          id?: string
          sync_mode?: string
          updated_at?: string
          use_custom_calendar_email?: boolean
          webhook_url?: string | null
          workspace_id: string
        }
        Update: {
          calendar_user_email?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          graph_client_id?: string | null
          graph_tenant_id?: string | null
          id?: string
          sync_mode?: string
          updated_at?: string
          use_custom_calendar_email?: boolean
          webhook_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlook_calendar_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          recorded_by: string | null
          reference: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
          recorded_by?: string | null
          reference?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          recorded_by?: string | null
          reference?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_items: {
        Row: {
          created_at: string
          default_owner_role: string | null
          description: string | null
          id: string
          item_type: string
          metadata_json: Json | null
          order_index: number
          playbook_id: string
          priority: string | null
          relative_due_days: number | null
          title: string
        }
        Insert: {
          created_at?: string
          default_owner_role?: string | null
          description?: string | null
          id?: string
          item_type: string
          metadata_json?: Json | null
          order_index?: number
          playbook_id: string
          priority?: string | null
          relative_due_days?: number | null
          title: string
        }
        Update: {
          created_at?: string
          default_owner_role?: string | null
          description?: string | null
          id?: string
          item_type?: string
          metadata_json?: Json | null
          order_index?: number
          playbook_id?: string
          priority?: string | null
          relative_due_days?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_items_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_step_evidence: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          notes: string | null
          playbook_item_id: string
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_by: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          id?: string
          notes?: string | null
          playbook_item_id: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_by: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          id?: string
          notes?: string | null
          playbook_item_id?: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_by?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_step_evidence_playbook_item_id_fkey"
            columns: ["playbook_item_id"]
            isOneToOne: false
            referencedRelation: "playbook_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_step_evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_template_assignments: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_required: boolean | null
          order_index: number | null
          playbook_id: string
          template_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_required?: boolean | null
          order_index?: number | null
          playbook_id: string
          template_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_required?: boolean | null
          order_index?: number | null
          playbook_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_template_assignments_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_template_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          program_id: string | null
          stage: Database["public"]["Enums"]["startup_stage"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          program_id?: string | null
          stage: Database["public"]["Enums"]["startup_stage"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          program_id?: string | null
          stage?: Database["public"]["Enums"]["startup_stage"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_lines: {
        Row: {
          area_sqm: number | null
          billing_frequency: string | null
          created_at: string | null
          designation: string
          id: string
          incubation_type_id: string | null
          is_per_sqm: boolean | null
          is_post_incubation: boolean | null
          location_type: string | null
          max_duration_months: number | null
          non_startup_annual_increase_pct: number | null
          non_startup_monthly_fee: number | null
          notes: string | null
          pricing_version_id: string
          services_description: string | null
          sort_order: number | null
          startup_annual_increase_pct: number | null
          startup_monthly_fee: number
        }
        Insert: {
          area_sqm?: number | null
          billing_frequency?: string | null
          created_at?: string | null
          designation: string
          id?: string
          incubation_type_id?: string | null
          is_per_sqm?: boolean | null
          is_post_incubation?: boolean | null
          location_type?: string | null
          max_duration_months?: number | null
          non_startup_annual_increase_pct?: number | null
          non_startup_monthly_fee?: number | null
          notes?: string | null
          pricing_version_id: string
          services_description?: string | null
          sort_order?: number | null
          startup_annual_increase_pct?: number | null
          startup_monthly_fee?: number
        }
        Update: {
          area_sqm?: number | null
          billing_frequency?: string | null
          created_at?: string | null
          designation?: string
          id?: string
          incubation_type_id?: string | null
          is_per_sqm?: boolean | null
          is_post_incubation?: boolean | null
          location_type?: string | null
          max_duration_months?: number | null
          non_startup_annual_increase_pct?: number | null
          non_startup_monthly_fee?: number | null
          notes?: string | null
          pricing_version_id?: string
          services_description?: string | null
          sort_order?: number | null
          startup_annual_increase_pct?: number | null
          startup_monthly_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_lines_incubation_type_id_fkey"
            columns: ["incubation_type_id"]
            isOneToOne: false
            referencedRelation: "incubation_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_lines_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: false
            referencedRelation: "pricing_table_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_table_versions: {
        Row: {
          approved_by: string | null
          created_at: string | null
          effective_date: string
          id: string
          is_current: boolean | null
          notes: string | null
          regulation_reference: string | null
          updated_at: string | null
          version_code: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          effective_date: string
          id?: string
          is_current?: boolean | null
          notes?: string | null
          regulation_reference?: string | null
          updated_at?: string | null
          version_code: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          effective_date?: string
          id?: string
          is_current?: boolean | null
          notes?: string | null
          regulation_reference?: string | null
          updated_at?: string | null
          version_code?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"] | null
          avatar_url: string | null
          bio: string | null
          calendar_feed_token: string | null
          calendar_token_expires_at: string | null
          created_at: string
          dismissed_prompts: Json
          email: string
          expertise: string[] | null
          full_name: string | null
          has_seen_welcome_wizard: boolean
          id: string
          linkedin_url: string | null
          mentor_monthly_target_hours: number
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          avatar_url?: string | null
          bio?: string | null
          calendar_feed_token?: string | null
          calendar_token_expires_at?: string | null
          created_at?: string
          dismissed_prompts?: Json
          email: string
          expertise?: string[] | null
          full_name?: string | null
          has_seen_welcome_wizard?: boolean
          id: string
          linkedin_url?: string | null
          mentor_monthly_target_hours?: number
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          avatar_url?: string | null
          bio?: string | null
          calendar_feed_token?: string | null
          calendar_token_expires_at?: string | null
          created_at?: string
          dismissed_prompts?: Json
          email?: string
          expertise?: string[] | null
          full_name?: string | null
          has_seen_welcome_wizard?: boolean
          id?: string
          linkedin_url?: string | null
          mentor_monthly_target_hours?: number
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_alert_rules: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          program_id: string
          rule_type: string
          severity: string
          threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          program_id: string
          rule_type: string
          severity?: string
          threshold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          program_id?: string
          rule_type?: string
          severity?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_alert_rules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_core_kpis: {
        Row: {
          created_at: string
          id: string
          kpi_definition_id: string
          order_index: number
          program_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kpi_definition_id: string
          order_index?: number
          program_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kpi_definition_id?: string
          order_index?: number
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_core_kpis_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_core_kpis_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_gates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          program_id: string
          sort_order: number
          target_end_week: number | null
          target_start_week: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          program_id: string
          sort_order?: number
          target_end_week?: number | null
          target_start_week?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          program_id?: string
          sort_order?: number
          target_end_week?: number | null
          target_start_week?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_gates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_health_model: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          program_id: string
          thresholds_json: Json
          updated_at: string
          weights_json: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          program_id: string
          thresholds_json?: Json
          updated_at?: string
          weights_json?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          program_id?: string
          thresholds_json?: Json
          updated_at?: string
          weights_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "program_health_model_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_health_model_versions: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          note: string | null
          program_id: string
          thresholds_json: Json
          weights_json: Json
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          note?: string | null
          program_id: string
          thresholds_json: Json
          weights_json: Json
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          note?: string | null
          program_id?: string
          thresholds_json?: Json
          weights_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "program_health_model_versions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_setup_drafts: {
        Row: {
          created_at: string
          created_by: string
          draft_json: Json
          id: string
          last_publish_error: string | null
          last_publish_failed_at: string | null
          last_publish_rollback_status: string | null
          program_id: string | null
          program_snapshot_json: Json | null
          revision: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          draft_json?: Json
          id?: string
          last_publish_error?: string | null
          last_publish_failed_at?: string | null
          last_publish_rollback_status?: string | null
          program_id?: string | null
          program_snapshot_json?: Json | null
          revision?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          draft_json?: Json
          id?: string
          last_publish_error?: string | null
          last_publish_failed_at?: string | null
          last_publish_rollback_status?: string | null
          program_id?: string | null
          program_snapshot_json?: Json | null
          revision?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_setup_drafts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_weeks: {
        Row: {
          created_at: string
          deliverables_json: Json
          description: string | null
          gate_id: string | null
          id: string
          meeting_url: string | null
          program_id: string
          scheduled_at: string | null
          title: string
          updated_at: string
          week_number: number
        }
        Insert: {
          created_at?: string
          deliverables_json?: Json
          description?: string | null
          gate_id?: string | null
          id?: string
          meeting_url?: string | null
          program_id: string
          scheduled_at?: string | null
          title: string
          updated_at?: string
          week_number: number
        }
        Update: {
          created_at?: string
          deliverables_json?: Json
          description?: string | null
          gate_id?: string | null
          id?: string
          meeting_url?: string | null
          program_id?: string
          scheduled_at?: string | null
          title?: string
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_weeks_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "program_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_weeks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          program_type: Database["public"]["Enums"]["program_type"]
          settings_json: Json | null
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          program_type?: Database["public"]["Enums"]["program_type"]
          settings_json?: Json | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          program_type?: Database["public"]["Enums"]["program_type"]
          settings_json?: Json | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_booking_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          intake_route_id: string | null
          owner_consultant_id: string | null
          owner_email: string | null
          program_id: string | null
          token_hash: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          intake_route_id?: string | null
          owner_consultant_id?: string | null
          owner_email?: string | null
          program_id?: string | null
          token_hash: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          intake_route_id?: string | null
          owner_consultant_id?: string | null
          owner_email?: string | null
          program_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_booking_links_intake_route_id_fkey"
            columns: ["intake_route_id"]
            isOneToOne: false
            referencedRelation: "intake_routing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_booking_links_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_check_results: {
        Row: {
          coach_hints: Json | null
          computed_at: string
          computed_by: string | null
          entity_id: string
          entity_type: string
          id: string
          missing_items: Json | null
          passed_items: Json | null
          score: number | null
        }
        Insert: {
          coach_hints?: Json | null
          computed_at?: string
          computed_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          missing_items?: Json | null
          passed_items?: Json | null
          score?: number | null
        }
        Update: {
          coach_hints?: Json | null
          computed_at?: string
          computed_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          missing_items?: Json | null
          passed_items?: Json | null
          score?: number | null
        }
        Relationships: []
      }
      quality_checks_config: {
        Row: {
          check_function: string | null
          created_at: string
          criteria_key: string
          description: string | null
          entity_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          label: string
          program_id: string | null
          weight: number | null
        }
        Insert: {
          check_function?: string | null
          created_at?: string
          criteria_key: string
          description?: string | null
          entity_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label: string
          program_id?: string | null
          weight?: number | null
        }
        Update: {
          check_function?: string | null
          created_at?: string
          criteria_key?: string
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label?: string
          program_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_checks_config_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_recaps: {
        Row: {
          created_at: string
          funnel_item_id: string | null
          generated_at: string
          generated_by: string | null
          id: string
          items_analyzed: number
          key_points: Json
          language: string
          next_best_actions: Json
          open_loops: Json
          risks: Json
          summary: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          funnel_item_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          items_analyzed?: number
          key_points?: Json
          language?: string
          next_best_actions?: Json
          open_loops?: Json
          risks?: Json
          summary: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          funnel_item_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          items_analyzed?: number
          key_points?: Json
          language?: string
          next_best_actions?: Json
          open_loops?: Json
          risks?: Json
          summary?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationship_recaps_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_recaps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_jobs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          job_type: string
          last_run_at: string | null
          metadata: Json | null
          next_run_at: string | null
          schedule: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type: string
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          schedule?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type?: string
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          schedule?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          file_path: string | null
          id: string
          is_global: boolean | null
          program_id: string | null
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_path?: string | null
          id?: string
          is_global?: boolean | null
          program_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_path?: string | null
          id?: string
          is_global?: boolean | null
          program_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      ritual_instances: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          due_at: string
          id: string
          program_id: string | null
          ritual_type: string
          status: string
          summary: string | null
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_at: string
          id?: string
          program_id?: string | null
          ritual_type: string
          status?: string
          summary?: string | null
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_at?: string
          id?: string
          program_id?: string | null
          ritual_type?: string
          status?: string
          summary?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ritual_instances_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ritual_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      room_allocations: {
        Row: {
          allocation_type: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          funnel_item_id: string | null
          id: string
          notes: string | null
          room_id: string
          start_date: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          allocation_type?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          funnel_item_id?: string | null
          id?: string
          notes?: string | null
          room_id: string
          start_date: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          allocation_type?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          funnel_item_id?: string | null
          id?: string
          notes?: string | null
          room_id?: string
          start_date?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_allocations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_allocations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_allocations_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_allocations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          amenities: string[] | null
          building_id: string | null
          capacity: number | null
          created_at: string
          floor: string | null
          floor_map_id: string | null
          id: string
          name: string
          notes: string | null
          pin_x: number | null
          pin_y: number | null
          room_number: string | null
          room_type: string
          shape_json: Json | null
          shape_type: string | null
          space_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amenities?: string[] | null
          building_id?: string | null
          capacity?: number | null
          created_at?: string
          floor?: string | null
          floor_map_id?: string | null
          id?: string
          name: string
          notes?: string | null
          pin_x?: number | null
          pin_y?: number | null
          room_number?: string | null
          room_type?: string
          shape_json?: Json | null
          shape_type?: string | null
          space_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amenities?: string[] | null
          building_id?: string | null
          capacity?: number | null
          created_at?: string
          floor?: string | null
          floor_map_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          pin_x?: number | null
          pin_y?: number | null
          room_number?: string | null
          room_type?: string
          shape_json?: Json | null
          shape_type?: string | null
          space_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_floor_map_id_fkey"
            columns: ["floor_map_id"]
            isOneToOne: false
            referencedRelation: "floor_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "office_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_filters: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_programme_map: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          programme_id: string | null
          service_classification: string
          service_name: string
          service_name_normalized: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          programme_id?: string | null
          service_classification: string
          service_name: string
          service_name_normalized?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          programme_id?: string | null
          service_classification?: string
          service_name?: string
          service_name_normalized?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_programme_map_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_programme_map_history: {
        Row: {
          actor: string | null
          after_snapshot: Json | null
          before_snapshot: Json | null
          changed_at: string
          id: string
          map_id: string | null
          operation: string
          service_name: string
        }
        Insert: {
          actor?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          changed_at?: string
          id?: string
          map_id?: string | null
          operation: string
          service_name: string
        }
        Update: {
          actor?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          changed_at?: string
          id?: string
          map_id?: string | null
          operation?: string
          service_name?: string
        }
        Relationships: []
      }
      session_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          order_index: number | null
          session_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          order_index?: number | null
          session_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_feedback: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          is_public: boolean | null
          rating: number
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          is_public?: boolean | null
          rating: number
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          is_public?: boolean | null
          rating?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          attendance_status: string
          created_at: string
          id: string
          role: string | null
          session_id: string
          source: string | null
          user_id: string
        }
        Insert: {
          attendance_status?: string
          created_at?: string
          id?: string
          role?: string | null
          session_id: string
          source?: string | null
          user_id: string
        }
        Update: {
          attendance_status?: string
          created_at?: string
          id?: string
          role?: string | null
          session_id?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_tags: {
        Row: {
          created_at: string
          session_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          session_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          session_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_tags_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      session_templates: {
        Row: {
          agenda_template: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_global: boolean
          name: string
          notes_template: string | null
          program_id: string | null
        }
        Insert: {
          agenda_template?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
          notes_template?: string | null
          program_id?: string | null
        }
        Update: {
          agenda_template?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
          notes_template?: string | null
          program_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_templates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      session_transcripts: {
        Row: {
          created_at: string | null
          id: string
          session_id: string
          source: string | null
          transcript_text: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_id: string
          source?: string | null
          transcript_text?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          session_id?: string
          source?: string | null
          transcript_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_transcripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_workflow_state: {
        Row: {
          actions_done: boolean | null
          completed_at: string | null
          created_at: string
          decisions_done: boolean | null
          followup_sent: boolean | null
          next_session_planned: boolean | null
          risks_done: boolean | null
          session_id: string
          updated_at: string
        }
        Insert: {
          actions_done?: boolean | null
          completed_at?: string | null
          created_at?: string
          decisions_done?: boolean | null
          followup_sent?: boolean | null
          next_session_planned?: boolean | null
          risks_done?: boolean | null
          session_id: string
          updated_at?: string
        }
        Update: {
          actions_done?: boolean | null
          completed_at?: string | null
          created_at?: string
          decisions_done?: boolean | null
          followup_sent?: boolean | null
          next_session_planned?: boolean | null
          risks_done?: boolean | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_workflow_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          actual_duration_minutes: number | null
          agenda: string | null
          ai_action_suggestions: Json | null
          ai_decisions: Json | null
          ai_generated_at: string | null
          ai_generated_by: string | null
          ai_kpi_prompts: Json | null
          ai_risks: Json | null
          ai_summary: string | null
          cancellation_reason: string | null
          completed_at: string | null
          completion_idempotency_key: string | null
          created_at: string
          created_by: string | null
          decisions: string | null
          duration: number | null
          id: string
          join_url: string | null
          location: string | null
          notes: string | null
          outlook_event_id: string | null
          outlook_owner_email: string | null
          outlook_sync_error: string | null
          outlook_sync_status: string | null
          outlook_synced_at: string | null
          primary_consultant_id: string | null
          raw_transcript: string | null
          scheduled_at: string
          search_vector: unknown
          session_template_id: string | null
          session_type: string | null
          source: string | null
          status: string
          teams_meeting_url: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_duration_minutes?: number | null
          agenda?: string | null
          ai_action_suggestions?: Json | null
          ai_decisions?: Json | null
          ai_generated_at?: string | null
          ai_generated_by?: string | null
          ai_kpi_prompts?: Json | null
          ai_risks?: Json | null
          ai_summary?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          completion_idempotency_key?: string | null
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration?: number | null
          id?: string
          join_url?: string | null
          location?: string | null
          notes?: string | null
          outlook_event_id?: string | null
          outlook_owner_email?: string | null
          outlook_sync_error?: string | null
          outlook_sync_status?: string | null
          outlook_synced_at?: string | null
          primary_consultant_id?: string | null
          raw_transcript?: string | null
          scheduled_at: string
          search_vector?: unknown
          session_template_id?: string | null
          session_type?: string | null
          source?: string | null
          status?: string
          teams_meeting_url?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_duration_minutes?: number | null
          agenda?: string | null
          ai_action_suggestions?: Json | null
          ai_decisions?: Json | null
          ai_generated_at?: string | null
          ai_generated_by?: string | null
          ai_kpi_prompts?: Json | null
          ai_risks?: Json | null
          ai_summary?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          completion_idempotency_key?: string | null
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration?: number | null
          id?: string
          join_url?: string | null
          location?: string | null
          notes?: string | null
          outlook_event_id?: string | null
          outlook_owner_email?: string | null
          outlook_sync_error?: string | null
          outlook_sync_status?: string | null
          outlook_synced_at?: string | null
          primary_consultant_id?: string | null
          raw_transcript?: string | null
          scheduled_at?: string
          search_vector?: unknown
          session_template_id?: string | null
          session_type?: string | null
          source?: string | null
          status?: string
          teams_meeting_url?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions_backfill_quarantine: {
        Row: {
          before_actual_duration_minutes: number | null
          before_completed_at: string | null
          before_status: string | null
          id: string
          planned_duration: number | null
          quarantined_at: string
          reason: string
          scheduled_at: string | null
          session_id: string
          workspace_id: string | null
        }
        Insert: {
          before_actual_duration_minutes?: number | null
          before_completed_at?: string | null
          before_status?: string | null
          id?: string
          planned_duration?: number | null
          quarantined_at?: string
          reason?: string
          scheduled_at?: string | null
          session_id: string
          workspace_id?: string | null
        }
        Update: {
          before_actual_duration_minutes?: number | null
          before_completed_at?: string | null
          before_status?: string | null
          id?: string
          planned_duration?: number | null
          quarantined_at?: string
          reason?: string
          scheduled_at?: string | null
          session_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_viewed_at: string | null
          revoked_at: string | null
          scope: string
          token_hash: string
          views_count: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash: string
          views_count?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          views_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_allowlist: {
        Row: {
          added_by: string | null
          created_at: string | null
          domain: string | null
          email: string | null
          id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          domain?: string | null
          email?: string | null
          id?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          domain?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      space_allocations: {
        Row: {
          allocated_by: string | null
          building_id: string | null
          created_at: string
          end_date: string | null
          id: string
          monthly_cost_override: number | null
          notes: string | null
          office_space_id: string
          start_date: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allocated_by?: string | null
          building_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_cost_override?: number | null
          notes?: string | null
          office_space_id: string
          start_date: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allocated_by?: string | null
          building_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_cost_override?: number | null
          notes?: string | null
          office_space_id?: string
          start_date?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_allocations_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_allocations_office_space_id_fkey"
            columns: ["office_space_id"]
            isOneToOne: false
            referencedRelation: "office_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_waiting_list: {
        Row: {
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          funnel_item_id: string | null
          id: string
          notes: string | null
          offered_room_id: string | null
          preferred_capacity: number | null
          preferred_space_id: string | null
          priority: number
          request_type: string
          requested_at: string
          requested_by: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          funnel_item_id?: string | null
          id?: string
          notes?: string | null
          offered_room_id?: string | null
          preferred_capacity?: number | null
          preferred_space_id?: string | null
          priority?: number
          request_type?: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          funnel_item_id?: string | null
          id?: string
          notes?: string | null
          offered_room_id?: string | null
          preferred_capacity?: number | null
          preferred_space_id?: string | null
          priority?: number
          request_type?: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_waiting_list_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_waiting_list_offered_room_id_fkey"
            columns: ["offered_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_waiting_list_preferred_space_id_fkey"
            columns: ["preferred_space_id"]
            isOneToOne: false
            referencedRelation: "office_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_waiting_list_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_tasks: {
        Row: {
          assignee_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          priority: string | null
          related_startup_id: string | null
          related_user_id: string | null
          source_rule_id: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          assignee_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          related_startup_id?: string | null
          related_user_id?: string | null
          source_rule_id?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          assignee_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          related_startup_id?: string | null
          related_user_id?: string | null
          source_rule_id?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_tasks_related_startup_id_fkey"
            columns: ["related_startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tasks_related_startup_id_fkey"
            columns: ["related_startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tasks_source_rule_id_fkey"
            columns: ["source_rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_work_queue_items: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          evidence_json: Json | null
          id: string
          priority: string
          related_action_id: string | null
          related_milestone_id: string | null
          related_session_id: string | null
          snoozed_until: string | null
          status: string
          title: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          evidence_json?: Json | null
          id?: string
          priority?: string
          related_action_id?: string | null
          related_milestone_id?: string | null
          related_session_id?: string | null
          snoozed_until?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          evidence_json?: Json | null
          id?: string
          priority?: string
          related_action_id?: string | null
          related_milestone_id?: string | null
          related_session_id?: string | null
          snoozed_until?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_work_queue_items_related_action_id_fkey"
            columns: ["related_action_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_queue_items_related_milestone_id_fkey"
            columns: ["related_milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_queue_items_related_session_id_fkey"
            columns: ["related_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_queue_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_gate_criteria: {
        Row: {
          created_at: string
          criteria_json: Json
          id: string
          program_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria_json?: Json
          id?: string
          program_id: string
          stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria_json?: Json
          id?: string
          program_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_gate_criteria_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_gate_reviews: {
        Row: {
          conditions: string | null
          created_at: string
          evidence_json: Json | null
          from_stage: string
          id: string
          requested_at: string | null
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          to_stage: string
          workspace_id: string
        }
        Insert: {
          conditions?: string | null
          created_at?: string
          evidence_json?: Json | null
          from_stage: string
          id?: string
          requested_at?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_stage: string
          workspace_id: string
        }
        Update: {
          conditions?: string | null
          created_at?: string
          evidence_json?: Json | null
          from_stage?: string
          id?: string
          requested_at?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_stage?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_gate_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: string
          notes: string | null
          to_stage: string
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          to_stage: string
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          to_stage?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_kpi_defaults: {
        Row: {
          created_at: string
          id: string
          kpi_definition_id: string
          order_index: number | null
          program_id: string | null
          required: boolean
          stage: Database["public"]["Enums"]["startup_stage"]
          target_value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          kpi_definition_id: string
          order_index?: number | null
          program_id?: string | null
          required?: boolean
          stage: Database["public"]["Enums"]["startup_stage"]
          target_value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          kpi_definition_id?: string
          order_index?: number | null
          program_id?: string | null
          required?: boolean
          stage?: Database["public"]["Enums"]["startup_stage"]
          target_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_kpi_defaults_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_kpi_defaults_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          order_index: number
          position: number
          program_id: string
          stage_key: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          order_index?: number
          position?: number
          program_id: string
          stage_key?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          order_index?: number
          position?: number
          program_id?: string
          stage_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stages_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_change_requests: {
        Row: {
          applied_at: string | null
          applied_automatically: boolean
          created_at: string
          current_value_json: Json | null
          field_key: string
          field_label: string
          id: string
          justification: string | null
          requested_by: string
          requested_value_json: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          startup_id: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_automatically?: boolean
          created_at?: string
          current_value_json?: Json | null
          field_key: string
          field_label: string
          id?: string
          justification?: string | null
          requested_by: string
          requested_value_json: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startup_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_automatically?: boolean
          created_at?: string
          current_value_json?: Json | null
          field_key?: string
          field_label?: string
          id?: string
          justification?: string | null
          requested_by?: string
          requested_value_json?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startup_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_change_requests_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_change_requests_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_change_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_claim_requests: {
        Row: {
          created_at: string | null
          id: string
          match_method: string | null
          notes: string | null
          requested_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          startup_id: string | null
          status: string
          user_email: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          match_method?: string | null
          notes?: string | null
          requested_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          startup_id?: string | null
          status?: string
          user_email?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          match_method?: string | null
          notes?: string | null
          requested_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          startup_id?: string | null
          status?: string
          user_email?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_claim_requests_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_claim_requests_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_claim_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_contracts: {
        Row: {
          additional_representatives: Json
          archive_attempt_count: number | null
          archive_checksum: string | null
          archive_filename: string | null
          archive_location_url: string | null
          archive_provider: string | null
          archive_status: string | null
          archived_at: string | null
          billing_day: number | null
          building_id: string | null
          certidao_permanente_code: string | null
          company_address: string | null
          company_city: string | null
          company_country: string | null
          company_nif: string | null
          company_postal_code: string | null
          contract_number: string | null
          contract_pdf_path: string | null
          contract_template_version: string | null
          counter_signer_email: string | null
          counter_signer_name: string | null
          counter_signer_status: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          discount_applied_by: string | null
          discount_end_date: string | null
          discount_percentage: number | null
          discount_reason: string | null
          discount_start_date: string | null
          document_url: string | null
          docusign_envelope_id: string | null
          end_date: string | null
          equity_percentage: number | null
          founder_signer_status: string | null
          funnel_item_id: string | null
          has_startup_portugal_status: boolean | null
          iban: string | null
          id: string
          incubation_type_id: string | null
          incubation_year: number | null
          is_associate: boolean | null
          is_post_incubation: boolean | null
          last_archive_error: string | null
          last_price_review_date: string | null
          legal_representative_email: string | null
          legal_representative_name: string | null
          legal_representative_phone: string | null
          monthly_fee: number
          next_price_review_date: string | null
          notes: string | null
          onboarding_completed_at: string | null
          onboarding_token_expires_at: string | null
          onboarding_token_hash: string | null
          organization_name: string | null
          payment_method: string | null
          payment_terms_days: number | null
          pricing_line_id: string | null
          pricing_snapshot_json: Json | null
          pricing_version_id: string | null
          project_name: string | null
          provider_completed_at: string | null
          provider_document_id: string | null
          provider_last_error: string | null
          provider_last_event: string | null
          provider_last_sync_at: string | null
          provider_sent_at: string | null
          provider_webhook_event_id: string | null
          regulation_accepted_at: string | null
          regulation_version: string | null
          room_id: string | null
          signature_proof_json: Json | null
          signature_provider: string | null
          signature_requested_at: string | null
          signature_status: string | null
          signed_at: string | null
          square_meters: number | null
          start_date: string
          startup_category: string | null
          status: string
          terminated_at: string | null
          termination_date: string | null
          termination_notice_days: number | null
          termination_reason: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          additional_representatives?: Json
          archive_attempt_count?: number | null
          archive_checksum?: string | null
          archive_filename?: string | null
          archive_location_url?: string | null
          archive_provider?: string | null
          archive_status?: string | null
          archived_at?: string | null
          billing_day?: number | null
          building_id?: string | null
          certidao_permanente_code?: string | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_nif?: string | null
          company_postal_code?: string | null
          contract_number?: string | null
          contract_pdf_path?: string | null
          contract_template_version?: string | null
          counter_signer_email?: string | null
          counter_signer_name?: string | null
          counter_signer_status?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          discount_applied_by?: string | null
          discount_end_date?: string | null
          discount_percentage?: number | null
          discount_reason?: string | null
          discount_start_date?: string | null
          document_url?: string | null
          docusign_envelope_id?: string | null
          end_date?: string | null
          equity_percentage?: number | null
          founder_signer_status?: string | null
          funnel_item_id?: string | null
          has_startup_portugal_status?: boolean | null
          iban?: string | null
          id?: string
          incubation_type_id?: string | null
          incubation_year?: number | null
          is_associate?: boolean | null
          is_post_incubation?: boolean | null
          last_archive_error?: string | null
          last_price_review_date?: string | null
          legal_representative_email?: string | null
          legal_representative_name?: string | null
          legal_representative_phone?: string | null
          monthly_fee?: number
          next_price_review_date?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_token_expires_at?: string | null
          onboarding_token_hash?: string | null
          organization_name?: string | null
          payment_method?: string | null
          payment_terms_days?: number | null
          pricing_line_id?: string | null
          pricing_snapshot_json?: Json | null
          pricing_version_id?: string | null
          project_name?: string | null
          provider_completed_at?: string | null
          provider_document_id?: string | null
          provider_last_error?: string | null
          provider_last_event?: string | null
          provider_last_sync_at?: string | null
          provider_sent_at?: string | null
          provider_webhook_event_id?: string | null
          regulation_accepted_at?: string | null
          regulation_version?: string | null
          room_id?: string | null
          signature_proof_json?: Json | null
          signature_provider?: string | null
          signature_requested_at?: string | null
          signature_status?: string | null
          signed_at?: string | null
          square_meters?: number | null
          start_date: string
          startup_category?: string | null
          status?: string
          terminated_at?: string | null
          termination_date?: string | null
          termination_notice_days?: number | null
          termination_reason?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          additional_representatives?: Json
          archive_attempt_count?: number | null
          archive_checksum?: string | null
          archive_filename?: string | null
          archive_location_url?: string | null
          archive_provider?: string | null
          archive_status?: string | null
          archived_at?: string | null
          billing_day?: number | null
          building_id?: string | null
          certidao_permanente_code?: string | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_nif?: string | null
          company_postal_code?: string | null
          contract_number?: string | null
          contract_pdf_path?: string | null
          contract_template_version?: string | null
          counter_signer_email?: string | null
          counter_signer_name?: string | null
          counter_signer_status?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          discount_applied_by?: string | null
          discount_end_date?: string | null
          discount_percentage?: number | null
          discount_reason?: string | null
          discount_start_date?: string | null
          document_url?: string | null
          docusign_envelope_id?: string | null
          end_date?: string | null
          equity_percentage?: number | null
          founder_signer_status?: string | null
          funnel_item_id?: string | null
          has_startup_portugal_status?: boolean | null
          iban?: string | null
          id?: string
          incubation_type_id?: string | null
          incubation_year?: number | null
          is_associate?: boolean | null
          is_post_incubation?: boolean | null
          last_archive_error?: string | null
          last_price_review_date?: string | null
          legal_representative_email?: string | null
          legal_representative_name?: string | null
          legal_representative_phone?: string | null
          monthly_fee?: number
          next_price_review_date?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_token_expires_at?: string | null
          onboarding_token_hash?: string | null
          organization_name?: string | null
          payment_method?: string | null
          payment_terms_days?: number | null
          pricing_line_id?: string | null
          pricing_snapshot_json?: Json | null
          pricing_version_id?: string | null
          project_name?: string | null
          provider_completed_at?: string | null
          provider_document_id?: string | null
          provider_last_error?: string | null
          provider_last_event?: string | null
          provider_last_sync_at?: string | null
          provider_sent_at?: string | null
          provider_webhook_event_id?: string | null
          regulation_accepted_at?: string | null
          regulation_version?: string | null
          room_id?: string | null
          signature_proof_json?: Json | null
          signature_provider?: string | null
          signature_requested_at?: string | null
          signature_status?: string | null
          signed_at?: string | null
          square_meters?: number | null
          start_date?: string
          startup_category?: string | null
          status?: string
          terminated_at?: string | null
          termination_date?: string | null
          termination_notice_days?: number | null
          termination_reason?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_contracts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_incubation_type_id_fkey"
            columns: ["incubation_type_id"]
            isOneToOne: false
            referencedRelation: "incubation_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_pricing_line_id_fkey"
            columns: ["pricing_line_id"]
            isOneToOne: false
            referencedRelation: "pricing_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: false
            referencedRelation: "pricing_table_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      startups: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          created_at: string
          description: string | null
          founded_date: string | null
          has_startup_portugal_status: boolean | null
          id: string
          logo_url: string | null
          main_contact_email: string | null
          main_contact_name: string | null
          main_contact_phone: string | null
          name: string
          nif: string | null
          nif_normalized: string | null
          phc_customer_id: string | null
          phone: string | null
          startup_portugal_document_path: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          created_at?: string
          description?: string | null
          founded_date?: string | null
          has_startup_portugal_status?: boolean | null
          id?: string
          logo_url?: string | null
          main_contact_email?: string | null
          main_contact_name?: string | null
          main_contact_phone?: string | null
          name: string
          nif?: string | null
          nif_normalized?: string | null
          phc_customer_id?: string | null
          phone?: string | null
          startup_portugal_document_path?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          created_at?: string
          description?: string | null
          founded_date?: string | null
          has_startup_portugal_status?: boolean | null
          id?: string
          logo_url?: string | null
          main_contact_email?: string | null
          main_contact_name?: string | null
          main_contact_phone?: string | null
          name?: string
          nif?: string | null
          nif_normalized?: string | null
          phc_customer_id?: string | null
          phone?: string | null
          startup_portugal_document_path?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      support_materials: {
        Row: {
          category: string | null
          content_markdown: string | null
          created_at: string
          description: string | null
          external_links: Json | null
          file_path: string | null
          id: string
          owner_user_id: string | null
          program_id: string | null
          startup_stage: string | null
          startup_type: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content_markdown?: string | null
          created_at?: string
          description?: string | null
          external_links?: Json | null
          file_path?: string | null
          id?: string
          owner_user_id?: string | null
          program_id?: string | null
          startup_stage?: string | null
          startup_type?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content_markdown?: string | null
          created_at?: string
          description?: string | null
          external_links?: Json | null
          file_path?: string | null
          id?: string
          owner_user_id?: string | null
          program_id?: string | null
          startup_stage?: string | null
          startup_type?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_materials_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          definition_version_at_launch: string | null
          description: string | null
          ends_at: string
          id: string
          launched_at: string | null
          name: string
          program_id: string | null
          questions_snapshot: Json | null
          reminder_days: number[] | null
          starts_at: string
          status: string
          survey_definition_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition_version_at_launch?: string | null
          description?: string | null
          ends_at: string
          id?: string
          launched_at?: string | null
          name: string
          program_id?: string | null
          questions_snapshot?: Json | null
          reminder_days?: number[] | null
          starts_at?: string
          status?: string
          survey_definition_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition_version_at_launch?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          launched_at?: string | null
          name?: string
          program_id?: string | null
          questions_snapshot?: Json | null
          reminder_days?: number[] | null
          starts_at?: string
          status?: string
          survey_definition_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_campaigns_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_campaigns_survey_definition_id_fkey"
            columns: ["survey_definition_id"]
            isOneToOne: false
            referencedRelation: "survey_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_definitions: {
        Row: {
          archived_at: string | null
          auto_fill_mappings: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          questions_json: Json
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auto_fill_mappings?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          questions_json?: Json
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auto_fill_mappings?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          questions_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      survey_instances: {
        Row: {
          auto_filled_data: Json | null
          campaign_id: string
          created_at: string
          id: string
          last_reminder_sent_at: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_filled_data?: Json | null
          campaign_id: string
          created_at?: string
          id?: string
          last_reminder_sent_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_filled_data?: Json | null
          campaign_id?: string
          created_at?: string
          id?: string
          last_reminder_sent_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_instances_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "survey_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          is_auto_filled: boolean | null
          question_id: string
          response_json: Json | null
          response_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          is_auto_filled?: boolean | null
          question_id: string
          response_json?: Json | null
          response_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          is_auto_filled?: boolean | null
          question_id?: string
          response_json?: Json | null
          response_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "survey_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          payload: Json
          severity: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          payload?: Json
          severity?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          payload?: Json
          severity?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tag_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          category_id: string | null
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tag_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_founder: boolean | null
          joined_at: string | null
          left_at: string | null
          linkedin_url: string | null
          phone: string | null
          role: string
          startup_id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_founder?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          linkedin_url?: string | null
          phone?: string | null
          role?: string
          startup_id: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_founder?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          linkedin_url?: string | null
          phone?: string | null
          role?: string
          startup_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      teams_integration_settings: {
        Row: {
          created_at: string
          created_by: string | null
          default_channel_name: string | null
          enabled: boolean
          id: string
          notify_action_assigned: boolean
          notify_action_overdue: boolean
          notify_checkin_submitted: boolean
          notify_health_alert: boolean
          notify_session_created: boolean
          notify_session_rescheduled: boolean
          program_id: string | null
          updated_at: string
          webhook_url: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_channel_name?: string | null
          enabled?: boolean
          id?: string
          notify_action_assigned?: boolean
          notify_action_overdue?: boolean
          notify_checkin_submitted?: boolean
          notify_health_alert?: boolean
          notify_session_created?: boolean
          notify_session_rescheduled?: boolean
          program_id?: string | null
          updated_at?: string
          webhook_url?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_channel_name?: string | null
          enabled?: boolean
          id?: string
          notify_action_assigned?: boolean
          notify_action_overdue?: boolean
          notify_checkin_submitted?: boolean
          notify_health_alert?: boolean
          notify_session_created?: boolean
          notify_session_rescheduled?: boolean
          program_id?: string | null
          updated_at?: string
          webhook_url?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_integration_settings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_integration_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_assets: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          language: string
          notes: Json
          schema_version: number
          sha256: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          language: string
          notes?: Json
          schema_version?: number
          sha256: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          language?: string
          notes?: Json
          schema_version?: number
          sha256?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      template_instances: {
        Row: {
          ai_feedback_generated_at: string | null
          ai_feedback_generated_by: string | null
          ai_feedback_json: Json | null
          ai_feedback_visibility: string | null
          created_at: string
          created_by: string | null
          data_json: Json | null
          id: string
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          template_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_feedback_generated_at?: string | null
          ai_feedback_generated_by?: string | null
          ai_feedback_json?: Json | null
          ai_feedback_visibility?: string | null
          created_at?: string
          created_by?: string | null
          data_json?: Json | null
          id?: string
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          template_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_feedback_generated_at?: string | null
          ai_feedback_generated_by?: string | null
          ai_feedback_json?: Json | null
          ai_feedback_visibility?: string | null
          created_at?: string
          created_by?: string | null
          data_json?: Json | null
          id?: string
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_instances_dedup_backup_20260516: {
        Row: {
          ai_feedback_generated_at: string | null
          ai_feedback_generated_by: string | null
          ai_feedback_json: Json | null
          ai_feedback_visibility: string | null
          created_at: string | null
          created_by: string | null
          data_json: Json | null
          id: string | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string | null
          template_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_feedback_generated_at?: string | null
          ai_feedback_generated_by?: string | null
          ai_feedback_json?: Json | null
          ai_feedback_visibility?: string | null
          created_at?: string | null
          created_by?: string | null
          data_json?: Json | null
          id?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_feedback_generated_at?: string | null
          ai_feedback_generated_by?: string | null
          ai_feedback_json?: Json | null
          ai_feedback_visibility?: string | null
          created_at?: string | null
          created_by?: string | null
          data_json?: Json | null
          id?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      template_requests: {
        Row: {
          admin_note: string | null
          attachment_url: string | null
          context_label: string | null
          context_ref: string | null
          context_type: string
          created_at: string
          description: string | null
          fulfilled_template_id: string | null
          id: string
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          admin_note?: string | null
          attachment_url?: string | null
          context_label?: string | null
          context_ref?: string | null
          context_type?: string
          created_at?: string
          description?: string | null
          fulfilled_template_id?: string | null
          id?: string
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          admin_note?: string | null
          attachment_url?: string | null
          context_label?: string | null
          context_ref?: string | null
          context_type?: string
          created_at?: string
          description?: string | null
          fulfilled_template_id?: string | null
          id?: string
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_requests_fulfilled_template_id_fkey"
            columns: ["fulfilled_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_global: boolean
          name: string
          program_id: string | null
          schema_json: Json | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
          program_id?: string | null
          schema_json?: Json | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
          program_id?: string | null
          schema_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          category: string | null
          created_at: string
          date: string
          description: string | null
          hours: number
          id: string
          session_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          date: string
          description?: string | null
          hours: number
          id?: string
          session_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          date?: string
          description?: string | null
          hours?: number
          id?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_usage_events: {
        Row: {
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          occurred_at: string
          session_id: string | null
          tool: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          session_id?: string | null
          tool: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          session_id?: string | null
          tool?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_usage_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_economics_values: {
        Row: {
          arpu: number | null
          cac: number | null
          created_at: string
          created_by: string | null
          customer_lifetime_months: number | null
          gross_margin: number | null
          id: string
          ltv: number | null
          ltv_cac_ratio: number | null
          marketing_costs: number | null
          monthly_churn_rate: number | null
          new_customers: number | null
          payback_months: number | null
          period_month: string
          sales_costs: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          arpu?: number | null
          cac?: number | null
          created_at?: string
          created_by?: string | null
          customer_lifetime_months?: number | null
          gross_margin?: number | null
          id?: string
          ltv?: number | null
          ltv_cac_ratio?: number | null
          marketing_costs?: number | null
          monthly_churn_rate?: number | null
          new_customers?: number | null
          payback_months?: number | null
          period_month: string
          sales_costs?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          arpu?: number | null
          cac?: number | null
          created_at?: string
          created_by?: string | null
          customer_lifetime_months?: number | null
          gross_margin?: number | null
          id?: string
          ltv?: number | null
          ltv_cac_ratio?: number | null
          marketing_costs?: number | null
          monthly_churn_rate?: number | null
          new_customers?: number | null
          payback_months?: number | null
          period_month?: string
          sales_costs?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_economics_values_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      value_prop_artifacts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          json_fields: Json
          outputs_text: Json
          updated_at: string
          version: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          json_fields?: Json
          outputs_text?: Json
          updated_at?: string
          version?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          json_fields?: Json
          outputs_text?: Json
          updated_at?: string
          version?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "value_prop_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_inbox: {
        Row: {
          contract_id: string | null
          error_message: string | null
          event_id: string | null
          event_name: string | null
          http_status: number | null
          id: string
          payload_hash: string
          processed_at: string | null
          provider: string
          raw_body_preview: string | null
          received_at: string
          status: string
        }
        Insert: {
          contract_id?: string | null
          error_message?: string | null
          event_id?: string | null
          event_name?: string | null
          http_status?: number | null
          id?: string
          payload_hash: string
          processed_at?: string | null
          provider: string
          raw_body_preview?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          contract_id?: string | null
          error_message?: string | null
          event_id?: string | null
          event_name?: string | null
          http_status?: number | null
          id?: string
          payload_hash?: string
          processed_at?: string | null
          provider?: string
          raw_body_preview?: string | null
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      workflow_executions: {
        Row: {
          created_at: string
          id: string
          result_json: Json | null
          rule_id: string
          status: string
          trigger_event_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          result_json?: Json | null
          rule_id: string
          status?: string
          trigger_event_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          result_json?: Json | null
          rule_id?: string
          status?: string
          trigger_event_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_rules: {
        Row: {
          actions_json: Json
          conditions_json: Json
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          program_id: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions_json?: Json
          conditions_json?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          program_id?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions_json?: Json
          conditions_json?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          program_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_rules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_alerts: {
        Row: {
          created_at: string
          evidence_json: Json | null
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          rule_type: string
          severity: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          evidence_json?: Json | null
          id?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_type: string
          severity: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          evidence_json?: Json | null
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_type?: string
          severity?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_assignments: {
        Row: {
          assigned_user_id: string
          created_at: string
          id: string
          role: string
          workspace_id: string
        }
        Insert: {
          assigned_user_id: string
          created_at?: string
          id?: string
          role?: string
          workspace_id: string
        }
        Update: {
          assigned_user_id?: string
          created_at?: string
          id?: string
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_celebrations: {
        Row: {
          event_key: string
          fired_at: string
          id: string
          metadata: Json | null
          workspace_id: string
        }
        Insert: {
          event_key: string
          fired_at?: string
          id?: string
          metadata?: Json | null
          workspace_id: string
        }
        Update: {
          event_key?: string
          fired_at?: string
          id?: string
          metadata?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_celebrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_email_aliases: {
        Row: {
          alias: string
          created_at: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          alias: string
          created_at?: string | null
          id?: string
          workspace_id: string
        }
        Update: {
          alias?: string
          created_at?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_email_aliases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_engagement_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_engagement_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_health_alerts: {
        Row: {
          ack_at: string | null
          ack_by: string | null
          alert_type: string
          created_at: string
          evidence_json: Json
          id: string
          reason: string
          resolved_at: string | null
          severity: string
          snoozed_until: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          ack_at?: string | null
          ack_by?: string | null
          alert_type: string
          created_at?: string
          evidence_json?: Json
          id?: string
          reason: string
          resolved_at?: string | null
          severity?: string
          snoozed_until?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          ack_at?: string | null
          ack_by?: string | null
          alert_type?: string
          created_at?: string
          evidence_json?: Json
          id?: string
          reason?: string
          resolved_at?: string | null
          severity?: string
          snoozed_until?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_health_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_health_history: {
        Row: {
          components_json: Json
          computed_at: string
          created_at: string
          explanation_json: Json | null
          id: string
          label: string
          model_version_id: string | null
          score_numeric: number
          workspace_id: string
        }
        Insert: {
          components_json?: Json
          computed_at?: string
          created_at?: string
          explanation_json?: Json | null
          id?: string
          label: string
          model_version_id?: string | null
          score_numeric: number
          workspace_id: string
        }
        Update: {
          components_json?: Json
          computed_at?: string
          created_at?: string
          explanation_json?: Json | null
          id?: string
          label?: string
          model_version_id?: string | null
          score_numeric?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_health_history_model_version"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "program_health_model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_health_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          role: string
          startup_id: string | null
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          role?: string
          startup_id?: string | null
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          role?: string
          startup_id?: string | null
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_kpis: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kpi_definition_id: string
          required: boolean
          target_value: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kpi_definition_id: string
          required?: boolean
          target_value?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kpi_definition_id?: string
          required?: boolean
          target_value?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_kpis_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_kpis_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_playbook_instances: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          instantiated_at: string | null
          instantiated_by: string | null
          playbook_id: string
          status: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          instantiated_at?: string | null
          instantiated_by?: string | null
          playbook_id: string
          status?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          instantiated_at?: string | null
          instantiated_by?: string | null
          playbook_id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_playbook_instances_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_playbook_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_playbook_links: {
        Row: {
          action_item_id: string | null
          created_at: string
          id: string
          milestone_id: string | null
          playbook_item_id: string | null
          workspace_playbook_instance_id: string
        }
        Insert: {
          action_item_id?: string | null
          created_at?: string
          id?: string
          milestone_id?: string | null
          playbook_item_id?: string | null
          workspace_playbook_instance_id: string
        }
        Update: {
          action_item_id?: string | null
          created_at?: string
          id?: string
          milestone_id?: string | null
          playbook_item_id?: string | null
          workspace_playbook_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_playbook_links_action_item_id_fkey"
            columns: ["action_item_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_playbook_links_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_playbook_links_playbook_item_id_fkey"
            columns: ["playbook_item_id"]
            isOneToOne: false
            referencedRelation: "playbook_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_playbook_links_workspace_playbook_instance_id_fkey"
            columns: ["workspace_playbook_instance_id"]
            isOneToOne: false
            referencedRelation: "workspace_playbook_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_readiness_status: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          item_id: string
          notes: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_readiness_status_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "investor_readiness_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_readiness_status_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_tags: {
        Row: {
          created_at: string
          tag_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_template_tasks: {
        Row: {
          assigned_by: string
          completed_at: string | null
          created_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          priority: string | null
          status: string | null
          template_id: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          assigned_by: string
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          template_id: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          assigned_by?: string
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          template_id?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_template_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_users: {
        Row: {
          active: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          active_financial_model_version_id: string | null
          archived_at: string | null
          assigned_consultor_id: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          created_at: string
          created_by: string | null
          current_week: number | null
          engagement_state: string | null
          external_id: string | null
          health_confidence: string | null
          health_confidence_reason: string | null
          health_notes: string | null
          health_score: Database["public"]["Enums"]["health_score"] | null
          health_score_calculated: string | null
          health_score_components: Json | null
          health_score_explanation: Json | null
          health_score_numeric: number | null
          health_score_override:
            | Database["public"]["Enums"]["health_score"]
            | null
          health_score_updated_at: string | null
          health_status: string | null
          id: string
          last_checkin_at: string | null
          last_contact_at: string | null
          needs_onboarding: boolean
          next_followup_at: string | null
          phc_customer_id: string | null
          priority_level: Database["public"]["Enums"]["workspace_priority"]
          priority_notes: string | null
          priority_set_at: string | null
          priority_set_by: string | null
          program_id: string
          quality_mode: string | null
          service_classification: string | null
          stage: Database["public"]["Enums"]["startup_stage"]
          stage_id: string | null
          startup_category: string | null
          startup_id: string
          status: string
          updated_at: string
        }
        Insert: {
          active_financial_model_version_id?: string | null
          archived_at?: string | null
          assigned_consultor_id?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          created_by?: string | null
          current_week?: number | null
          engagement_state?: string | null
          external_id?: string | null
          health_confidence?: string | null
          health_confidence_reason?: string | null
          health_notes?: string | null
          health_score?: Database["public"]["Enums"]["health_score"] | null
          health_score_calculated?: string | null
          health_score_components?: Json | null
          health_score_explanation?: Json | null
          health_score_numeric?: number | null
          health_score_override?:
            | Database["public"]["Enums"]["health_score"]
            | null
          health_score_updated_at?: string | null
          health_status?: string | null
          id?: string
          last_checkin_at?: string | null
          last_contact_at?: string | null
          needs_onboarding?: boolean
          next_followup_at?: string | null
          phc_customer_id?: string | null
          priority_level?: Database["public"]["Enums"]["workspace_priority"]
          priority_notes?: string | null
          priority_set_at?: string | null
          priority_set_by?: string | null
          program_id: string
          quality_mode?: string | null
          service_classification?: string | null
          stage?: Database["public"]["Enums"]["startup_stage"]
          stage_id?: string | null
          startup_category?: string | null
          startup_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          active_financial_model_version_id?: string | null
          archived_at?: string | null
          assigned_consultor_id?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          created_by?: string | null
          current_week?: number | null
          engagement_state?: string | null
          external_id?: string | null
          health_confidence?: string | null
          health_confidence_reason?: string | null
          health_notes?: string | null
          health_score?: Database["public"]["Enums"]["health_score"] | null
          health_score_calculated?: string | null
          health_score_components?: Json | null
          health_score_explanation?: Json | null
          health_score_numeric?: number | null
          health_score_override?:
            | Database["public"]["Enums"]["health_score"]
            | null
          health_score_updated_at?: string | null
          health_status?: string | null
          id?: string
          last_checkin_at?: string | null
          last_contact_at?: string | null
          needs_onboarding?: boolean
          next_followup_at?: string | null
          phc_customer_id?: string | null
          priority_level?: Database["public"]["Enums"]["workspace_priority"]
          priority_notes?: string | null
          priority_set_at?: string | null
          priority_set_by?: string | null
          program_id?: string
          quality_mode?: string | null
          service_classification?: string | null
          stage?: Database["public"]["Enums"]["startup_stage"]
          stage_id?: string | null
          startup_category?: string | null
          startup_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_active_financial_model_version_id_fkey"
            columns: ["active_financial_model_version_id"]
            isOneToOne: false
            referencedRelation: "financial_model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_manual_resolution_queue: {
        Row: {
          context: Json | null
          created_at: string | null
          funnel_item_id: string | null
          label: string | null
          nif: string | null
          record_id: string | null
          record_kind: string | null
          reference: string | null
          state: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      contract_intakes_safe: {
        Row: {
          approved_data_snapshot: Json | null
          assigned_to: string | null
          billing_email: string | null
          changes_requested_notes: string | null
          company_address: string | null
          company_city: string | null
          company_country: string | null
          company_nif: string | null
          company_postal_code: string | null
          contract_id: string | null
          created_at: string | null
          created_by: string | null
          documents_json: Json | null
          funnel_item_id: string | null
          iban: string | null
          id: string | null
          intake_token: string | null
          last_reminder_sent_at: string | null
          legal_representative_email: string | null
          legal_representative_name: string | null
          legal_representative_phone: string | null
          missing_documents: string[] | null
          organization_name: string | null
          reminder_count: number | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          startup_description: string | null
          status: Database["public"]["Enums"]["intake_status"] | null
          submitted_at: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          approved_data_snapshot?: Json | null
          assigned_to?: string | null
          billing_email?: never
          changes_requested_notes?: string | null
          company_address?: never
          company_city?: never
          company_country?: never
          company_nif?: never
          company_postal_code?: never
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          documents_json?: Json | null
          funnel_item_id?: string | null
          iban?: never
          id?: string | null
          intake_token?: never
          last_reminder_sent_at?: string | null
          legal_representative_email?: never
          legal_representative_name?: never
          legal_representative_phone?: never
          missing_documents?: string[] | null
          organization_name?: string | null
          reminder_count?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startup_description?: string | null
          status?: Database["public"]["Enums"]["intake_status"] | null
          submitted_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          approved_data_snapshot?: Json | null
          assigned_to?: string | null
          billing_email?: never
          changes_requested_notes?: string | null
          company_address?: never
          company_city?: never
          company_country?: never
          company_nif?: never
          company_postal_code?: never
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          documents_json?: Json | null
          funnel_item_id?: string | null
          iban?: never
          id?: string | null
          intake_token?: never
          last_reminder_sent_at?: string | null
          legal_representative_email?: never
          legal_representative_name?: never
          legal_representative_phone?: never
          missing_documents?: string[] | null
          organization_name?: string | null
          reminder_count?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startup_description?: string | null
          status?: Database["public"]["Enums"]["intake_status"] | null
          submitted_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_intakes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_intakes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "startup_contracts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_intakes_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_export: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          expertise: string[] | null
          full_name: string | null
          id: string | null
          linkedin_url: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          expertise?: string[] | null
          full_name?: string | null
          id?: string | null
          linkedin_url?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          expertise?: string[] | null
          full_name?: string | null
          id?: string | null
          linkedin_url?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles_safe: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          expertise: string[] | null
          full_name: string | null
          id: string | null
          linkedin_url: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: never
          expertise?: string[] | null
          full_name?: string | null
          id?: string | null
          linkedin_url?: never
          phone?: never
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: never
          expertise?: string[] | null
          full_name?: string | null
          id?: string | null
          linkedin_url?: never
          phone?: never
          updated_at?: string | null
        }
        Relationships: []
      }
      program_benchmarks: {
        Row: {
          avg_actions_completed: number | null
          avg_health_score: number | null
          avg_kpi_entries: number | null
          avg_milestones_completed: number | null
          program_id: string | null
          stage: Database["public"]["Enums"]["startup_stage"] | null
          startup_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          expertise: string[] | null
          full_name: string | null
          id: string | null
          role_display: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          expertise?: string[] | null
          full_name?: string | null
          id?: string | null
          role_display?: never
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          expertise?: string[] | null
          full_name?: string | null
          id?: string | null
          role_display?: never
        }
        Relationships: []
      }
      startup_contracts_safe: {
        Row: {
          billing_day: number | null
          building_id: string | null
          company_address: string | null
          company_city: string | null
          company_country: string | null
          company_nif: string | null
          company_postal_code: string | null
          contract_number: string | null
          contract_template_version: string | null
          counter_signer_email: string | null
          counter_signer_name: string | null
          counter_signer_status: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          discount_percentage: number | null
          discount_reason: string | null
          document_url: string | null
          end_date: string | null
          equity_percentage: number | null
          founder_signer_status: string | null
          funnel_item_id: string | null
          has_startup_portugal_status: boolean | null
          iban: string | null
          id: string | null
          incubation_type_id: string | null
          incubation_year: number | null
          is_associate: boolean | null
          is_post_incubation: boolean | null
          last_price_review_date: string | null
          legal_representative_email: string | null
          legal_representative_name: string | null
          monthly_fee: number | null
          next_price_review_date: string | null
          notes: string | null
          onboarding_completed_at: string | null
          onboarding_token: string | null
          organization_name: string | null
          payment_method: string | null
          payment_terms_days: number | null
          pricing_line_id: string | null
          pricing_snapshot_json: Json | null
          pricing_version_id: string | null
          provider_completed_at: string | null
          provider_document_id: string | null
          provider_last_error: string | null
          provider_last_event: string | null
          provider_last_sync_at: string | null
          provider_sent_at: string | null
          provider_webhook_event_id: string | null
          regulation_accepted_at: string | null
          regulation_version: string | null
          signature_proof_json: Json | null
          signature_provider: string | null
          signature_requested_at: string | null
          signature_status: string | null
          signed_at: string | null
          square_meters: number | null
          start_date: string | null
          startup_category: string | null
          status: string | null
          terminated_at: string | null
          termination_date: string | null
          termination_notice_days: number | null
          termination_reason: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          billing_day?: number | null
          building_id?: string | null
          company_address?: never
          company_city?: never
          company_country?: never
          company_nif?: never
          company_postal_code?: never
          contract_number?: string | null
          contract_template_version?: string | null
          counter_signer_email?: string | null
          counter_signer_name?: string | null
          counter_signer_status?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          discount_percentage?: number | null
          discount_reason?: string | null
          document_url?: string | null
          end_date?: string | null
          equity_percentage?: number | null
          founder_signer_status?: string | null
          funnel_item_id?: string | null
          has_startup_portugal_status?: boolean | null
          iban?: never
          id?: string | null
          incubation_type_id?: string | null
          incubation_year?: number | null
          is_associate?: boolean | null
          is_post_incubation?: boolean | null
          last_price_review_date?: string | null
          legal_representative_email?: never
          legal_representative_name?: never
          monthly_fee?: number | null
          next_price_review_date?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_token?: never
          organization_name?: string | null
          payment_method?: string | null
          payment_terms_days?: number | null
          pricing_line_id?: string | null
          pricing_snapshot_json?: Json | null
          pricing_version_id?: string | null
          provider_completed_at?: string | null
          provider_document_id?: string | null
          provider_last_error?: string | null
          provider_last_event?: string | null
          provider_last_sync_at?: string | null
          provider_sent_at?: string | null
          provider_webhook_event_id?: string | null
          regulation_accepted_at?: string | null
          regulation_version?: string | null
          signature_proof_json?: Json | null
          signature_provider?: string | null
          signature_requested_at?: string | null
          signature_status?: string | null
          signed_at?: string | null
          square_meters?: number | null
          start_date?: string | null
          startup_category?: string | null
          status?: string | null
          terminated_at?: string | null
          termination_date?: string | null
          termination_notice_days?: number | null
          termination_reason?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          billing_day?: number | null
          building_id?: string | null
          company_address?: never
          company_city?: never
          company_country?: never
          company_nif?: never
          company_postal_code?: never
          contract_number?: string | null
          contract_template_version?: string | null
          counter_signer_email?: string | null
          counter_signer_name?: string | null
          counter_signer_status?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          discount_percentage?: number | null
          discount_reason?: string | null
          document_url?: string | null
          end_date?: string | null
          equity_percentage?: number | null
          founder_signer_status?: string | null
          funnel_item_id?: string | null
          has_startup_portugal_status?: boolean | null
          iban?: never
          id?: string | null
          incubation_type_id?: string | null
          incubation_year?: number | null
          is_associate?: boolean | null
          is_post_incubation?: boolean | null
          last_price_review_date?: string | null
          legal_representative_email?: never
          legal_representative_name?: never
          monthly_fee?: number | null
          next_price_review_date?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_token?: never
          organization_name?: string | null
          payment_method?: string | null
          payment_terms_days?: number | null
          pricing_line_id?: string | null
          pricing_snapshot_json?: Json | null
          pricing_version_id?: string | null
          provider_completed_at?: string | null
          provider_document_id?: string | null
          provider_last_error?: string | null
          provider_last_event?: string | null
          provider_last_sync_at?: string | null
          provider_sent_at?: string | null
          provider_webhook_event_id?: string | null
          regulation_accepted_at?: string | null
          regulation_version?: string | null
          signature_proof_json?: Json | null
          signature_provider?: string | null
          signature_requested_at?: string | null
          signature_status?: string | null
          signed_at?: string | null
          square_meters?: number | null
          start_date?: string | null
          startup_category?: string | null
          status?: string | null
          terminated_at?: string | null
          termination_date?: string | null
          termination_notice_days?: number | null
          termination_reason?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_contracts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_funnel_item_id_fkey"
            columns: ["funnel_item_id"]
            isOneToOne: false
            referencedRelation: "funnel_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_incubation_type_id_fkey"
            columns: ["incubation_type_id"]
            isOneToOne: false
            referencedRelation: "incubation_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_pricing_line_id_fkey"
            columns: ["pricing_line_id"]
            isOneToOne: false
            referencedRelation: "pricing_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: false
            referencedRelation: "pricing_table_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      startups_safe: {
        Row: {
          address: string | null
          created_at: string | null
          description: string | null
          founded_date: string | null
          id: string | null
          is_legally_recognized: boolean | null
          logo_url: string | null
          main_contact_email: string | null
          main_contact_name: string | null
          main_contact_phone: string | null
          name: string | null
          nif: string | null
          phone: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: never
          created_at?: string | null
          description?: string | null
          founded_date?: string | null
          id?: string | null
          is_legally_recognized?: boolean | null
          logo_url?: string | null
          main_contact_email?: never
          main_contact_name?: never
          main_contact_phone?: never
          name?: string | null
          nif?: never
          phone?: never
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: never
          created_at?: string | null
          description?: string | null
          founded_date?: string | null
          id?: string | null
          is_legally_recognized?: boolean | null
          logo_url?: string | null
          main_contact_email?: never
          main_contact_name?: never
          main_contact_phone?: never
          name?: string | null
          nif?: never
          phone?: never
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      team_members_safe: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_founder: boolean | null
          joined_at: string | null
          left_at: string | null
          linkedin_url: string | null
          phone: string | null
          role: string | null
          startup_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
          is_founder?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          linkedin_url?: never
          phone?: never
          role?: string | null
          startup_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
          is_founder?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          linkedin_url?: never
          phone?: never
          role?: string | null
          startup_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_commit_crm_import_job: { Args: { p_job_id: string }; Returns: Json }
      admin_rollback_crm_import_job: {
        Args: { p_job_id: string }
        Returns: Json
      }
      apply_contract_patch: {
        Args: { _contract_id: string; _patch: Json; _source: string }
        Returns: Json
      }
      approve_startup_change_request: {
        Args: { _notes?: string; _request_id: string }
        Returns: {
          applied_at: string | null
          applied_automatically: boolean
          created_at: string
          current_value_json: Json | null
          field_key: string
          field_label: string
          id: string
          justification: string | null
          requested_by: string
          requested_value_json: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          startup_id: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "startup_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_startup_claim: {
        Args: { p_claim_id: string; p_workspace_id: string }
        Returns: undefined
      }
      approve_user_account: { Args: { p_user_id: string }; Returns: undefined }
      assign_mentor_request: {
        Args: { _mentor_id: string; _request_id: string }
        Returns: Json
      }
      block_workspace: {
        Args: { _reason?: string; _workspace_id: string }
        Returns: undefined
      }
      can_access_backoffice: { Args: never; Returns: boolean }
      can_edit_financial_plan: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      can_edit_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_manage_startup: { Args: { _startup_id: string }; Returns: boolean }
      can_notify_user: { Args: { _target_user: string }; Returns: boolean }
      can_see_startup_pii: { Args: { _startup_id: string }; Returns: boolean }
      can_see_team_member_pii: {
        Args: { _startup_id: string }
        Returns: boolean
      }
      can_view_quality_result: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: boolean
      }
      can_write_startup_data: {
        Args: { _startup_id: string }
        Returns: boolean
      }
      can_write_workspace: { Args: { _workspace_id: string }; Returns: boolean }
      cancel_session_atomic: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      check_ai_rate_limit: {
        Args: {
          _function_name: string
          _max_requests?: number
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      check_ecosystem_invariants: { Args: never; Returns: Json }
      check_signup_allowed: { Args: { p_email: string }; Returns: boolean }
      claim_startup: { Args: never; Returns: Json }
      cleanup_old_rate_limits: { Args: never; Returns: number }
      commit_import_funnel_item: {
        Args: {
          p_expected_updated_at: string
          p_external_ids: Json
          p_final_stage: string
          p_job_id: string
          p_match_entity_id: string
          p_payload: Json
          p_row_id: string
          p_tags: string[]
        }
        Returns: Json
      }
      commit_import_funnel_item_v2: {
        Args: {
          p_expected_updated_at: string
          p_external_ids: Json
          p_final_stage: string
          p_job_id: string
          p_match_entity_id: string
          p_payload: Json
          p_row_id: string
          p_source: string
          p_tags: string[]
          p_verified_fields: Json
        }
        Returns: Json
      }
      complete_session_atomic: {
        Args: {
          p_actual_duration_minutes: number
          p_decisions: string
          p_idempotency_key: string
          p_notes: string
          p_participants: Json
          p_primary_consultant_id: string
          p_session_id: string
          p_template_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_conversation: {
        Args: {
          _title?: string
          _workspace_id?: string
          participant_ids: string[]
        }
        Returns: string
      }
      create_startup_application: {
        Args: {
          p_description?: string
          p_has_startup_portugal_status?: boolean
          p_main_contact_email?: string
          p_main_contact_name?: string
          p_main_contact_phone?: string
          p_name: string
          p_nif?: string
          p_program_id: string
          p_stage: string
          p_website?: string
        }
        Returns: {
          startup_id: string
          workspace_id: string
        }[]
      }
      ensure_dataroom_exists: {
        Args: { _workspace_id: string }
        Returns: string
      }
      ensure_founder_role: { Args: never; Returns: undefined }
      fuzzy_search_leads: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          contact_email: string
          contact_name: string
          id: string
          organization_name: string
          similarity: number
          stage: string
          updated_at: string
        }[]
      }
      fuzzy_search_startups: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          description: string
          id: string
          name: string
          similarity: number
          updated_at: string
        }[]
      }
      generate_weekly_checkins: { Args: never; Returns: number }
      get_assigned_consultant_contact: {
        Args: { p_workspace_id: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
          linkedin_url: string
        }[]
      }
      get_dataroom_workspace_id: {
        Args: { _dataroom_id: string }
        Returns: string
      }
      get_feature_control: { Args: { _key: string }; Returns: Json }
      get_impact_aggregates: {
        Args: {
          p_consultant_id?: string
          p_date_from: string
          p_date_to: string
          p_program_id?: string
          p_service?: string
          p_startup_id?: string
        }
        Returns: Json
      }
      get_kpi_percentiles: {
        Args: {
          _kpi_definition_id: string
          _program_id?: string
          _stage?: string
        }
        Returns: {
          count: number
          p25: number
          p50: number
          p75: number
        }[]
      }
      get_mentor_busy_slots: {
        Args: { p_from: string; p_mentor_id: string; p_to: string }
        Returns: {
          busy_date: string
          end_time: string
          start_time: string
        }[]
      }
      get_mentor_impact: {
        Args: { p_from?: string; p_mentor_id: string; p_to?: string }
        Returns: Json
      }
      get_my_calendar_token_status: {
        Args: never
        Returns: {
          expires_at: string
          has_token: boolean
        }[]
      }
      get_next_intake_consultant: {
        Args: { p_route_id: string }
        Returns: string
      }
      get_or_create_workspace_conversation: {
        Args: { _workspace_id: string }
        Returns: string
      }
      get_session_workspace_id: {
        Args: { _session_id: string }
        Returns: string
      }
      get_tool_adoption: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_tool?: string
          p_user_id?: string
          p_workspace_id?: string
        }
        Returns: {
          distinct_users: number
          entity_type: string
          event_count: number
          last_used_at: string
          tool: string
          workspace_id: string
        }[]
      }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_workspace_stats: {
        Args: { workspace_ids: string[] }
        Returns: {
          has_current_month_kpi: boolean
          last_kpi_month: string
          last_session_id: string
          last_session_notes: string
          last_session_scheduled_at: string
          last_session_title: string
          next_meeting_date: string
          overdue_actions_count: number
          pending_actions_count: number
          workspace_id: string
        }[]
      }
      has_accepted_nda: {
        Args: { _nda_version?: string; _user_id: string }
        Returns: boolean
      }
      has_active_workspace_access: { Args: { ws_id: string }; Returns: boolean }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_program_access: { Args: { _program_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_access:
        | {
            Args: { _user_id: string; _workspace_id: string }
            Returns: boolean
          }
        | { Args: { _workspace_id: string }; Returns: boolean }
      is_account_active:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_admin_only: { Args: never; Returns: boolean }
      is_backoffice: { Args: never; Returns: boolean }
      is_connected_mentor: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_external_mentor: { Args: { _user_id: string }; Returns: boolean }
      is_founder: { Args: { _workspace_id: string }; Returns: boolean }
      is_founder_user: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_startup_founder: { Args: { _startup_id: string }; Returns: boolean }
      is_team_member_of_startup: {
        Args: { _startup_id: string }
        Returns: boolean
      }
      launch_survey_campaign: {
        Args: { p_campaign_id: string; p_workspace_ids?: string[] }
        Returns: {
          campaign_id: string
          instances_created: number
        }[]
      }
      list_ecosystem_items: {
        Args: {
          p_has_startup_portugal?: boolean
          p_health?: string
          p_limit?: number
          p_owner_id?: string
          p_program_id?: string
          p_search?: string
          p_stage?: string
        }
        Returns: {
          created_at: string
          funnel_item_id: string
          has_startup_portugal_status: boolean
          health_score: string
          id: string
          item_type: string
          last_activity_at: string
          name: string
          next_meeting_at: string
          owner_id: string
          owner_name: string
          priority_level: string
          program_id: string
          program_name: string
          stage: string
          startup_category: string
          startup_portugal_document_path: string
          updated_at: string
          workspace_id: string
        }[]
      }
      list_ecosystem_items_v2: {
        Args: {
          p_cursor_activity?: string
          p_cursor_id?: string
          p_has_startup_portugal?: boolean
          p_health?: string
          p_owner_id?: string
          p_page_size?: number
          p_program_id?: string
          p_search?: string
          p_stage?: string
        }
        Returns: {
          created_at: string
          funnel_item_id: string
          has_startup_portugal_status: boolean
          health_score: string
          id: string
          item_type: string
          last_activity_at: string
          name: string
          next_cursor_activity: string
          next_cursor_id: string
          next_meeting_at: string
          owner_id: string
          owner_name: string
          priority_level: string
          program_id: string
          program_name: string
          stage: string
          startup_category: string
          startup_portugal_document_path: string
          total_count: number
          updated_at: string
          workspace_id: string
        }[]
      }
      mark_session_no_show_atomic: {
        Args: {
          p_idempotency_key: string
          p_notes: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      materialize_acceleration_deliverables: {
        Args: { p_program_id: string; p_workspace_id: string }
        Returns: Json
      }
      patch_program_setup: {
        Args: { p_draft_id: string; p_expected_revision: number; p_patch: Json }
        Returns: Json
      }
      publish_program_setup: {
        Args: {
          p_draft_id: string
          p_draft_json: Json
          p_kpi_definition_map?: Json
          p_program_id: string
        }
        Returns: Json
      }
      publish_program_version: {
        Args: { p_gates: Json; p_program_id: string; p_weeks: Json }
        Returns: Json
      }
      reconcile_active_customer: {
        Args: {
          p_batch_id: string
          p_idempotency_key?: string
          p_input: Json
          p_service_program_map?: Json
        }
        Returns: Json
      }
      reconcile_rollback: { Args: { p_row_id: string }; Returns: Json }
      reconciler_commit_row: {
        Args: { p_expected_plan_hash: string; p_row_id: string }
        Returns: Json
      }
      reconciler_write_enabled: { Args: never; Returns: boolean }
      reject_startup_change_request: {
        Args: { _notes?: string; _request_id: string }
        Returns: {
          applied_at: string | null
          applied_automatically: boolean
          created_at: string
          current_value_json: Json | null
          field_key: string
          field_label: string
          id: string
          justification: string | null
          requested_by: string
          requested_value_json: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          startup_id: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "startup_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_startup_claim: {
        Args: { p_claim_id: string; p_reason?: string }
        Returns: undefined
      }
      revert_import_row: { Args: { p_row_id: string }; Returns: Json }
      search_workspaces_paged: {
        Args: {
          _assigned_to?: string
          _health?: Database["public"]["Enums"]["health_score"]
          _limit?: number
          _missing_kpi_this_month?: boolean
          _offset?: number
          _overdue_actions?: boolean
          _priority?: Database["public"]["Enums"]["workspace_priority"]
          _program_id?: string
          _search?: string
          _sort_by?: string
          _stage?: Database["public"]["Enums"]["startup_stage"]
          _statuses?: string[]
        }
        Returns: {
          created_at: string
          current_week: number
          health_score: Database["public"]["Enums"]["health_score"]
          health_score_override: Database["public"]["Enums"]["health_score"]
          id: string
          priority_level: Database["public"]["Enums"]["workspace_priority"]
          program_id: string
          program_name: string
          program_type: string
          stage: Database["public"]["Enums"]["startup_stage"]
          startup_description: string
          startup_id: string
          startup_logo_url: string
          startup_name: string
          status: string
          total_count: number
          updated_at: string
        }[]
      }
      set_my_calendar_token: {
        Args: { _expires_at: string; _token_hash: string }
        Returns: undefined
      }
      sha256_token: { Args: { token: string }; Returns: string }
      shares_workspace_with: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      staff_assign_or_create_workspace: {
        Args: {
          p_description?: string
          p_mode: string
          p_program_id?: string
          p_stage?: string
          p_startup_name?: string
          p_user_id: string
          p_workspace_id?: string
        }
        Returns: {
          startup_id: string
          workspace_id: string
        }[]
      }
      staff_convert_funnel_item_to_startup: {
        Args: {
          p_building_id?: string
          p_description?: string
          p_funnel_item_id: string
          p_health_notes?: string
          p_incubation_type_id?: string
          p_inferred_stage?: string
          p_monthly_fee?: number
          p_program_id: string
          p_project_name?: string
          p_square_meters?: number
          p_stage: string
        }
        Returns: Json
      }
      staff_create_workspace_for_claim: {
        Args: {
          p_claim_id: string
          p_description?: string
          p_program_id: string
          p_stage?: string
          p_startup_name: string
        }
        Returns: {
          startup_id: string
          workspace_id: string
        }[]
      }
      staff_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      staff_rotate_intake_token: {
        Args: { p_intake_id: string }
        Returns: string
      }
      staff_rotate_onboarding_token: {
        Args: { p_contract_id: string }
        Returns: string
      }
      submit_checkin: {
        Args: { p_instance_id: string; p_responses: Json }
        Returns: string
      }
      submit_survey_responses: {
        Args: { p_instance_id: string; p_responses: Json; p_submit?: boolean }
        Returns: {
          instance_id: string
          responses_saved: number
          status: string
        }[]
      }
      unblock_workspace: { Args: { _workspace_id: string }; Returns: undefined }
      validate_portuguese_nif: { Args: { nif: string }; Returns: boolean }
    }
    Enums: {
      account_status: "pending" | "approved" | "suspended"
      action_status:
        | "pending"
        | "in_progress"
        | "awaiting_validation"
        | "completed"
        | "cancelled"
      app_role:
        | "admin"
        | "consultor"
        | "mentor_externo"
        | "founder"
        | "team_member"
        | "backoffice"
      compliance_status: "on_track" | "needs_update" | "overdue"
      financial_assumption_source:
        | "founder"
        | "prefill_profile"
        | "prefill_kpi"
        | "prefill_ai"
        | "imported_xlsm"
      financial_plan_scenario: "base" | "conservative" | "optimistic"
      financial_prefill_status: "pending" | "accepted" | "rejected"
      health_score: "critical" | "at_risk" | "stable" | "healthy" | "thriving"
      intake_status:
        | "intake_requested"
        | "intake_in_progress"
        | "intake_submitted"
        | "review_pending"
        | "changes_requested"
        | "approved_for_signature"
        | "rejected"
        | "draft_internal"
        | "signature_sent"
        | "signed"
        | "activated"
        | "cancelled"
      milestone_status: "not_started" | "in_progress" | "completed" | "delayed"
      program_type: "incubation" | "acceleration"
      startup_stage: "ideation" | "validation" | "mvp" | "growth" | "scale"
      workspace_priority: "star" | "high" | "standard" | "maintenance"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["pending", "approved", "suspended"],
      action_status: [
        "pending",
        "in_progress",
        "awaiting_validation",
        "completed",
        "cancelled",
      ],
      app_role: [
        "admin",
        "consultor",
        "mentor_externo",
        "founder",
        "team_member",
        "backoffice",
      ],
      compliance_status: ["on_track", "needs_update", "overdue"],
      financial_assumption_source: [
        "founder",
        "prefill_profile",
        "prefill_kpi",
        "prefill_ai",
        "imported_xlsm",
      ],
      financial_plan_scenario: ["base", "conservative", "optimistic"],
      financial_prefill_status: ["pending", "accepted", "rejected"],
      health_score: ["critical", "at_risk", "stable", "healthy", "thriving"],
      intake_status: [
        "intake_requested",
        "intake_in_progress",
        "intake_submitted",
        "review_pending",
        "changes_requested",
        "approved_for_signature",
        "rejected",
        "draft_internal",
        "signature_sent",
        "signed",
        "activated",
        "cancelled",
      ],
      milestone_status: ["not_started", "in_progress", "completed", "delayed"],
      program_type: ["incubation", "acceleration"],
      startup_stage: ["ideation", "validation", "mvp", "growth", "scale"],
      workspace_priority: ["star", "high", "standard", "maintenance"],
    },
  },
} as const
