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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_pages: {
        Row: {
          ai_comment: string | null
          audit_id: string
          created_at: string | null
          exclude_from_audit_score: boolean
          fixes: Json | null
          geo_results: Json | null
          id: string
          manual_notes: string | null
          score: number | null
          seo_results: Json | null
          sitemap_category_label: string | null
          url: string
        }
        Insert: {
          ai_comment?: string | null
          audit_id: string
          created_at?: string | null
          exclude_from_audit_score?: boolean
          fixes?: Json | null
          geo_results?: Json | null
          id?: string
          manual_notes?: string | null
          score?: number | null
          seo_results?: Json | null
          sitemap_category_label?: string | null
          url: string
        }
        Update: {
          ai_comment?: string | null
          audit_id?: string
          created_at?: string | null
          exclude_from_audit_score?: boolean
          fixes?: Json | null
          geo_results?: Json | null
          id?: string
          manual_notes?: string | null
          score?: number | null
          seo_results?: Json | null
          sitemap_category_label?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_pages_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_jobs: {
        Row: {
          id: string
          audit_id: string
          status: string
          attempts: number
          max_attempts: number
          lease_until: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          audit_id: string
          status?: string
          attempts?: number
          max_attempts?: number
          lease_until?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          audit_id?: string
          status?: string
          attempts?: number
          max_attempts?: number
          lease_until?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_jobs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          key: string
          window_start: string
          count: number
          updated_at: string
        }
        Insert: {
          key: string
          window_start?: string
          count?: number
          updated_at?: string
        }
        Update: {
          key?: string
          window_start?: string
          count?: number
          updated_at?: string
        }
        Relationships: []
      }
      audits: {
        Row: {
          community_id: string
          created_at: string | null
          engine_version: number
          geo_score: number | null
          id: string
          max_pages: number | null
          pages_crawled: number
          progress_total: number | null
          report_generated_at: string | null
          report_pdf_path: string | null
          score: number | null
          seo_score: number | null
          shard_urls: string[] | null
          site_wide_checks: Json | null
          crux_field_checks: Json | null
          near_duplicate_checks: Json | null
          status: string
          target_urls: string[] | null
        }
        Insert: {
          community_id: string
          created_at?: string | null
          engine_version?: number
          geo_score?: number | null
          id?: string
          max_pages?: number | null
          pages_crawled?: number
          progress_total?: number | null
          report_generated_at?: string | null
          report_pdf_path?: string | null
          score?: number | null
          seo_score?: number | null
          shard_urls?: string[] | null
          site_wide_checks?: Json | null
          crux_field_checks?: Json | null
          near_duplicate_checks?: Json | null
          status?: string
          target_urls?: string[] | null
        }
        Update: {
          community_id?: string
          created_at?: string | null
          engine_version?: number
          geo_score?: number | null
          id?: string
          max_pages?: number | null
          pages_crawled?: number
          progress_total?: number | null
          report_generated_at?: string | null
          report_pdf_path?: string | null
          score?: number | null
          seo_score?: number | null
          shard_urls?: string[] | null
          site_wide_checks?: Json | null
          crux_field_checks?: Json | null
          near_duplicate_checks?: Json | null
          status?: string
          target_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          company_id: string
          created_at: string | null
          facility_type: string | null
          id: string
          manual_check_results: Json | null
          name: string
          website_url: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          facility_type?: string | null
          id?: string
          manual_check_results?: Json | null
          name: string
          website_url: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          facility_type?: string | null
          id?: string
          manual_check_results?: Json | null
          name?: string
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string | null
          id: string
          plan: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_sub_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_rate_limit: {
        Args: {
          p_key: string
          p_max: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      list_company_members_with_email: {
        Args: {
          p_company_id: string
        }
        Returns: {
          user_id: string
          email: string
          role: string
          created_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
