export interface Campaign {
  id: number
  name: string
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

export interface Listing {
  id: string
  title: string
  price: string
  location: string
  url: string
  short_description: string
  detailed_description: string
  extracted_facts: Record<string, unknown>
  niceness_score: number
  status: string
  search_id: number
  item_name?: string
  campaign_name?: string
  llm_processed: boolean
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
