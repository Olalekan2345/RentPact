/**
 * Hand-written to match supabase/migrations/0001_init.sql. If the schema
 * changes, update this alongside the migration — there's no live project to
 * run `supabase gen types` against yet.
 *
 * Two non-obvious requirements, both needed for @supabase/postgrest-js's
 * generics to resolve correctly instead of silently collapsing to `never`:
 *  - every table needs a `Relationships` array (even if empty) — this is
 *    what `supabase gen types` always emits, so it's reproduced here.
 *  - everything must be a `type` alias, not an `interface`. An interface
 *    doesn't structurally satisfy `Record<string, X>` in the conditional-type
 *    checks postgrest-js uses internally (interfaces are "open"/extendable,
 *    so TS won't treat them as satisfying an index signature there), even
 *    though it looks identical to a `type` alias everywhere else.
 */

type ProfilesRow = {
  email: string;
  auth_user_id: string | null;
  name: string | null;
  photo_url: string | null;
  member_since: number;
};

type ListingsRow = {
  id: string;
  landlord_email: string;
  landlord_address: string | null;
  property_address: string;
  property_type: string;
  photo_url: string | null;
  amount_per_period: number;
  total_periods: number;
  frequency: string;
  created_at: number;
  active: boolean;
  condition: unknown | null;
  amenities: string[];
  security_deposit: number | null;
  house_rules: string;
  notice_period_days: number | null;
};

type MessagesRow = {
  id: string;
  lease_id: string | null;
  listing_id: string | null;
  from_email: string;
  to_email: string;
  type: string;
  text: string;
  created_at: number;
  read_at: number | null;
  maintenance: unknown | null;
};

type NotificationPrefsRow = {
  email: string;
  money: boolean;
  lease: boolean;
  maintenance: boolean;
  dispute: boolean;
  messages: boolean;
};

type NotificationReadsRow = {
  email: string;
  notification_id: string;
  read_at: number;
};

type ReviewsRow = {
  id: string;
  lease_id: string;
  from_email: string;
  to_email: string;
  rating: number;
  comment: string;
  created_at: number;
};

type PrivacyPrefsRow = {
  email: string;
  show_reputation: boolean;
  show_rental_history: boolean;
  show_reviews: boolean;
};

type TemplatesRow = {
  id: string;
  landlord_email: string;
  name: string;
  property_type: string;
  amenities: string[];
  amount_per_period: number;
  total_periods: number;
  frequency: string;
  security_deposit: number | null;
  house_rules: string;
  notice_period_days: number | null;
  maintenance_landlord: string;
  maintenance_tenant: string;
  created_at: number;
};

type LeaseListingLinksRow = {
  lease_id: string;
  listing_id: string;
};

type LeaseConstitutionsRow = {
  lease_id: string;
  version: string;
  hash: string;
  accepted_at: number;
};

type DisputeRulingsRow = {
  lease_id: string;
  resolved_at: number;
  reasoning: string;
  hash: string;
};

type MoveOutConditionsRow = {
  lease_id: string;
  submitted_by: string;
  notes: string;
  photos: unknown;
  declared_at: number;
  hash: string;
};

type LeaseMetadataRow = {
  lease_id: string;
  property_address: string;
  property_type: string;
  photo_url: string | null;
  tenant_email: string;
  landlord_email: string;
};

type WalletTransfersRow = {
  id: string;
  email: string;
  to_address: string;
  amount: number;
  tx_hash: string;
  created_at: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: Partial<ProfilesRow> & { email: string; member_since: number };
        Update: Partial<ProfilesRow>;
        Relationships: [];
      };
      listings: {
        Row: ListingsRow;
        Insert: Partial<ListingsRow> & {
          id: string;
          landlord_email: string;
          property_address: string;
          property_type: string;
          amount_per_period: number;
          total_periods: number;
          frequency: string;
          created_at: number;
        };
        Update: Partial<ListingsRow>;
        Relationships: [];
      };
      messages: {
        Row: MessagesRow;
        Insert: Partial<MessagesRow> & {
          id: string;
          from_email: string;
          to_email: string;
          type: string;
          text: string;
          created_at: number;
        };
        Update: Partial<MessagesRow>;
        Relationships: [];
      };
      notification_prefs: {
        Row: NotificationPrefsRow;
        Insert: Partial<NotificationPrefsRow> & { email: string };
        Update: Partial<NotificationPrefsRow>;
        Relationships: [];
      };
      notification_reads: {
        Row: NotificationReadsRow;
        Insert: NotificationReadsRow;
        Update: Partial<NotificationReadsRow>;
        Relationships: [];
      };
      reviews: {
        Row: ReviewsRow;
        Insert: ReviewsRow;
        Update: Partial<ReviewsRow>;
        Relationships: [];
      };
      privacy_prefs: {
        Row: PrivacyPrefsRow;
        Insert: Partial<PrivacyPrefsRow> & { email: string };
        Update: Partial<PrivacyPrefsRow>;
        Relationships: [];
      };
      templates: {
        Row: TemplatesRow;
        Insert: Partial<TemplatesRow> & {
          id: string;
          landlord_email: string;
          name: string;
          property_type: string;
          amount_per_period: number;
          total_periods: number;
          frequency: string;
          created_at: number;
        };
        Update: Partial<TemplatesRow>;
        Relationships: [];
      };
      lease_listing_links: {
        Row: LeaseListingLinksRow;
        Insert: LeaseListingLinksRow;
        Update: Partial<LeaseListingLinksRow>;
        Relationships: [];
      };
      lease_constitutions: {
        Row: LeaseConstitutionsRow;
        Insert: LeaseConstitutionsRow;
        Update: Partial<LeaseConstitutionsRow>;
        Relationships: [];
      };
      dispute_rulings: {
        Row: DisputeRulingsRow;
        Insert: DisputeRulingsRow;
        Update: Partial<DisputeRulingsRow>;
        Relationships: [];
      };
      move_out_conditions: {
        Row: MoveOutConditionsRow;
        Insert: MoveOutConditionsRow;
        Update: Partial<MoveOutConditionsRow>;
        Relationships: [];
      };
      wallet_transfers: {
        Row: WalletTransfersRow;
        Insert: WalletTransfersRow;
        Update: Partial<WalletTransfersRow>;
        Relationships: [];
      };
      lease_metadata: {
        Row: LeaseMetadataRow;
        Insert: LeaseMetadataRow;
        Update: Partial<LeaseMetadataRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
