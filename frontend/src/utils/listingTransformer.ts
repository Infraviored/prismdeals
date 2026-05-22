import type { Listing, SearchTarget, KnowledgeSet, ParsedKnowledgeConfig } from '../types'

export interface RawHighlight {
  label: string;
  sentiment: string;
  type: string;
  evidence_quote: string;
  confidence: string;
}

export interface ExtractedFactsSchema {
  criteria?: Record<string, unknown>;
  highlights?: RawHighlight[];
  draft_message?: string;
  dimensions?: Record<string, { score: number; reasoning: string }>;
  reference_comparison?: { closer_to: 'good' | 'bad' | 'mixed'; reasoning: string };
  [key: string]: unknown;
}

/**
 * Transforms a raw database Listing record into a fully enriched, type-safe frontend Listing object
 * by evaluating its extracted facts, scoring configurations, and legacy vs. new schemas.
 */
export function transformListing(
  l: Listing,
  searchesData: SearchTarget[],
  ksData: KnowledgeSet[]
): Listing {
  const year = l.details?.['Erstzulassung'] || '';
  const mileage = l.details?.['Kilometerstand'] || '';
  const cubic_capacity = l.details?.['Hubraum'] || '';
  const date_string = l.details?.['Erstellungsdatum'] || '';

  const description = l.detailed_description || l.short_description || '';

  // Reconstruct criteria_evaluations from extracted_facts and search target schema
  const targetSearch = searchesData.find((s) => s.id === l.search_id);
  const boundSet = targetSearch && targetSearch.knowledge_set_id
    ? ksData.find((ks) => ks.id === targetSearch.knowledge_set_id)
    : null;

  let criteria_evaluations: NonNullable<Listing['criteria_evaluations']> = [];
  let special_info: string[] = [];
  let draft_message = '';
  let summary = 'Awaiting AI matching checklist evaluation...';
  let isLegacy = false;

  if (l.llm_processed && boundSet && boundSet.item_json) {
    try {
      const itemConfig = (typeof boundSet.item_json === 'string'
        ? JSON.parse(boundSet.item_json)
        : boundSet.item_json) as ParsedKnowledgeConfig;
      const extractionCriteria = itemConfig.extraction_criteria || [];

      const rawFacts = l.extracted_facts as ExtractedFactsSchema;

      // Check if schema is legacy/older (lacks a nested 'criteria' object)
      const hasCriteriaKey = rawFacts && typeof rawFacts === 'object' && 'criteria' in rawFacts;
      isLegacy = !hasCriteriaKey;
      if (hasCriteriaKey && rawFacts.criteria && typeof rawFacts.criteria === 'object') {
        const keys = Object.keys(rawFacts.criteria);
        if (keys.length > 0) {
          const firstVal = rawFacts.criteria[keys[0]];
          if (typeof firstVal !== 'object' || firstVal === null) {
            isLegacy = true;
          }
        }
      } else if (hasCriteriaKey) {
        isLegacy = true;
      }

      if (isLegacy) {
        criteria_evaluations = extractionCriteria.map((c) => {
          return {
            id: c.id,
            name: c.question || c.description || c.id,
            reasoning: 'Older schema incompatible. Needs re-evaluation.',
            status: 'Needs Re-Evaluation',
            value: 'Needs Re-Evaluation',
          };
        });
        summary = 'Needs Re-Evaluation (Incompatible older schema)';
      } else {
        const criteriaDict = rawFacts?.criteria || {};
        draft_message = rawFacts?.draft_message || '';
        const highlightsList = rawFacts?.highlights || [];
        special_info = (highlightsList as RawHighlight[])
          .filter((h) => h.sentiment === 'negative')
          .map((h) => h.label);

        const weights = itemConfig.scoring_model?.weights || {};

        criteria_evaluations = extractionCriteria.map((c) => {
          const criterionVal = criteriaDict[c.id];
          const factValObj =
            typeof criterionVal === 'object' && criterionVal !== null
              ? (criterionVal as Record<string, unknown>)
              : null;
          const factVal = factValObj ? (factValObj.value as string) : 'unknown';
          const reasoning = factValObj ? (factValObj.reasoning as string) : 'Not specified in listing description.';

          const wEntry = weights[c.id];
          const satisfiedIf = wEntry?.satisfied_if;
          let status: 'satisfied' | 'neutral' | 'violated' | 'Needs Re-Evaluation' = 'neutral';

          if (factVal !== 'unknown') {
            if (satisfiedIf !== undefined) {
              const isSatisfiedBool =
                (factVal === 'yes' &&
                  (satisfiedIf === 'yes' || satisfiedIf === true || satisfiedIf === 'true')) ||
                (factVal === 'no' &&
                  (satisfiedIf === 'no' || satisfiedIf === false || satisfiedIf === 'false'));
              status = isSatisfiedBool ? 'satisfied' : 'violated';
            } else {
              if (factVal === 'yes') status = 'satisfied';
              else if (factVal === 'no') status = 'violated';
            }
          }

          return {
            id: c.id,
            name: c.question || c.description || c.id,
            reasoning: reasoning,
            status: status,
            value: factVal,
          };
        });

        // Make a nice summary
        const satisfiedCount = criteria_evaluations.filter((e) => e.status === 'satisfied').length;
        summary = `Evaluated ${criteria_evaluations.length} expert criteria, satisfied ${satisfiedCount}/${criteria_evaluations.length}. Niceness Score: ${l.niceness_score}.`;
      }
    } catch (e) {
      console.error('Error generating criteria evaluations:', e);
    }
  } else if (l.llm_processed) {
    summary = `AI processed basic listing facts. Niceness Score: ${l.niceness_score}.`;
  }

  return {
    ...l,
    year,
    mileage,
    cubic_capacity,
    date_string,
    description,
    criteria_evaluations,
    special_info,
    highlights: isLegacy ? [] : (((l.extracted_facts as ExtractedFactsSchema)?.highlights as any) || []),
    draft_message,
    summary,
    dimensions: (l.extracted_facts as ExtractedFactsSchema)?.dimensions,
    reference_comparison: (l.extracted_facts as ExtractedFactsSchema)?.reference_comparison,
  };
}
