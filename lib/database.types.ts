/**
 * Tipi dello schema Postgres.
 *
 * In produzione questo file e' GENERATO e non si modifica a mano:
 *   npm run db:types
 * La CI falla se il file e' fuori sincrono con le migrazioni. E' il
 * meccanismo che impedisce a schema e client di divergere -- il difetto
 * opposto a quello del README di WantABook.
 *
 * Questa versione e' scritta a mano per rispecchiare esattamente
 * supabase/migrations/, cosi' che il progetto compili prima del primo
 * `supabase gen types`.
 */

export type PlaceSource = 'google' | 'manual';
export type MemberRole = 'owner' | 'admin' | 'member';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type Database = {
  /**
   * Metadati che `supabase gen types` emette e da cui supabase-js deduce la
   * versione di PostgREST per tipizzare rpc() e i filtri. Senza questo campo
   * l'inferenza degli argomenti delle funzioni cade su `undefined`.
   */
  __InternalSupabase: { PostgrestVersion: '13' };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_path: string | null;
          theme: string;
          onboarding_completed: boolean;
          /** null = account attivo. Non-null = cancellazione richiesta, in
           *  attesa dei 30 giorni di grace period (vedi 0015). */
          deletion_requested_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_path?: string | null;
          theme?: string;
          onboarding_completed?: boolean;
        };
        Update: {
          username?: string | null;
          display_name?: string | null;
          avatar_path?: string | null;
          theme?: string;
          onboarding_completed?: boolean;
          deletion_requested_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          image_path: string | null;
          owner_id: string;
          is_personal: boolean;
          created_at: string;
          /** Leggibile solo tramite le RPC di invito: nessuna select lo espone. */
          invite_code: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          image_path?: string | null;
          owner_id: string;
          is_personal?: boolean;
        };
        Update: { name?: string; description?: string | null; image_path?: string | null };
        Relationships: [];
      };
      group_members: {
        Row: { group_id: string; user_id: string; role: MemberRole; joined_at: string };
        Insert: { group_id: string; user_id: string; role?: MemberRole };
        Update: { role?: MemberRole };
        Relationships: [];
      };
      group_invitations: {
        Row: {
          id: string;
          group_id: string;
          inviter_id: string;
          invitee_id: string | null;
          invitee_email: string | null;
          token: string;
          status: InvitationStatus;
          created_at: string;
          expires_at: string;
          responded_at: string | null;
        };
        Insert: {
          group_id: string;
          inviter_id: string;
          invitee_id?: string | null;
          invitee_email?: string | null;
        };
        Update: { status?: InvitationStatus };
        Relationships: [];
      };
      places: {
        Row: {
          id: string;
          source: PlaceSource;
          google_place_id: string | null;
          google_linked_at: string | null;
          place_id_refreshed_at: string | null;
          name: string;
          address: string | null;
          cuisine: string | null;
          notes: string | null;
          cover_photo_path: string | null;
          lat: number | null;
          lng: number | null;
          coords_refreshed_at: string | null;
          official_override_pending: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source?: PlaceSource;
          google_place_id?: string | null;
          name: string;
          address?: string | null;
          cuisine?: string | null;
          notes?: string | null;
          cover_photo_path?: string | null;
          lat?: number | null;
          lng?: number | null;
          coords_refreshed_at?: string | null;
          created_by: string;
        };
        Update: {
          name?: string;
          address?: string | null;
          cuisine?: string | null;
          notes?: string | null;
          cover_photo_path?: string | null;
          lat?: number | null;
          lng?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      group_places: {
        Row: { group_id: string; place_id: string; added_by: string | null; added_at: string };
        Insert: { group_id: string; place_id: string; added_by: string };
        Update: never;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          group_id: string;
          place_id: string;
          author_id: string;
          score_location: number;
          score_service: number;
          score_menu: number;
          score_value: number;
          overall: number;
          bill_total_cents: number | null;
          party_size: number | null;
          comment: string | null;
          visited_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          place_id: string;
          author_id: string;
          score_location: number;
          score_service: number;
          score_menu: number;
          score_value: number;
          bill_total_cents?: number | null;
          party_size?: number | null;
          comment?: string | null;
          visited_on?: string | null;
        };
        Update: {
          score_location?: number;
          score_service?: number;
          score_menu?: number;
          score_value?: number;
          bill_total_cents?: number | null;
          party_size?: number | null;
          comment?: string | null;
          visited_on?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      review_photos: {
        Row: {
          id: string;
          review_id: string;
          storage_path: string;
          position: number;
          width: number | null;
          height: number | null;
          blurhash: string | null;
          created_at: string;
        };
        Insert: {
          review_id: string;
          storage_path: string;
          position?: number;
          width?: number | null;
          height?: number | null;
          blurhash?: string | null;
        };
        Update: { position?: number };
        Relationships: [];
      };
    };
    Views: {
      v_place_scores: {
        Row: {
          group_id: string | null;
          place_id: string | null;
          review_count: number | null;
          avg_location: number | null;
          avg_service: number | null;
          avg_menu: number | null;
          avg_value: number | null;
          avg_overall: number | null;
          avg_cost_per_person_cents: number | null;
          last_review_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      username_available: { Args: { p_username: string }; Returns: boolean };
      claim_username: {
        Args: { p_username: string; p_display_name?: string | null };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      search_people: {
        Args: { p_query: string };
        Returns: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_path: string | null;
        }[];
      };
      invite_to_group: {
        Args: { p_group_id: string; p_identifier: string };
        Returns: Database['public']['Tables']['group_invitations']['Row'];
      };
      respond_to_invitation: {
        Args: { p_token: string; p_accept: boolean };
        Returns: Database['public']['Tables']['group_invitations']['Row'];
      };
      move_review: {
        Args: { p_review_id: string; p_target_group_id: string };
        Returns: Database['public']['Tables']['reviews']['Row'];
      };
      link_place_to_google: {
        Args: {
          p_place_id: string;
          p_google_place_id: string;
          p_overwrite: boolean;
          p_official_name?: string | null;
          p_official_address?: string | null;
          p_lat?: number | null;
          p_lng?: number | null;
        };
        Returns: Database['public']['Tables']['places']['Row'];
      };
      get_or_create_group_invite_code: {
        Args: { p_group_id: string };
        Returns: string;
      };
      regenerate_group_invite_code: {
        Args: { p_group_id: string };
        Returns: string;
      };
      join_group_via_code: {
        Args: { p_code: string };
        Returns: Database['public']['Tables']['groups']['Row'];
      };
      request_account_deletion: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      cancel_account_deletion: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
    };
    Enums: {
      place_source: PlaceSource;
      member_role: MemberRole;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

// Alias comodi usati in tutta l'app
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupMember = Database['public']['Tables']['group_members']['Row'];
export type Invitation = Database['public']['Tables']['group_invitations']['Row'];
export type Place = Database['public']['Tables']['places']['Row'];
export type Review = Database['public']['Tables']['reviews']['Row'];
export type ReviewPhoto = Database['public']['Tables']['review_photos']['Row'];
export type PlaceScores = Database['public']['Views']['v_place_scores']['Row'];
