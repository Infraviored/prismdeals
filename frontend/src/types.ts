export interface Campaign {
  /** How many listings this campaign's results screen will show. */
  listing_count?: number;
  id: number
  name: string
  route_id?: number | null
  family_id?: number | null
}

export interface KnowledgeSet {
  id?: number
  name: string
  expert_knowledge: string
  item_json: Record<string, unknown> | string
  market_memo?: string
  good_reference_description?: string
  bad_reference_description?: string
  market_samples_json?: string
  source_search_url?: string
  sample_timestamp?: string
}

export interface SearchTarget {
  id?: number
  campaign_id: number | null
  name: string
  url: string
  enabled: boolean
  knowledge_set_id: number | null
  expert_knowledge?: string
  item_json?: Record<string, unknown> | string
}
export interface SampleListing {
  id: string
  title: string
  description: string
  details: string
}

export type FieldType = 'boolean' | 'number' | 'enum' | 'tier' | 'text';
export type MissingBehavior = 'critical_gap' | 'penalize' | 'cap_upside' | 'neutral';
export type Polarity = 'positive' | 'negative' | 'neutral';

export interface FieldDefinition {
  id: string;
  label: string;
  description?: string;
  type: FieldType;
  unit?: string;
  values?: string[];
  importance: 'high' | 'medium' | 'low';
  buyer_wants?: Record<string, unknown>;
  missing_behavior?: MissingBehavior;
  polarity?: Polarity;
  extraction_hint?: string;
}

export interface ExtractedFieldValue {
  value: string | number | boolean | null;
  evidence_quote?: string;
  reasoning?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface Listing {
  id: string
  title: string
  price: string
  price_eur?: number | null
  location: string
  url: string
  short_description: string
  detailed_description: string
  first_seen_at?: string | null
  last_seen_at?: string | null
  extracted_facts: Record<string, unknown>
  niceness_score?: number | null
  status: string
  search_id: number
  item_name?: string
  campaign_name?: string
  llm_processed: boolean
  llm_processed_time?: string
  last_description_changed_at?: string
  last_ai_evaluated_at?: string
  details?: Record<string, string>
  images?: string[]
  year?: string
  mileage?: string
  cubic_capacity?: string
  date_string?: string
  summary?: string
  criteria_evaluations?: {
    id?: string
    name: string
    reasoning: string
    status: 'satisfied' | 'neutral' | 'violated' | 'Needs Re-Evaluation'
    value?: unknown
  }[]
  field_evaluations?: {
    field: FieldDefinition
    extracted: ExtractedFieldValue
    status: 'satisfied' | 'partial' | 'violated' | 'missing' | 'missing_critical'
  }[]
  highlights?: {
    label: string
    type: 'maintenance' | 'warning' | 'feature'
    sentiment: 'positive' | 'negative' | 'neutral'
    evidence_quote: string
    confidence: 'high' | 'med' | 'low'
  }[]
  special_info?: string[]
  draft_message?: string
  description?: string
  dimensions?: Record<string, { score: number; reasoning: string }>
  reference_comparison?: { closer_to: 'good' | 'bad' | 'mixed'; reasoning: string }
  matched_terms?: MatchedTerm[]
}

export interface ScraperProgressCardProps {
  isScraping: boolean;
  scrapingStatus: string;
  scrapingProgress: {
    phase: string;
    current: number;
    total: number;
    status: string;
  } | null;
  liveLogs: string;
  showLogConsole: boolean;
  setShowLogConsole: (val: boolean) => void;
}

export interface ParsedKnowledgeConfig {
  product_domain?: string;
  dimensions_enabled?: boolean;
  dimensions_weight?: number;
  fields?: FieldDefinition[];
  extraction_criteria?: {
    id: string;
    description?: string;
    type?: string;
    question?: string;
  }[];
  scoring_model?: {
    weights?: Record<string, {
      satisfied_if?: unknown;
      importance?: number;
    }>;
  };
}

export interface SearchFamilyTerm {
  id?: number;
  family_id?: number;
  term: string;
  label: string;
  enabled: boolean;
  position?: number;
  listings?: number;
  /** How many of those listings the requirements judged a fit. */
  fit_listings?: number;
}

export interface SearchFamily {
  id: number;
  name: string;
  base_url: string;
  campaign_id?: number | null;
  knowledge_set_id?: number | null;
  route_search_id?: number | null;
  enabled: boolean;
  created_at?: string;
  terms?: SearchFamilyTerm[];
  searches?: number;
  listings?: number;
  has_crawled?: boolean;
  last_crawled_at?: string | null;
  radius_diagnosis?: RadiusDiagnosis | null;
}

export interface RadiusDiagnosisOption {
  radius: number;
  count: number;
}

export interface RadiusDiagnosisTerm {
  id?: number;
  term: string;
  label: string;
  counts: Record<string, number>;
}

export interface RadiusDiagnosis {
  current_radius: number;
  measured_at: string;
  options: RadiusDiagnosisOption[];
  terms: RadiusDiagnosisTerm[];
}

export interface SearchFamilyPreview {
  terms: number;
  circles: number;
  searches: number;
  new_searches: number;
  reused_searches: number;
  pages: number;
  estimated_seconds: number;
  urls: Array<{
    term: string;
    label: string;
    url: string;
    exists: boolean;
  }>;
  conflicts: Array<{
    url: string;
    search_id: number;
    label: string;
    reasons: string[];
  }>;
}

export interface MatchedTerm {
  id: number;
  label: string;
  term?: string;
}

export interface RouteCircle {
  lat: number;
  lon: number;
  radius_km: number;
  label?: string;
  postal_code?: string;
}

export interface RouteListingGeo {
  id: string;
  title: string;
  price?: string | null;
  price_eur?: number | null;
  location?: string | null;
  lat?: number | null;
  lon?: number | null;
  offroute_km?: number | null;
  detour_min?: number | null;
  images?: string[];
  url?: string;
  niceness_score?: number | null;
  llm_processed?: boolean;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  matched_terms?: Array<{ id: number; label: string }>;
  is_deal?: boolean;
  geo_status?: string | null;
}

export interface RouteCorridorData {
  route: {
    id: number;
    campaign_id: number;
    family_id?: number | null;
    name: string;
    base_url: string;
    origin: string;
    destination: string;
    radius_km: number;
    half_width_km: number;
    distance_km: number | null;
    duration_min: number | null;
    polyline: [number, number][];
    circles: RouteCircle[];
  };
  listings: RouteListingGeo[];
  total?: number;
  offset?: number;
  limit?: number;
  counts: {
    total: number;
    routed: number;
    unplaced: number;
  };
}

