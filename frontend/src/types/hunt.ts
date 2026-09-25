/** The hunt as the backend stores it (backend/hunts_api.js is the contract). */

export type Op = 'min' | 'max' | 'eq' | 'in' | 'not_in' | 'present' | 'absent';
export type Importance = 'must' | 'wish';
export type Verdict = 'fit' | 'unclear' | 'no';

export interface Condition {
  id?: number;
  attr_id?: string | null;
  label: string;
  op: Op;
  value: number | string | string[] | null;
  importance: Importance;
  /** Server-rendered, e.g. "Kilometerstand bis 5000". */
  text?: string;
}

export interface Attribute {
  id: string;
  label: string;
  type: 'number' | 'boolean' | 'enum' | 'text';
  unit: string | null;
  options: { value: string; label: string }[] | null;
  site_filter: string | null;
}

export interface Target {
  node_id?: number;
  typed: string;
  name?: string;
  key?: string;
  kind?: string;
  status?: string;
  years?: [number, number | null] | null;
  attributes?: Attribute[];
  conditions: Condition[];
}

export interface Frame {
  max_price: number | null;
  location_id?: number | null;
  place?: string | null;
  radius_km?: number | null;
}

export interface HuntRoute {
  id: number;
  origin: string;
  destination: string;
  half_width_km: number;
}

export interface CrawlTerm {
  id: number;
  label: string;
  searches: number;
}

export interface HuntDocument {
  id?: number;
  name: string;
  text: string;
  category_code: string;
  category_name?: string;
  frame: Frame;
  targets: Target[];
  /** For all targets. */
  conditions: Condition[];
  family_id?: number | null;
  route?: HuntRoute | null;
  crawl?: CrawlTerm[];
}

export interface VerdictCounts {
  all: number;
  fit: number;
  unclear: number;
  no: number;
}

/** One row of GET /api/hunts. */
export interface HuntSummary {
  id: number;
  name: string;
  targets: string[];
  frame: Frame;
  route: { origin: string; destination: string } | null;
  counts: VerdictCounts;
  newest: {
    id: string;
    title: string;
    price: string | null;
    image: string | null;
    first_seen_at: string | null;
  } | null;
}

export type ConditionState = 'met' | 'violated' | 'open';

export interface Fit {
  verdict: Verdict;
  reason: string;
  states: Record<string, ConditionState>;
  target_id: number | null;
}

export interface OverviewCondition extends Condition {
  node_id: number | null;
  met: number;
  violated: number;
  open: number;
  total: number;
}

export interface HuntOverview {
  pots: VerdictCounts;
  rejections: Array<{ reason: string; count: number; examples: string[] }>;
  markets: Array<{ node_id: number; name: string; count: number; median: number | null }>;
  price_distribution: {
    min: number | null;
    max: number | null;
    count: number;
    bins: Array<{ min: number; max: number; count: number; label: string }>;
  };
  conditions: OverviewCondition[];
  last_crawled_at: string | null;
  schedule_interval: number;
}

/** A known fact about a product, hanging at a graph node. */
export interface Knowledge {
  id: number;
  node_id: number;
  /** Display name of the node it hangs at, e.g. "Honda CBR 1000 RR SC57". */
  node: string;
  kind: string;
  statement: string;
  check_path?: string | null;
  weight?: string | null;
  sources: string[];
  created_at?: string;
  approved: boolean;
}

export interface HuntBrief {
  decision: 'lohnt sich' | 'nicht nötig';
  research_value: string;
  reason?: string;
  what_to_know: string[];
  /** Copy-paste text for the buyer's research AI. */
  brief: string;
  targets: Array<{ node_id: number; name: string }>;
  knowledge: Knowledge[];
}
