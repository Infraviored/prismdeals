export interface Campaign {
  id: number
  name: string
}

export interface KnowledgeSet {
  id?: number
  name: string
  expert_knowledge: string
  item_json: Record<string, unknown> | string
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
    status: 'satisfied' | 'neutral' | 'violated'
    value?: unknown
  }[]
  special_info?: string[]
  draft_message?: string
  description?: string
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
