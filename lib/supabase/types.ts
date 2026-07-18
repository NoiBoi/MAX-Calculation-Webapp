export type Json = string | number | boolean | null | { readonly [key: string]: Json | undefined } | readonly Json[];

export type LabRole = "admin" | "member" | "viewer";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { user_id: string; display_name: string | null; created_at: string; updated_at: string };
        Insert: { user_id: string; display_name?: string | null; created_at?: string; updated_at?: string };
        Update: { display_name?: string | null; updated_at?: string };
        Relationships: [];
      };
      labs: {
        Row: { id: string; name: string; description: string; created_at: string; created_by: string; updated_at: string; archived_at: string | null; retention_policy: Json };
        Insert: { id?: string; name: string; description?: string; created_at?: string; created_by: string; updated_at?: string; archived_at?: string | null; retention_policy?: Json };
        Update: { name?: string; description?: string; updated_at?: string; archived_at?: string | null; retention_policy?: Json };
        Relationships: [];
      };
      lab_members: {
        Row: { lab_id: string; user_id: string; role: LabRole; membership_status: "invited" | "active" | "suspended" | "removed"; email_normalized: string | null; invited_by: string | null; joined_at: string | null; created_at: string; updated_at: string; removed_at: string | null };
        Insert: { lab_id: string; user_id: string; role?: LabRole; membership_status?: "invited" | "active" | "suspended" | "removed"; email_normalized?: string | null; invited_by?: string | null; joined_at?: string | null; created_at?: string; updated_at?: string; removed_at?: string | null };
        Update: { role?: LabRole; membership_status?: "invited" | "active" | "suspended" | "removed"; email_normalized?: string | null; invited_by?: string | null; joined_at?: string | null; updated_at?: string; removed_at?: string | null };
        Relationships: [];
      };
      lab_invitations: {
        Row: { id: string; lab_id: string; email_normalized: string; intended_role: LabRole; token_digest: string; invited_by: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string };
        Insert: { id?: string; lab_id: string; email_normalized: string; intended_role: LabRole; token_digest: string; invited_by: string; expires_at: string; accepted_at?: string | null; revoked_at?: string | null; created_at?: string };
        Update: { accepted_at?: string | null; revoked_at?: string | null };
        Relationships: [];
      };
      lab_library_entries: {
        Row: { id: string; lab_id: string; title: string; description: string; current_version_id: string | null; created_by: string; created_at: string; updated_at: string; archived_at: string | null; archived_by: string | null; purge_eligible_at: string | null; visibility_status: "active" | "archived" | "retention-hold"; retention_hold_reason: string | null; version: number; sync_sequence: number };
        Insert: never; Update: never; Relationships: [];
      };
      lab_library_versions: {
        Row: { id: string; entry_id: string; lab_id: string; version_number: number; source_personal_recipe_id: string | null; source_personal_revision_id: string | null; published_by: string; publication_note: string; scientific_input: Json; calculation_snapshot: Json; schema_version: string; engine_version: string; content_digest: string; adjusted_feed_formula: string | null; target_formula: string; verification_status: string; warning_count: number; created_at: string; sync_sequence: number };
        Insert: never; Update: never; Relationships: [];
      };
      lab_publication_notes: {
        Row: { id: string; lab_id: string; entry_id: string; publication_version_id: string; source_personal_note_id: string | null; category: string; title: string; body: string; tags: string[]; experiment_date: string | null; published_by: string; created_at: string; content_digest: string; sync_sequence: number };
        Insert: never; Update: never; Relationships: [];
      };
      lab_audit_events: {
        Row: { id: string; lab_id: string; actor_user_id: string | null; event_type: string; target_type: string; target_id: string | null; target_version_id: string | null; metadata: Json; occurred_at: string; request_id: string | null; source_device_id: string | null; sync_sequence: number };
        Insert: never; Update: never; Relationships: [];
      };
      recipes: {
        Row: { id: string; local_record_id: string; owner_id: string; name: string; target_formula: string; description: string; tags: string[]; current_revision_id: string | null; archived_at: string | null; created_at: string; updated_at: string; version: number; deleted_at: string | null; sync_sequence: number; source_installation_id: string | null };
        Insert: { id: string; local_record_id: string; owner_id: string; name: string; target_formula?: string; description?: string; tags?: string[]; current_revision_id?: string | null; archived_at?: string | null; created_at: string; updated_at?: string; version?: number; deleted_at?: string | null; source_installation_id?: string | null };
        Update: { name?: string; target_formula?: string; description?: string; tags?: string[]; current_revision_id?: string | null; archived_at?: string | null; deleted_at?: string | null; source_installation_id?: string | null };
        Relationships: [];
      };
      recipe_revisions: {
        Row: { id: string; local_record_id: string; recipe_id: string; owner_id: string; revision_number: number; scientific_input: Json; calculation_snapshot: Json; schema_version: string; engine_version: string; revision_note: string | null; created_at: string; created_by: string; content_digest: string; sync_sequence: number; source_installation_id: string | null };
        Insert: { id: string; local_record_id: string; recipe_id: string; owner_id: string; revision_number: number; scientific_input: Json; calculation_snapshot: Json; schema_version: string; engine_version: string; revision_note?: string | null; created_at: string; created_by: string; content_digest: string; source_installation_id?: string | null };
        Update: never;
        Relationships: [];
      };
      recipe_notes: {
        Row: { id: string; local_record_id: string; recipe_id: string; revision_id: string | null; owner_id: string; category: string; title: string; body: string; tags: string[]; experiment_date: string | null; operator: string | null; archived_at: string | null; created_at: string; updated_at: string; version: number; deleted_at: string | null; sync_sequence: number; source_installation_id: string | null };
        Insert: { id: string; local_record_id: string; recipe_id: string; revision_id?: string | null; owner_id: string; category: string; title: string; body: string; tags?: string[]; experiment_date?: string | null; operator?: string | null; archived_at?: string | null; created_at: string; updated_at?: string; version?: number; deleted_at?: string | null; source_installation_id?: string | null };
        Update: { category?: string; title?: string; body?: string; tags?: string[]; experiment_date?: string | null; operator?: string | null; archived_at?: string | null; deleted_at?: string | null; source_installation_id?: string | null };
        Relationships: [];
      };
      comparisons: {
        Row: { id: string; local_record_id: string; owner_id: string; name: string; comparison_data: Json; schema_version: string; created_at: string; updated_at: string; version: number; deleted_at: string | null; sync_sequence: number; source_installation_id: string | null };
        Insert: { id: string; local_record_id: string; owner_id: string; name: string; comparison_data: Json; schema_version: string; created_at: string; updated_at?: string; version?: number; deleted_at?: string | null; source_installation_id?: string | null };
        Update: { name?: string; comparison_data?: Json; schema_version?: string; deleted_at?: string | null; source_installation_id?: string | null };
        Relationships: [];
      };
      user_settings: {
        Row: { owner_id: string; settings_data: Json; schema_version: string; updated_at: string; version: number; sync_sequence: number; source_installation_id: string | null };
        Insert: { owner_id: string; settings_data: Json; schema_version: string; updated_at?: string; version?: number; source_installation_id?: string | null };
        Update: { settings_data?: Json; schema_version?: string; source_installation_id?: string | null };
        Relationships: [];
      };
      user_devices: {
        Row: { id: string; owner_id: string; installation_id: string; display_name: string | null; last_sync_at: string | null; created_at: string; updated_at: string };
        Insert: { id: string; owner_id: string; installation_id: string; display_name?: string | null; last_sync_at?: string | null; created_at?: string; updated_at?: string };
        Update: { display_name?: string | null; last_sync_at?: string | null; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_own_profile: {
        Args: Record<PropertyKey, never>;
        Returns: { user_id: string; display_name: string | null; created_at: string; updated_at: string }[];
      };
      is_lab_member: {
        Args: { target_lab_id: string };
        Returns: boolean;
      };
      get_maxcalc_sync_high_watermark: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      apply_recipe_bundle: {
        Args: { recipe_payload: Json; revision_payloads: Json; expected_version?: number | null };
        Returns: Database["public"]["Tables"]["recipes"]["Row"];
      };
      create_private_lab: { Args: { lab_name: string; lab_description: string; request_id?: string | null }; Returns: string };
      create_lab_invitation: { Args: { target_lab_id: string; normalized_email: string; intended_role: LabRole; invitation_digest: string; invitation_expires_at: string; request_id?: string | null }; Returns: Database["public"]["Tables"]["lab_invitations"]["Row"] };
      revoke_lab_invitation: { Args: { invitation_id: string; request_id?: string | null }; Returns: undefined };
      accept_lab_invitation: { Args: { invitation_digest: string; request_id?: string | null }; Returns: string };
      manage_lab_member: { Args: { target_lab_id: string; target_user_id: string; requested_role: LabRole; requested_status: "active" | "suspended" | "removed"; request_id?: string | null }; Returns: undefined };
      publish_lab_version: { Args: { target_lab_id: string; target_entry_id?: string | null; expected_entry_version?: number | null; publication_title: string; publication_description: string; source_recipe_id: string; source_revision_id: string; publication_note: string; scientific_input: Json; calculation_snapshot: Json; schema_version: string; engine_version: string; content_digest: string; adjusted_feed_formula?: string | null; target_formula: string; verification_status: string; warning_count: number; selected_notes?: Json; acknowledge_target_change?: boolean; request_id?: string | null; source_device_id?: string | null }; Returns: Json };
      set_lab_entry_state: { Args: { target_entry_id: string; action: string; expected_version: number; hold_reason?: string | null; request_id?: string | null }; Returns: Database["public"]["Tables"]["lab_library_entries"]["Row"] };
      purge_lab_entry: { Args: { target_entry_id: string; confirmation_title: string; request_id?: string | null }; Returns: undefined };
      update_lab_settings: { Args: { target_lab_id: string; lab_name: string; lab_description: string; retention_days?: number | null; request_id?: string | null }; Returns: Database["public"]["Tables"]["labs"]["Row"] };
      get_lab_sync_high_watermark: { Args: { target_lab_id: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface AuthUserSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly emailConfirmed: boolean;
  readonly createdAt?: string;
}

export function summarizeAuthUser(user: Readonly<{ id: string; email?: string; email_confirmed_at?: string; created_at?: string; user_metadata?: Readonly<Record<string, unknown>> }>): AuthUserSummary {
  const displayName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
  return { id: user.id, email: user.email ?? "", displayName: displayName || user.email?.split("@")[0] || "MAXCalc user", emailConfirmed: Boolean(user.email_confirmed_at), ...(user.created_at ? { createdAt: user.created_at } : {}) };
}
