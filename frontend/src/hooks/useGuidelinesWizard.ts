import { useState, useEffect, useCallback } from 'react';
import type { KnowledgeSet, SearchTarget, SampleListing } from '../types';

interface UseGuidelinesWizardProps {
  activeSearchTarget: SearchTarget | undefined;
  searches: SearchTarget[];
  knowledgeSets: KnowledgeSet[];
  setWizardStep: (step: 1 | 2 | 3) => void;
  refreshAll: () => void;
  setView: (view: 'landing' | 'dashboard' | 'edit' | 'create-campaign' | 'settings') => void;
  appUser: { email: string; role: string } | null;
}

export function useGuidelinesWizard({
  activeSearchTarget,
  searches,
  knowledgeSets,
  setWizardStep,
  refreshAll,
  setView,
  appUser,
}: UseGuidelinesWizardProps) {
  const [currentKnowledgeSetId, setCurrentKnowledgeSetId] = useState<number | null>(null);
  const [editKsName, setEditKsName] = useState('');
  const [editKsError, setEditKsError] = useState('');
  const [marketMemo, setMarketMemo] = useState('');
  const [sampledListings, setSampledListings] = useState<SampleListing[]>([]);
  const [sampledListingsLoading, setSampledListingsLoading] = useState(false);
  const [researcherOutput, setResearcherOutput] = useState('');
  const [researchPromptTemplate, setResearchPromptTemplate] = useState('');
  const [marketPromptTemplate, setMarketPromptTemplate] = useState('');
  const [profilePromptTemplate, setProfilePromptTemplate] = useState('');
  const [parsedExpertKnowledge, setParsedExpertKnowledge] = useState('');
  const [parsedGoodRef, setParsedGoodRef] = useState('');
  const [parsedBadRef, setParsedBadRef] = useState('');
  const [parsedDemoMsg, setParsedDemoMsg] = useState('');
  const [parsedItemJson, setParsedItemJson] = useState('');

  const fetchSampleListings = useCallback(async (searchId: number) => {
    setSampledListingsLoading(true);
    try {
      const r = await fetch(`/api/searches/${searchId}/sample-listings`);
      if (r.ok) setSampledListings(await r.json());
      else alert('Failed to fetch sample listings from server.');
    } catch {
      alert('Error contacting the backend to fetch listings.');
    } finally {
      setSampledListingsLoading(false);
    }
  }, []);

  // Fetch prompt templates
  useEffect(() => {
    if (!appUser) return;
    fetch('/api/prompts/research').then(r => r.ok ? r.text() : '').then(setResearchPromptTemplate).catch(console.error);
    fetch('/api/prompts/market').then(r => r.ok ? r.text() : '').then(setMarketPromptTemplate).catch(console.error);
    fetch('/api/prompts/profile').then(r => r.ok ? r.text() : '').then(setProfilePromptTemplate).catch(console.error);
  }, [appUser]);

  // Parse researcher output XML tags
  useEffect(() => {
    const ekM = researcherOutput.match(/<expert_knowledge>([\s\S]*?)<\/expert_knowledge>/i);
    setParsedExpertKnowledge(ekM ? ekM[1].trim() : '');
    const grM = researcherOutput.match(/<good_reference_description>([\s\S]*?)<\/good_reference_description>/i);
    setParsedGoodRef(grM ? grM[1].trim() : '');
    const brM = researcherOutput.match(/<bad_reference_description>([\s\S]*?)<\/bad_reference_description>/i);
    setParsedBadRef(brM ? brM[1].trim() : '');
    const dmM = researcherOutput.match(/<demo_message>([\s\S]*?)<\/demo_message>/i);
    setParsedDemoMsg(dmM ? dmM[1].trim() : '');
    const ijM = researcherOutput.match(/<item_json>([\s\S]*?)<\/item_json>/i);
    setParsedItemJson(ijM ? ijM[1].trim() : '');
  }, [researcherOutput]);

  // Knowledge set sync
  useEffect(() => {
    if (activeSearchTarget?.knowledge_set_id) {
      const ks = knowledgeSets.find(k => k.id === activeSearchTarget.knowledge_set_id);
      if (ks) {
        setCurrentKnowledgeSetId(ks.id || null);
        setEditKsName(ks.name);
        setMarketMemo(ks.market_memo || '');
        let samples: SampleListing[] = [];
        if (ks.market_samples_json) {
          try {
            samples = typeof ks.market_samples_json === 'string' ? JSON.parse(ks.market_samples_json) : ks.market_samples_json;
          } catch {
            // empty
          }
        }
        setSampledListings(samples);
        let raw = '';
        if (ks.expert_knowledge) raw += `<expert_knowledge>\n${ks.expert_knowledge}\n</expert_knowledge>\n\n`;
        if (ks.good_reference_description) raw += `<good_reference_description>\n${ks.good_reference_description}\n</good_reference_description>\n\n`;
        if (ks.bad_reference_description) raw += `<bad_reference_description>\n${ks.bad_reference_description}\n</bad_reference_description>\n\n`;
        if (ks.item_json) {
          const s = typeof ks.item_json === 'string' ? ks.item_json : JSON.stringify(ks.item_json, null, 2);
          raw += `<item_json>\n${s}\n</item_json>`;
        }
        setResearcherOutput(raw.trim());
        setEditKsError('');
        if (ks.market_memo && ks.good_reference_description) setWizardStep(3);
        else if (ks.market_memo) setWizardStep(2);
        else setWizardStep(1);
      }
    } else {
      setCurrentKnowledgeSetId(null);
      setEditKsName('');
      setMarketMemo('');
      setSampledListings([]);
      setResearcherOutput('');
      setEditKsError('');
      setWizardStep(1);
    }
  }, [activeSearchTarget, searches, knowledgeSets, setWizardStep]);

  const handleSaveKnowledgeSet = async () => {
    if (!editKsName.trim()) {
      alert('Please enter a name for the Guidelines Profile.');
      return;
    }
    let parsedJson: Record<string, unknown> = {};
    if (parsedItemJson.trim()) {
      try {
        parsedJson = JSON.parse(parsedItemJson);
      } catch (e) {
        setEditKsError(`Invalid JSON syntax in <item_json>: ${(e as Error).message}`);
        return;
      }
    }
    const criteria = (parsedJson.extraction_criteria as { id: string; type: string }[]) || [];
    for (const c of criteria) {
      if (c.type !== 'boolean') {
        setEditKsError(`Criteria types must be boolean only. Criterion '${c.id}' has type '${c.type}'.`);
        return;
      }
    }
    try {
      const res = await fetch('/api/knowledge-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentKnowledgeSetId || undefined,
          name: editKsName,
          expert_knowledge: parsedExpertKnowledge,
          item_json: parsedJson,
          market_memo: marketMemo,
          good_reference_description: parsedGoodRef,
          bad_reference_description: parsedBadRef,
          market_samples_json: JSON.stringify(sampledListings),
          source_search_url: activeSearchTarget?.url || '',
          sample_timestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setEditKsError('');
        refreshAll();
        setView('dashboard');
      } else {
        const d = await res.json();
        setEditKsError(d.error || 'Failed to save guidelines profile.');
      }
    } catch {
      setEditKsError('Connection to backend server failed.');
    }
  };

  return {
    currentKnowledgeSetId,
    editKsName,
    setEditKsName,
    editKsError,
    marketMemo,
    setMarketMemo,
    sampledListings,
    sampledListingsLoading,
    researcherOutput,
    setResearcherOutput,
    researchPromptTemplate,
    marketPromptTemplate,
    profilePromptTemplate,
    parsedExpertKnowledge,
    parsedGoodRef,
    parsedBadRef,
    parsedDemoMsg,
    parsedItemJson,
    fetchSampleListings,
    handleSaveKnowledgeSet,
  };
}
