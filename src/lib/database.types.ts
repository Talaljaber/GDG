export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      blocked_terms: {
        Row: {
          added_at: string
          lang: string
          match: Database["public"]["Enums"]["term_match"]
          term_key: string
        }
        Insert: {
          added_at?: string
          lang: string
          match?: Database["public"]["Enums"]["term_match"]
          term_key: string
        }
        Update: {
          added_at?: string
          lang?: string
          match?: Database["public"]["Enums"]["term_match"]
          term_key?: string
        }
        Relationships: []
      }
      event_days: {
        Row: {
          ended_at: string | null
          id: string
          is_current: boolean
          label: string
          started_at: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          is_current?: boolean
          label: string
          started_at?: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          is_current?: boolean
          label?: string
          started_at?: string
        }
        Relationships: []
      }
      hidden_names: {
        Row: {
          hidden_at: string
          name_key: string
          note: string | null
        }
        Insert: {
          hidden_at?: string
          name_key: string
          note?: string | null
        }
        Update: {
          hidden_at?: string
          name_key?: string
          note?: string | null
        }
        Relationships: []
      }
      keepalive: {
        Row: {
          id: number
          pinged_at: string
        }
        Insert: {
          id: number
          pinged_at?: string
        }
        Update: {
          id?: number
          pinged_at?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          display_suffix: number | null
          id: string
          joined_at: string
          name: string
          name_key: string
          player_id: string
          progress: Database["public"]["Enums"]["player_progress"]
          progress_round: number | null
          removed_at: string | null
          session_id: string
          status: Database["public"]["Enums"]["player_status"]
        }
        Insert: {
          display_suffix?: number | null
          id?: string
          joined_at?: string
          name: string
          name_key: string
          player_id: string
          progress?: Database["public"]["Enums"]["player_progress"]
          progress_round?: number | null
          removed_at?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["player_status"]
        }
        Update: {
          display_suffix?: number | null
          id?: string
          joined_at?: string
          name?: string
          name_key?: string
          player_id?: string
          progress?: Database["public"]["Enums"]["player_progress"]
          progress_round?: number | null
          removed_at?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["player_status"]
        }
        Relationships: [
          {
            foreignKeyName: "players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          end_reason: Database["public"]["Enums"]["round_end_reason"] | null
          ended_at: string | null
          game: Database["public"]["Enums"]["game_id"]
          id: string
          round_no: number
          session_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          end_reason?: Database["public"]["Enums"]["round_end_reason"] | null
          ended_at?: string | null
          game: Database["public"]["Enums"]["game_id"]
          id?: string
          round_no: number
          session_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          end_reason?: Database["public"]["Enums"]["round_end_reason"] | null
          ended_at?: string | null
          game?: Database["public"]["Enums"]["game_id"]
          id?: string
          round_no?: number
          session_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          client_version: string | null
          created_at: string
          display_suffix: number | null
          duration_ms: number
          event_day_id: string
          game: Database["public"]["Enums"]["game_id"]
          id: string
          name: string
          name_key: string
          player_id: string
          player_row_id: string
          raw: Json
          round_id: string
          score: number
          session_id: string
        }
        Insert: {
          client_version?: string | null
          created_at?: string
          display_suffix?: number | null
          duration_ms: number
          event_day_id: string
          game: Database["public"]["Enums"]["game_id"]
          id?: string
          name: string
          name_key: string
          player_id: string
          player_row_id: string
          raw: Json
          round_id: string
          score: number
          session_id: string
        }
        Update: {
          client_version?: string | null
          created_at?: string
          display_suffix?: number | null
          duration_ms?: number
          event_day_id?: string
          game?: Database["public"]["Enums"]["game_id"]
          id?: string
          name?: string
          name_key?: string
          player_id?: string
          player_row_id?: string
          raw?: Json
          round_id?: string
          score?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_event_day_id_fkey"
            columns: ["event_day_id"]
            isOneToOne: false
            referencedRelation: "event_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_player_row_id_fkey"
            columns: ["player_row_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          closed_at: string | null
          code: string
          created_at: string
          current_round: number | null
          day_board_shown_at: string | null
          ended_at: string | null
          event_day_id: string
          id: string
          lineup: Database["public"]["Enums"]["game_id"][]
          opened_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          closed_at?: string | null
          code: string
          created_at?: string
          current_round?: number | null
          day_board_shown_at?: string | null
          ended_at?: string | null
          event_day_id: string
          id?: string
          lineup: Database["public"]["Enums"]["game_id"][]
          opened_at?: string | null
          started_at?: string | null
          status: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          closed_at?: string | null
          code?: string
          created_at?: string
          current_round?: number | null
          day_board_shown_at?: string | null
          ended_at?: string | null
          event_day_id?: string
          id?: string
          lineup?: Database["public"]["Enums"]["game_id"][]
          opened_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sessions_event_day_id_fkey"
            columns: ["event_day_id"]
            isOneToOne: false
            referencedRelation: "event_days"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_day_board: {
        Row: {
          achieved_at: string | null
          event_day_id: string | null
          game: Database["public"]["Enums"]["game_id"] | null
          name: string | null
          name_key: string | null
          score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_event_day_id_fkey"
            columns: ["event_day_id"]
            isOneToOne: false
            referencedRelation: "event_days"
            referencedColumns: ["id"]
          },
        ]
      }
      v_round_board: {
        Row: {
          created_at: string | null
          display_suffix: number | null
          game: Database["public"]["Enums"]["game_id"] | null
          name: string | null
          player_row_id: string | null
          round_id: string | null
          score: number | null
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_suffix?: number | null
          game?: Database["public"]["Enums"]["game_id"] | null
          name?: string | null
          player_row_id?: string | null
          round_id?: string | null
          score?: number | null
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_suffix?: number | null
          game?: Database["public"]["Enums"]["game_id"] | null
          name?: string | null
          player_row_id?: string | null
          round_id?: string | null
          score?: number | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_player_row_id_fkey"
            columns: ["player_row_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      v_session_board: {
        Row: {
          display_suffix: number | null
          joined_at: string | null
          name: string | null
          player_row_id: string | null
          rounds_scored: number | null
          session_id: string | null
          total: number | null
          total_duration_ms: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_player_row_id_fkey"
            columns: ["player_row_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_add_blocked_term: {
        Args: {
          p_lang?: string
          p_match?: Database["public"]["Enums"]["term_match"]
          p_term: string
        }
        Returns: undefined
      }
      admin_end_round: {
        Args: {
          p_reason: Database["public"]["Enums"]["round_end_reason"]
          p_round: string
        }
        Returns: undefined
      }
      admin_hide_name: {
        Args: { p_name_key: string; p_note?: string }
        Returns: undefined
      }
      admin_new_session: {
        Args: never
        Returns: {
          closed_at: string | null
          code: string
          created_at: string
          current_round: number | null
          day_board_shown_at: string | null
          ended_at: string | null
          event_day_id: string
          id: string
          lineup: Database["public"]["Enums"]["game_id"][]
          opened_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_open_lobby: {
        Args: { p_lineup: Database["public"]["Enums"]["game_id"][] }
        Returns: {
          closed_at: string | null
          code: string
          created_at: string
          current_round: number | null
          day_board_shown_at: string | null
          ended_at: string | null
          event_day_id: string
          id: string
          lineup: Database["public"]["Enums"]["game_id"][]
          opened_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_remove_blocked_term: {
        Args: { p_term_key: string }
        Returns: undefined
      }
      admin_remove_player: {
        Args: { p_player_row: string }
        Returns: undefined
      }
      admin_set_lineup: {
        Args: {
          p_lineup: Database["public"]["Enums"]["game_id"][]
          p_session: string
        }
        Returns: undefined
      }
      admin_show_day_board: { Args: { p_session: string }; Returns: undefined }
      admin_start_new_day: {
        Args: { p_label: string }
        Returns: {
          ended_at: string | null
          id: string
          is_current: boolean
          label: string
          started_at: string
        }
        SetofOptions: {
          from: "*"
          to: "event_days"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_start_round: { Args: { p_round: string }; Returns: undefined }
      admin_start_session: { Args: { p_session: string }; Returns: Json }
      admin_unhide_name: { Args: { p_name_key: string }; Returns: undefined }
      join_session: { Args: { p_code: string; p_name: string }; Returns: Json }
      keepalive: { Args: never; Returns: undefined }
      server_now: { Args: never; Returns: string }
    }
    Enums: {
      game_id:
        | "odd_one_out"
        | "stop_the_clock"
        | "simon"
        | "perfect_circle"
        | "trivia"
        | "close_brackets"
        | "color_clash"
      player_progress: "waiting" | "playing" | "finished"
      player_status: "joined" | "removed"
      round_end_reason: "all_finished" | "time_cap" | "force_end"
      round_status: "upcoming" | "playing" | "done"
      session_status: "pending" | "lobby" | "playing" | "results" | "closed"
      term_match: "word" | "substring"
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
    Enums: {
      game_id: [
        "odd_one_out",
        "stop_the_clock",
        "simon",
        "perfect_circle",
        "trivia",
        "close_brackets",
        "color_clash",
      ],
      player_progress: ["waiting", "playing", "finished"],
      player_status: ["joined", "removed"],
      round_end_reason: ["all_finished", "time_cap", "force_end"],
      round_status: ["upcoming", "playing", "done"],
      session_status: ["pending", "lobby", "playing", "results", "closed"],
      term_match: ["word", "substring"],
    },
  },
} as const

