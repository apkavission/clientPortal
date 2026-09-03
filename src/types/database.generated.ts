/**
 * Generated from the live database. Do not edit.
 *
 *     npm run gen:types
 *
 * The hand-written `database.ts` is the one the application imports — it
 * carries the reasoning a generator cannot know. This file exists so that one
 * can be checked against reality: `conformance.ts` compares them at compile
 * time, and `tsc` fails if they have drifted apart.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  portal: {
    Tables: {
      /** A table. */
      activity_log: {
        Row: {
          id: string;
          project_id: string;
          actor_type: Database["portal"]["Enums"]["actor_type"];
          actor_staff_id: string | null;
          actor_client_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          summary: string;
          is_client_visible: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          actor_type?: Database["portal"]["Enums"]["actor_type"];
          actor_staff_id?: string | null;
          actor_client_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          summary: string;
          is_client_visible?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          actor_type?: Database["portal"]["Enums"]["actor_type"];
          actor_staff_id?: string | null;
          actor_client_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          summary?: string;
          is_client_visible?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      approvals: {
        Row: {
          id: string;
          project_id: string;
          milestone_id: string | null;
          phase_id: string | null;
          title: string;
          detail: string | null;
          status: Database["portal"]["Enums"]["approval_status"];
          requested_by: string | null;
          responded_by: string | null;
          note: string | null;
          requested_at: string;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
          responded_by_name: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          milestone_id?: string | null;
          phase_id?: string | null;
          title: string;
          detail?: string | null;
          status?: Database["portal"]["Enums"]["approval_status"];
          requested_by?: string | null;
          responded_by?: string | null;
          note?: string | null;
          requested_at?: string;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
          responded_by_name?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          milestone_id?: string | null;
          phase_id?: string | null;
          title?: string;
          detail?: string | null;
          status?: Database["portal"]["Enums"]["approval_status"];
          requested_by?: string | null;
          responded_by?: string | null;
          note?: string | null;
          requested_at?: string;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
          responded_by_name?: string | null;
        };
        Relationships: [];
      };
      /** A table. */
      attendance: {
        Row: {
          id: string;
          staff_id: string;
          on_date: string;
          clock_in: string;
          clock_out: string | null;
          adjusted_by: string | null;
          adjust_note: string | null;
          created_at: string;
          updated_at: string;
          clock_in_lat: number | null;
          clock_in_lng: number | null;
          clock_in_accuracy_m: number | null;
          clock_in_distance_m: number | null;
          clock_in_verdict: string | null;
          clock_out_lat: number | null;
          clock_out_lng: number | null;
          clock_out_accuracy_m: number | null;
          clock_out_distance_m: number | null;
          clock_out_verdict: string | null;
        };
        Insert: {
          id?: string;
          staff_id: string;
          on_date?: string;
          clock_in?: string;
          clock_out?: string | null;
          adjusted_by?: string | null;
          adjust_note?: string | null;
          created_at?: string;
          updated_at?: string;
          clock_in_lat?: number | null;
          clock_in_lng?: number | null;
          clock_in_accuracy_m?: number | null;
          clock_in_distance_m?: number | null;
          clock_in_verdict?: string | null;
          clock_out_lat?: number | null;
          clock_out_lng?: number | null;
          clock_out_accuracy_m?: number | null;
          clock_out_distance_m?: number | null;
          clock_out_verdict?: string | null;
        };
        Update: {
          id?: string;
          staff_id?: string;
          on_date?: string;
          clock_in?: string;
          clock_out?: string | null;
          adjusted_by?: string | null;
          adjust_note?: string | null;
          created_at?: string;
          updated_at?: string;
          clock_in_lat?: number | null;
          clock_in_lng?: number | null;
          clock_in_accuracy_m?: number | null;
          clock_in_distance_m?: number | null;
          clock_in_verdict?: string | null;
          clock_out_lat?: number | null;
          clock_out_lng?: number | null;
          clock_out_accuracy_m?: number | null;
          clock_out_distance_m?: number | null;
          clock_out_verdict?: string | null;
        };
        Relationships: [];
      };
      /** A table. */
      client_projects: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          slug: string;
          summary: string | null;
          stage: Database["portal"]["Enums"]["project_stage"];
          health: Database["portal"]["Enums"]["health"];
          start_date: string | null;
          target_date: string | null;
          actual_end_date: string | null;
          progress_percent: number;
          contract_value: number | null;
          currency: string;
          is_client_visible: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          terms: string | null;
          payment_terms: string | null;
          exclusions: string | null;
          internal_notes: string | null;
          discount_amount: number;
          estimated_weeks: number | null;
          client_brief: string | null;
          what_we_will_do: string | null;
          approved_at: string | null;
          approved_note: string | null;
          lead_developer_id: string | null;
          accounts_created_at: string | null;
          change_limit: number;
          change_terms: string | null;
          scope_delivered_at: string | null;
          service_keys: string[];
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          slug: string;
          summary?: string | null;
          stage?: Database["portal"]["Enums"]["project_stage"];
          health?: Database["portal"]["Enums"]["health"];
          start_date?: string | null;
          target_date?: string | null;
          actual_end_date?: string | null;
          progress_percent?: number;
          contract_value?: number | null;
          currency?: string;
          is_client_visible?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          terms?: string | null;
          payment_terms?: string | null;
          exclusions?: string | null;
          internal_notes?: string | null;
          discount_amount?: number;
          estimated_weeks?: number | null;
          client_brief?: string | null;
          what_we_will_do?: string | null;
          approved_at?: string | null;
          approved_note?: string | null;
          lead_developer_id?: string | null;
          accounts_created_at?: string | null;
          change_limit?: number;
          change_terms?: string | null;
          scope_delivered_at?: string | null;
          service_keys?: string[];
        };
        Update: {
          id?: string;
          client_id?: string;
          name?: string;
          slug?: string;
          summary?: string | null;
          stage?: Database["portal"]["Enums"]["project_stage"];
          health?: Database["portal"]["Enums"]["health"];
          start_date?: string | null;
          target_date?: string | null;
          actual_end_date?: string | null;
          progress_percent?: number;
          contract_value?: number | null;
          currency?: string;
          is_client_visible?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          terms?: string | null;
          payment_terms?: string | null;
          exclusions?: string | null;
          internal_notes?: string | null;
          discount_amount?: number;
          estimated_weeks?: number | null;
          client_brief?: string | null;
          what_we_will_do?: string | null;
          approved_at?: string | null;
          approved_note?: string | null;
          lead_developer_id?: string | null;
          accounts_created_at?: string | null;
          change_limit?: number;
          change_terms?: string | null;
          scope_delivered_at?: string | null;
          service_keys?: string[];
        };
        Relationships: [];
      };
      /** A table. */
      client_requests: {
        Row: {
          id: string;
          project_id: string;
          client_user_id: string | null;
          title: string;
          description: string | null;
          attachments: Json;
          status: Database["portal"]["Enums"]["request_status"];
          reviewed_by: string | null;
          review_note: string | null;
          converted_task_id: string | null;
          is_scope_change: boolean;
          created_at: string;
          updated_at: string;
          is_urgent: boolean;
          urgency_reason: string | null;
          approved_at: string | null;
          approved_by: string | null;
          change_number: number | null;
          quoted_amount: number | null;
          extra: Json;
        };
        Insert: {
          id?: string;
          project_id: string;
          client_user_id?: string | null;
          title: string;
          description?: string | null;
          attachments?: Json;
          status?: Database["portal"]["Enums"]["request_status"];
          reviewed_by?: string | null;
          review_note?: string | null;
          converted_task_id?: string | null;
          is_scope_change?: boolean;
          created_at?: string;
          updated_at?: string;
          is_urgent?: boolean;
          urgency_reason?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          change_number?: number | null;
          quoted_amount?: number | null;
          extra?: Json;
        };
        Update: {
          id?: string;
          project_id?: string;
          client_user_id?: string | null;
          title?: string;
          description?: string | null;
          attachments?: Json;
          status?: Database["portal"]["Enums"]["request_status"];
          reviewed_by?: string | null;
          review_note?: string | null;
          converted_task_id?: string | null;
          is_scope_change?: boolean;
          created_at?: string;
          updated_at?: string;
          is_urgent?: boolean;
          urgency_reason?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          change_number?: number | null;
          quoted_amount?: number | null;
          extra?: Json;
        };
        Relationships: [];
      };
      /** A table. */
      client_users: {
        Row: {
          id: string;
          client_id: string;
          auth_user_id: string | null;
          full_name: string;
          email: string;
          role: Database["portal"]["Enums"]["client_user_role"];
          is_active: boolean;
          invited_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          auth_user_id?: string | null;
          full_name: string;
          email: string;
          role?: Database["portal"]["Enums"]["client_user_role"];
          is_active?: boolean;
          invited_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          auth_user_id?: string | null;
          full_name?: string;
          email?: string;
          role?: Database["portal"]["Enums"]["client_user_role"];
          is_active?: boolean;
          invited_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      clients: {
        Row: {
          id: string;
          name: string;
          company_name: string | null;
          email: string | null;
          phone: string | null;
          whatsapp: string | null;
          gst: string | null;
          address: string | null;
          status: Database["portal"]["Enums"]["client_status"];
          notes: string | null;
          lead_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company_name?: string | null;
          email?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          gst?: string | null;
          address?: string | null;
          status?: Database["portal"]["Enums"]["client_status"];
          notes?: string | null;
          lead_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          company_name?: string | null;
          email?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          gst?: string | null;
          address?: string | null;
          status?: Database["portal"]["Enums"]["client_status"];
          notes?: string | null;
          lead_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      holidays: {
        Row: {
          id: string;
          on_date: string;
          name: string;
          is_optional: boolean;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          on_date: string;
          name: string;
          is_optional?: boolean;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          on_date?: string;
          name?: string;
          is_optional?: boolean;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      leave_entitlements: {
        Row: {
          id: string;
          staff_id: string;
          year: number;
          kind: Database["portal"]["Enums"]["leave_kind"] | null;
          days: number;
          created_at: string;
          updated_at: string;
          kind_key: string | null;
        };
        Insert: {
          id?: string;
          staff_id: string;
          year: number;
          kind?: Database["portal"]["Enums"]["leave_kind"] | null;
          days: number;
          created_at?: string;
          updated_at?: string;
          kind_key?: string | null;
        };
        Update: {
          id?: string;
          staff_id?: string;
          year?: number;
          kind?: Database["portal"]["Enums"]["leave_kind"] | null;
          days?: number;
          created_at?: string;
          updated_at?: string;
          kind_key?: string | null;
        };
        Relationships: [];
      };
      /** A table. */
      leave_requests: {
        Row: {
          id: string;
          staff_id: string;
          kind: Database["portal"]["Enums"]["leave_kind"] | null;
          from_date: string;
          to_date: string;
          day_part: Database["portal"]["Enums"]["day_part"];
          reason: string | null;
          status: Database["portal"]["Enums"]["leave_status"];
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_at: string;
          updated_at: string;
          kind_key: string | null;
        };
        Insert: {
          id?: string;
          staff_id: string;
          kind?: Database["portal"]["Enums"]["leave_kind"] | null;
          from_date: string;
          to_date: string;
          day_part?: Database["portal"]["Enums"]["day_part"];
          reason?: string | null;
          status?: Database["portal"]["Enums"]["leave_status"];
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
          updated_at?: string;
          kind_key?: string | null;
        };
        Update: {
          id?: string;
          staff_id?: string;
          kind?: Database["portal"]["Enums"]["leave_kind"] | null;
          from_date?: string;
          to_date?: string;
          day_part?: Database["portal"]["Enums"]["day_part"];
          reason?: string | null;
          status?: Database["portal"]["Enums"]["leave_status"];
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
          updated_at?: string;
          kind_key?: string | null;
        };
        Relationships: [];
      };
      /** A view. */
      leave_types_master: {
        Row: {
          key: string | null;
          label: string | null;
          description: string | null;
          is_paid: boolean | null;
          needs_balance: boolean | null;
          is_active: boolean | null;
          sort_order: number | null;
        };
        Insert: {
          key?: string | null;
          label?: string | null;
          description?: string | null;
          is_paid?: boolean | null;
          needs_balance?: boolean | null;
          is_active?: boolean | null;
          sort_order?: number | null;
        };
        Update: {
          key?: string | null;
          label?: string | null;
          description?: string | null;
          is_paid?: boolean | null;
          needs_balance?: boolean | null;
          is_active?: boolean | null;
          sort_order?: number | null;
        };
        Relationships: [];
      };
      /** A table. */
      milestones: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string | null;
          due_date: string | null;
          completed_at: string | null;
          requires_approval: boolean;
          payment_note: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          requires_approval?: boolean;
          payment_note?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          description?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          requires_approval?: boolean;
          payment_note?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      payments: {
        Row: {
          id: string;
          project_id: string;
          amount: number;
          paid_on: string;
          method: string;
          reference: string | null;
          note: string | null;
          recorded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          amount: number;
          paid_on?: string;
          method?: string;
          reference?: string | null;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          amount?: number;
          paid_on?: string;
          method?: string;
          reference?: string | null;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      project_files: {
        Row: {
          id: string;
          project_id: string;
          filename: string;
          storage_key: string;
          mime_type: string | null;
          size_bytes: number | null;
          category: Database["portal"]["Enums"]["file_category"];
          is_client_visible: boolean;
          version: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          filename: string;
          storage_key: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          category?: Database["portal"]["Enums"]["file_category"];
          is_client_visible?: boolean;
          version?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          filename?: string;
          storage_key?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          category?: Database["portal"]["Enums"]["file_category"];
          is_client_visible?: boolean;
          version?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      project_members: {
        Row: {
          id: string;
          project_id: string;
          staff_id: string;
          role: Database["portal"]["Enums"]["member_role"];
          is_client_visible: boolean;
          assigned_at: string;
          completed_at: string | null;
          completion_note: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          staff_id: string;
          role?: Database["portal"]["Enums"]["member_role"];
          is_client_visible?: boolean;
          assigned_at?: string;
          completed_at?: string | null;
          completion_note?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          staff_id?: string;
          role?: Database["portal"]["Enums"]["member_role"];
          is_client_visible?: boolean;
          assigned_at?: string;
          completed_at?: string | null;
          completion_note?: string | null;
        };
        Relationships: [];
      };
      /** A table. */
      project_messages: {
        Row: {
          id: string;
          project_id: string;
          staff_id: string | null;
          client_user_id: string | null;
          author_name: string;
          body: string;
          is_internal: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          staff_id?: string | null;
          client_user_id?: string | null;
          author_name: string;
          body: string;
          is_internal?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          staff_id?: string | null;
          client_user_id?: string | null;
          author_name?: string;
          body?: string;
          is_internal?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      project_phases: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string | null;
          sort_order: number;
          status: Database["portal"]["Enums"]["phase_status"];
          start_date: string | null;
          target_date: string | null;
          completed_at: string | null;
          weight: number;
          progress_percent: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string | null;
          sort_order?: number;
          status?: Database["portal"]["Enums"]["phase_status"];
          start_date?: string | null;
          target_date?: string | null;
          completed_at?: string | null;
          weight?: number;
          progress_percent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          description?: string | null;
          sort_order?: number;
          status?: Database["portal"]["Enums"]["phase_status"];
          start_date?: string | null;
          target_date?: string | null;
          completed_at?: string | null;
          weight?: number;
          progress_percent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      request_messages: {
        Row: {
          id: string;
          request_id: string;
          staff_id: string | null;
          client_user_id: string | null;
          author_name: string;
          body: string;
          is_internal: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          staff_id?: string | null;
          client_user_id?: string | null;
          author_name: string;
          body: string;
          is_internal?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          staff_id?: string | null;
          client_user_id?: string | null;
          author_name?: string;
          body?: string;
          is_internal?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      requirements: {
        Row: {
          id: string;
          project_id: string;
          phase_id: string | null;
          title: string;
          description: string | null;
          source: Database["portal"]["Enums"]["requirement_source"];
          status: Database["portal"]["Enums"]["requirement_status"];
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          phase_id?: string | null;
          title: string;
          description?: string | null;
          source?: Database["portal"]["Enums"]["requirement_source"];
          status?: Database["portal"]["Enums"]["requirement_status"];
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          phase_id?: string | null;
          title?: string;
          description?: string | null;
          source?: Database["portal"]["Enums"]["requirement_source"];
          status?: Database["portal"]["Enums"]["requirement_status"];
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A view. */
      roles_master: {
        Row: {
          key: string | null;
          label: string | null;
          description: string | null;
          is_owner: boolean | null;
          is_staff: boolean | null;
          is_active: boolean | null;
          sort_order: number | null;
          portal_menu: string[] | null;
        };
        Insert: {
          key?: string | null;
          label?: string | null;
          description?: string | null;
          is_owner?: boolean | null;
          is_staff?: boolean | null;
          is_active?: boolean | null;
          sort_order?: number | null;
          portal_menu?: string[] | null;
        };
        Update: {
          key?: string | null;
          label?: string | null;
          description?: string | null;
          is_owner?: boolean | null;
          is_staff?: boolean | null;
          is_active?: boolean | null;
          sort_order?: number | null;
          portal_menu?: string[] | null;
        };
        Relationships: [];
      };
      /** A view. */
      services_master: {
        Row: {
          slug: string | null;
          name: string | null;
          short_name: string | null;
          summary: string | null;
          sort_order: number | null;
          is_offered: boolean | null;
        };
        Insert: {
          slug?: string | null;
          name?: string | null;
          short_name?: string | null;
          summary?: string | null;
          sort_order?: number | null;
          is_offered?: boolean | null;
        };
        Update: {
          slug?: string | null;
          name?: string | null;
          short_name?: string | null;
          summary?: string | null;
          sort_order?: number | null;
          is_offered?: boolean | null;
        };
        Relationships: [];
      };
      /** A table. */
      staff: {
        Row: {
          id: string;
          auth_user_id: string;
          full_name: string;
          email: string | null;
          role: Database["portal"]["Enums"]["staff_role"];
          is_active: boolean;
          created_at: string;
          updated_at: string;
          menu_extra: string[];
          menu_denied: string[];
          tracker_menu_extra: string[];
          tracker_menu_denied: string[];
          role_key: string | null;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          full_name: string;
          email?: string | null;
          role?: Database["portal"]["Enums"]["staff_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          menu_extra?: string[];
          menu_denied?: string[];
          tracker_menu_extra?: string[];
          tracker_menu_denied?: string[];
          role_key?: string | null;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          full_name?: string;
          email?: string | null;
          role?: Database["portal"]["Enums"]["staff_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          menu_extra?: string[];
          menu_denied?: string[];
          tracker_menu_extra?: string[];
          tracker_menu_denied?: string[];
          role_key?: string | null;
        };
        Relationships: [];
      };
      /** A view. */
      staff_workplace: {
        Row: {
          staff_id: string | null;
          auth_user_id: string | null;
          address: string | null;
          work_latitude: number | null;
          work_longitude: number | null;
          work_radius_metres: number | null;
        };
        Insert: {
          staff_id?: string | null;
          auth_user_id?: string | null;
          address?: string | null;
          work_latitude?: number | null;
          work_longitude?: number | null;
          work_radius_metres?: number | null;
        };
        Update: {
          staff_id?: string | null;
          auth_user_id?: string | null;
          address?: string | null;
          work_latitude?: number | null;
          work_longitude?: number | null;
          work_radius_metres?: number | null;
        };
        Relationships: [];
      };
      /** A table. */
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          author_staff_id: string | null;
          author_client_id: string | null;
          author_type: Database["portal"]["Enums"]["actor_type"];
          body: string;
          is_internal: boolean;
          attachments: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          author_staff_id?: string | null;
          author_client_id?: string | null;
          author_type?: Database["portal"]["Enums"]["actor_type"];
          body: string;
          is_internal?: boolean;
          attachments?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          author_staff_id?: string | null;
          author_client_id?: string | null;
          author_type?: Database["portal"]["Enums"]["actor_type"];
          body?: string;
          is_internal?: boolean;
          attachments?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      task_transfers: {
        Row: {
          id: string;
          task_id: string;
          from_staff_id: string;
          to_staff_id: string;
          reason: string;
          status: string;
          responded_at: string | null;
          response_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          from_staff_id: string;
          to_staff_id: string;
          reason: string;
          status?: string;
          responded_at?: string | null;
          response_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          from_staff_id?: string;
          to_staff_id?: string;
          reason?: string;
          status?: string;
          responded_at?: string | null;
          response_reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      tasks: {
        Row: {
          id: string;
          project_id: string;
          phase_id: string | null;
          requirement_id: string | null;
          title: string;
          description: string | null;
          status: Database["portal"]["Enums"]["task_status"];
          priority: Database["portal"]["Enums"]["task_priority"];
          assignee_id: string | null;
          created_by: string | null;
          created_by_type: Database["portal"]["Enums"]["actor_type"];
          due_date: string | null;
          estimate_hours: number | null;
          logged_hours: number;
          sort_order: number;
          is_client_visible: boolean;
          blocked_reason: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          phase_id?: string | null;
          requirement_id?: string | null;
          title: string;
          description?: string | null;
          status?: Database["portal"]["Enums"]["task_status"];
          priority?: Database["portal"]["Enums"]["task_priority"];
          assignee_id?: string | null;
          created_by?: string | null;
          created_by_type?: Database["portal"]["Enums"]["actor_type"];
          due_date?: string | null;
          estimate_hours?: number | null;
          logged_hours?: number;
          sort_order?: number;
          is_client_visible?: boolean;
          blocked_reason?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          phase_id?: string | null;
          requirement_id?: string | null;
          title?: string;
          description?: string | null;
          status?: Database["portal"]["Enums"]["task_status"];
          priority?: Database["portal"]["Enums"]["task_priority"];
          assignee_id?: string | null;
          created_by?: string | null;
          created_by_type?: Database["portal"]["Enums"]["actor_type"];
          due_date?: string | null;
          estimate_hours?: number | null;
          logged_hours?: number;
          sort_order?: number;
          is_client_visible?: boolean;
          blocked_reason?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      time_entries: {
        Row: {
          id: string;
          task_id: string;
          staff_id: string;
          minutes: number;
          note: string | null;
          logged_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          staff_id: string;
          minutes: number;
          note?: string | null;
          logged_on?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          staff_id?: string;
          minutes?: number;
          note?: string | null;
          logged_on?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      /** A table. */
      work_logs: {
        Row: {
          id: string;
          staff_id: string;
          project_id: string;
          task_id: string | null;
          on_date: string;
          minutes: number;
          summary: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          project_id: string;
          task_id?: string | null;
          on_date?: string;
          minutes: number;
          summary: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          staff_id?: string;
          project_id?: string;
          task_id?: string | null;
          on_date?: string;
          minutes?: number;
          summary?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      actor_type: "team" | "client" | "system";
      approval_status: "pending" | "approved" | "changes_requested";
      client_status: "prospect" | "active" | "paused" | "closed";
      client_user_role: "primary" | "member" | "viewer";
      day_part: "full" | "first_half" | "second_half";
      file_category: "document" | "design" | "deliverable" | "reference";
      health: "on_track" | "at_risk" | "delayed";
      leave_kind: "casual" | "sick" | "earned" | "unpaid" | "comp_off";
      leave_status: "pending" | "approved" | "declined" | "cancelled";
      member_role: "lead" | "developer" | "designer" | "qa" | "manager";
      phase_status: "not_started" | "in_progress" | "blocked" | "done";
      project_stage: "discovery" | "design" | "development" | "testing" | "launch" | "support" | "on_hold" | "closed";
      request_status: "submitted" | "under_review" | "accepted" | "declined" | "converted";
      requirement_source: "contract" | "client_request" | "internal";
      requirement_status: "agreed" | "in_progress" | "delivered" | "accepted" | "dropped";
      staff_role: "owner" | "manager" | "developer" | "designer" | "qa";
      task_priority: "low" | "normal" | "high" | "urgent";
      task_status: "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled";
    };
    CompositeTypes: Record<never, never>;
  };
};
