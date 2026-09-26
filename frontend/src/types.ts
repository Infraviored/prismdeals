/** Shapes shared by the results screen and the map. The hunt itself: types/hunt.ts. */

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

/** How many offers a wider radius would find (POST /api/search-families/:id/diagnose-radius). */
export interface RadiusDiagnosis {
  current_radius: number;
  measured_at: string;
  options: RadiusDiagnosisOption[];
  terms: RadiusDiagnosisTerm[];
}

/** A pin on the map. */
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
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_deal?: boolean;
  geo_status?: string | null;
}
