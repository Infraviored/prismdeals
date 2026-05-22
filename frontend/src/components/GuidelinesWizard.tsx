import { useState } from 'react'
import type { SampleListing } from '../types'

interface GuidelinesWizardProps {
  activeSearchTarget: {
    id?: number
    name: string
    url: string
    knowledge_set_id?: number | null
  }
  marketMemo: string
  setMarketMemo: (memo: string) => void
  sampledListings: SampleListing[]
  sampledListingsLoading: boolean
  fetchSampleListings: (searchId: number) => Promise<void>
  researcherOutput: string
  setResearcherOutput: (output: string) => void
  researchPromptTemplate: string
  marketPromptTemplate: string
  profilePromptTemplate: string
  editKsError: string
  wizardStep: 1 | 2 | 3
  setWizardStep: (step: 1 | 2 | 3) => void
  handleSaveKnowledgeSet: () => Promise<void>
  parsedExpertKnowledge: string
  parsedGoodRef: string
  parsedBadRef: string
  parsedDemoMsg: string
  parsedItemJson: string
  isScraping: boolean
  scrapingStatus: string
  scrapingProgress: { phase: string; current: number; total: number; status: string; } | null
}

// Helper to parse target search URL for buyer context attributes
function parseKleinanzeigenUrl(url: string, name: string) {
  let maxPrice = 'Any';
  const priceMatch = url.match(/preis:(?:\d*):(\d+)/) || url.match(/preis::(\d+)/);
  if (priceMatch && priceMatch[1]) {
    maxPrice = priceMatch[1] + ' Euro';
  }

  let maxMileage = 'Any';
  const decodedUrl = decodeURIComponent(url);
  const kmMatch = decodedUrl.match(/km_i:(?:\d*),(\d+)/) || decodedUrl.match(/km_i:,(\d+)/) || decodedUrl.match(/km_i:(\d+)/);
  if (kmMatch && kmMatch[1]) {
    maxMileage = kmMatch[1] + ' km';
  }

  let query = 'Used product';
  const cleanedName = name.replace(/\s*Settings\s*/gi, '').trim();
  if (cleanedName) {
    query = cleanedName;
  }

  return {
    query,
    maxMileage,
    maxPrice
  };
}

export default function GuidelinesWizard({
  activeSearchTarget,
  marketMemo,
  setMarketMemo,
  sampledListings,
  sampledListingsLoading,
  fetchSampleListings,
  researcherOutput,
  setResearcherOutput,
  researchPromptTemplate,
  marketPromptTemplate,
  profilePromptTemplate,
  editKsError,
  handleSaveKnowledgeSet,
  parsedExpertKnowledge,
  parsedGoodRef,
  parsedBadRef,
  parsedDemoMsg,
  parsedItemJson,
  isScraping,
  scrapingStatus,
  scrapingProgress,
  wizardStep,
  setWizardStep
}: GuidelinesWizardProps) {
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null)
  
  // Progressive return box disclosure states
  const [showStep1Next, setShowStep1Next] = useState(false)
  const [showStep2Return, setShowStep2Return] = useState(false)
  const [showStep3Return, setShowStep3Return] = useState(false)

  // Copy helper
  const handleCopyPrompt = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPromptId(id)
    setTimeout(() => setCopiedPromptId(null), 2000)
    
    // Auto-reveal the respective return field/action
    if (id === 'prompt-research') {
      setShowStep1Next(true)
    } else if (id === 'prompt-market') {
      setShowStep2Return(true)
    } else if (id === 'prompt-profile') {
      setShowStep3Return(true)
    }
  }

  // Compile Research prompt (Prompt 1)
  const getResearchPromptWithContext = () => {
    if (!researchPromptTemplate) return 'Loading...'
    const parsed = parseKleinanzeigenUrl(activeSearchTarget?.url || '', activeSearchTarget?.name || '')
    const buyerContext = `Search Query: ${parsed.query}\nMax Mileage: ${parsed.maxMileage}\nMax Price: ${parsed.maxPrice}`
    return researchPromptTemplate
      .replace('{{USER_CONTEXT}}', buyerContext)
  }

  // Compile Market memo generation prompt (Prompt 2)
  const getMarketPromptWithContext = () => {
    if (!marketPromptTemplate) return 'Loading...'
    const sampledStr = sampledListings.map((s, idx) => (
      `=== Sample #${idx + 1} ===\nTitle: ${s.title}\nDetails: ${s.details || ''}\nDescription:\n${s.description}\n`
    )).join('\n')
    const parsed = parseKleinanzeigenUrl(activeSearchTarget?.url || '', activeSearchTarget?.name || '')
    const buyerContext = `Search Query: ${parsed.query}\nMax Mileage: ${parsed.maxMileage}\nMax Price: ${parsed.maxPrice}`
    return marketPromptTemplate
      .replace('{{USER_CONTEXT}}', buyerContext)
      .replace('{{SAMPLED_LISTINGS}}', sampledStr || 'No sampled listings available.')
  }

  // Compile Guidelines Profile synthesis prompt (Prompt 3)
  const getProfilePromptWithContext = () => {
    if (!profilePromptTemplate) return 'Loading...'
    const parsed = parseKleinanzeigenUrl(activeSearchTarget?.url || '', activeSearchTarget?.name || '')
    const buyerContext = `Search Query: ${parsed.query}\nMax Mileage: ${parsed.maxMileage}\nMax Price: ${parsed.maxPrice}`
    return profilePromptTemplate
      .replace('{{USER_CONTEXT}}', buyerContext)
      .replace('{{MARKET_MEMO}}', marketMemo || 'No market memo provided.')
  }

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  return (
    <div className="space-y-6 w-full">
      {/* Step Indicator Header */}
      <div className="grid grid-cols-3 w-full border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
        <button
          onClick={() => setWizardStep(1)}
          className={`py-3.5 text-xs sm:text-sm font-bold transition-all text-center border-b-2 ${
            wizardStep === 1
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-500 hover:text-slate-400 hover:bg-slate-900/20'
          }`}
        >
          Step 1: Deep Research
        </button>
        <button
          onClick={() => (showStep1Next || showStep2Return || marketMemo.trim()) && setWizardStep(2)}
          disabled={!(showStep1Next || showStep2Return || marketMemo.trim())}
          className={`py-3.5 text-xs sm:text-sm font-bold transition-all text-center border-b-2 disabled:opacity-30 disabled:cursor-not-allowed ${
            wizardStep === 2
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-500 hover:text-slate-400 hover:bg-slate-900/20'
          }`}
        >
          Step 2: Market Calibration
        </button>
        <button
          onClick={() => marketMemo.trim().length > 0 && setWizardStep(3)}
          disabled={!marketMemo.trim()}
          className={`py-3.5 text-xs sm:text-sm font-bold transition-all text-center border-b-2 disabled:opacity-30 disabled:cursor-not-allowed ${
            wizardStep === 3
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-500 hover:text-slate-400 hover:bg-slate-900/20'
          }`}
        >
          Step 3: Synthesis Checklist
        </button>
      </div>

      {/* SINGLE COLUMN STEP CONTENT WORKSPACE */}
      <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-5 min-h-[300px]">
        
        {/* STEP 1: DEEP RESEARCH */}
        {wizardStep === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="pb-4 border-b border-slate-800/50 space-y-1">
              <h3 className="text-base font-bold text-slate-100">Step 1: Deep Specification & Risk Research</h3>
              <p className="text-xs text-slate-400 leading-relaxed pt-0.5">
                Leverage deep external research models (such as Perplexity Deep Research) to systematically analyze technical specifications, target wear points, critical revisions, and common mechanical or electrical pitfalls for this exact product category before scanning live market listings.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Demo Research Prompt</label>
              <div className="relative">
                <pre className="w-full bg-slate-950 border border-slate-850 rounded-xl p-4 text-[10px] text-slate-450 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto shadow-inner">
                  {getResearchPromptWithContext()}
                </pre>
              </div>
            </div>

            <div className="flex justify-center py-2">
              <button
                onClick={() => handleCopyPrompt(getResearchPromptWithContext(), 'prompt-research')}
                className={`font-extrabold px-6 py-2.5 rounded-xl text-xs transition-all border flex items-center justify-center gap-2 ${
                  copiedPromptId === 'prompt-research'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10'
                }`}
              >
                {copiedPromptId === 'prompt-research' ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    <span>Research Prompt Copied!</span>
                  </>
                ) : (
                  <span>Copy Research Prompt</span>
                )}
              </button>
            </div>

            {showStep1Next && (
              <div className="pt-4 border-t border-slate-800/40 flex justify-end animate-fadeIn">
                <button
                  onClick={() => setWizardStep(2)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-2.5 px-5 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98"
                >
                  Proceed to Step 2: Calibrate Live Market →
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: MARKET CALIBRATION */}
        {wizardStep === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="pb-4 border-b border-slate-800/50 space-y-1">
              <h3 className="text-base font-bold text-slate-100">Step 2: Live Market Sample Calibration</h3>

              <p className="text-xs text-slate-400 leading-relaxed pt-0.5">
                Calibrate positive and negative evaluation criteria against actual live market samples crawled by our background scraper. Comparing theoretical checklists against local classified descriptions reveals real-world warning patterns and trust indicators.
              </p>
            </div>

            {/* Scraper progress & listing samples context */}
            <div className="space-y-3 bg-slate-950/40 border border-slate-850 rounded-2xl p-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Live Market Samples (Additional Context)</span>
                {!sampledListingsLoading && (
                  <button
                    disabled={isScraping}
                    onClick={() => activeSearchTarget?.id && fetchSampleListings(activeSearchTarget.id)}
                    className="text-[9px] font-bold px-2 py-1 rounded-lg transition-all border bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-350 disabled:opacity-50"
                  >
                    Refresh Samples
                  </button>
                )}
              </div>

              {isScraping && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 flex flex-col space-y-2">
                  <div className="flex items-center space-x-2 text-[11px] font-semibold text-emerald-400">
                    <div className="w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                    <span>
                      {scrapingProgress
                        ? `Crawling Market Listings (${scrapingProgress.current}/${scrapingProgress.total})`
                        : scrapingStatus || 'Crawling fresh listings...'}
                    </span>
                  </div>
                  {scrapingProgress && (
                    <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-1 transition-all duration-300" 
                        style={{ width: `${(scrapingProgress.current / scrapingProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {sampledListingsLoading ? (
                <div className="flex items-center justify-center gap-3 py-6 border border-dashed border-slate-900 rounded-xl">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                  <span className="text-[11px] text-slate-500 font-semibold">Loading real classified listings...</span>
                </div>
              ) : sampledListings.length > 0 ? (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {sampledListings.map((s, idx) => {
                    const isExpanded = expandedIndex === idx;
                    return (
                      <div key={s.id || idx} className="bg-slate-950/20 border border-slate-900 rounded-xl p-2.5 space-y-1.5 hover:border-slate-800/80 transition-colors">
                        <div 
                          onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                          className="flex justify-between items-center cursor-pointer select-none"
                        >
                          <div className="flex-1 pr-3">
                            <span className="font-bold text-[11px] text-slate-300 block">#{idx + 1}: {s.title}</span>
                            {s.details && (
                              <span className="text-[9px] text-slate-500 font-mono block mt-0.5">{s.details}</span>
                            )}
                          </div>
                          <span className="text-slate-500 transition-transform">
                            {isExpanded ? (
                              <svg className="w-3 h-3 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                            )}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="text-[10px] text-slate-450 mt-1 border-t border-slate-900/60 pt-1.5 leading-relaxed whitespace-pre-wrap font-mono bg-slate-950/50 p-2 rounded border border-slate-900 max-h-[100px] overflow-y-auto">
                            {s.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Demo Calibration Prompt</label>
              <div className="relative">
                <pre className="w-full bg-slate-950 border border-slate-850 rounded-xl p-4 text-[10px] text-slate-450 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto shadow-inner">
                  {getMarketPromptWithContext()}
                </pre>
              </div>
            </div>

            <div className="flex justify-center py-2">
              <button
                onClick={() => handleCopyPrompt(getMarketPromptWithContext(), 'prompt-market')}
                className={`font-extrabold px-6 py-2.5 rounded-xl text-xs transition-all border flex items-center justify-center gap-2 ${
                  copiedPromptId === 'prompt-market'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10'
                }`}
              >
                {copiedPromptId === 'prompt-market' ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    <span>Calibration Prompt Copied!</span>
                  </>
                ) : (
                  <span>Copy Calibration Prompt</span>
                )}
              </button>
            </div>

            {/* Disclosed Return Box */}
            {showStep2Return && (
              <div className="space-y-2 animate-fadeIn border-t border-slate-800/40 pt-4">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paste &lt;market_memo&gt; block response</label>
                <textarea
                  value={marketMemo}
                  onChange={e => setMarketMemo(e.target.value)}
                  placeholder="Paste <market_memo>...</market_memo> block response here..."
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 whitespace-pre-wrap leading-relaxed shadow-inner placeholder-slate-805"
                />
              </div>
            )}

            <div className="pt-4 border-t border-slate-800/40 flex justify-between">
              <button
                onClick={() => setWizardStep(1)}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold py-2.5 px-4 rounded-xl transition-all"
              >
                Back to Step 1
              </button>
              {marketMemo.trim().length > 0 && (
                <button
                  onClick={() => setWizardStep(3)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-2.5 px-5 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98 animate-fadeIn"
                >
                  Proceed to Step 3: Synthesis Checklist →
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: CHECKLIST SYNTHESIS & REACTIVE PREVIEW */}
        {wizardStep === 3 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="pb-4 border-b border-slate-800/50 space-y-1">
              <h3 className="text-base font-bold text-slate-100">Step 3: Synthesis Matching Checklist & Verification</h3>
              <p className="text-xs text-slate-400 leading-relaxed pt-0.5">
                Synthesize the calibrated market memo into structured deal scoring guidelines. Paste the final structured memo below to dynamically parse the matching rules, extract deal scoring weights, draft outreach templates, and activate live listing scoring.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Demo Synthesis Prompt</label>
              <div className="relative">
                <pre className="w-full bg-slate-950 border border-slate-850 rounded-xl p-4 text-[10px] text-slate-450 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto shadow-inner">
                  {getProfilePromptWithContext()}
                </pre>
              </div>
            </div>

            <div className="flex justify-center py-2">
              <button
                disabled={!marketMemo.trim()}
                onClick={() => handleCopyPrompt(getProfilePromptWithContext(), 'prompt-profile')}
                className={`font-extrabold px-6 py-2.5 rounded-xl text-xs transition-all border flex items-center justify-center gap-2 ${
                  copiedPromptId === 'prompt-profile'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10'
                }`}
              >
                {copiedPromptId === 'prompt-profile' ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    <span>Synthesis Prompt Copied!</span>
                  </>
                ) : (
                  <span>Copy Synthesis Prompt</span>
                )}
              </button>
            </div>

            {/* Disclosed Return Box */}
            {showStep3Return && (
              <div className="space-y-2 animate-fadeIn border-t border-slate-800/40 pt-4">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paste &lt;researcher_output&gt; block response</label>
                <textarea
                  value={researcherOutput}
                  onChange={e => setResearcherOutput(e.target.value)}
                  placeholder="Paste <researcher_output>...</researcher_output> block here..."
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-855 rounded-xl p-3.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 whitespace-pre-wrap leading-relaxed shadow-inner placeholder-slate-805"
                />
              </div>
            )}

            {/* REACTIVE LIVE PREVIEW BLOCK */}
            {(parsedExpertKnowledge || parsedGoodRef || parsedBadRef || parsedDemoMsg || parsedItemJson) && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4 mt-6 shadow-2xl animate-fadeIn">
                <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block font-mono">Reactive Checklist Preview</span>
                  <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 px-2 py-0.5 rounded uppercase tracking-wider">Live Parsed</span>
                </div>

                {/* Target & Risk Reference Anchors */}
                {(parsedGoodRef || parsedBadRef) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parsedGoodRef && (
                      <div className="bg-slate-950/40 border border-emerald-500/10 rounded-xl p-4 space-y-1.5 shadow-sm">
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Target Deal Reference Anchor</span>
                        <p className="text-[11px] text-slate-350 leading-relaxed font-mono whitespace-pre-wrap">{parsedGoodRef}</p>
                      </div>
                    )}

                    {parsedBadRef && (
                      <div className="bg-slate-950/40 border border-rose-500/10 rounded-xl p-4 space-y-1.5 shadow-sm">
                        <span className="text-[9px] bg-rose-500/10 text-rose-450 font-bold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Risk Listing Reference Anchor</span>
                        <p className="text-[11px] text-slate-350 leading-relaxed font-mono whitespace-pre-wrap">{parsedBadRef}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Outreach Message Starter */}
                {parsedDemoMsg && (
                  <div className="bg-slate-950/40 border border-indigo-500/10 rounded-xl p-4 relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                    <span className="text-[9px] bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider block w-fit mb-1.5">Outreach Starter Message Draft</span>
                    <p className="text-[11px] text-slate-250 leading-relaxed italic font-medium">"{parsedDemoMsg}"</p>
                  </div>
                )}

                {/* Checklist table logic */}
                {parsedItemJson && (() => {
                  try {
                    const parsedObj = JSON.parse(parsedItemJson)
                    const positiveCriteria: { id: string; description?: string; question?: string; market_frequency?: string; importance_hint?: string }[] =
                      parsedObj.explicit_positive_criteria || parsedObj.extraction_criteria || []
                    const negativeCriteria: { id: string; description?: string; question?: string; market_frequency?: string; importance_hint?: string }[] =
                      parsedObj.explicit_negative_criteria || []
                    const highValueUnknowns: { id: string; description?: string; applies_when?: string }[] =
                      parsedObj.high_value_unknown_fields || []

                    const isNewSchema = !!(parsedObj.explicit_positive_criteria || parsedObj.explicit_negative_criteria)
                    const weightsDict = parsedObj.scoring_model?.weights || {}

                    const importanceLabel = (c: { id: string; importance_hint?: string }) => {
                      if (isNewSchema) return c.importance_hint || 'medium'
                      const w = weightsDict[c.id]
                      if (!w) return 'medium'
                      const imp = w.importance ?? 10
                      if (imp >= 20) return 'high'
                      if (imp >= 10) return 'medium'
                      return 'low'
                    }

                    const importanceBadge = (hint: string) => {
                      if (hint === 'high') return 'text-emerald-400'
                      if (hint === 'low') return 'text-slate-600'
                      return 'text-slate-450'
                    }

                    return (
                      <div className="space-y-4">
                        {positiveCriteria.length > 0 && (
                          <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-4 space-y-3 shadow-inner">
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Positive Target Signals ({positiveCriteria.length})</span>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[8px]">
                                    <th className="py-2 pr-4">ID</th>
                                    <th className="py-2 pr-4">Signal Description</th>
                                    <th className="py-2 pr-4">Importance</th>
                                    <th className="py-2">Frequency</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {positiveCriteria.map((c, idx) => {
                                    const hint = importanceLabel(c)
                                    return (
                                      <tr key={idx} className="border-b border-slate-900/40 hover:bg-slate-900/10 text-slate-350">
                                        <td className="py-2 pr-4 font-bold font-mono text-[9px] text-emerald-500/70">{c.id}</td>
                                        <td className="py-2 pr-4 leading-normal">{c.description || c.question}</td>
                                        <td className={`py-2 pr-4 font-bold text-[9px] uppercase ${importanceBadge(hint)}`}>{hint}</td>
                                        <td className="py-2 font-semibold text-[9px] uppercase text-slate-500">{c.market_frequency || 'mixed'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {negativeCriteria.length > 0 && (
                          <div className="bg-slate-955/50 border border-rose-500/10 rounded-xl p-4 space-y-3 shadow-inner">
                            <span className="text-[9px] bg-rose-500/10 text-rose-450 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Negative Risk Signals ({negativeCriteria.length})</span>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[8px]">
                                    <th className="py-2 pr-4">ID</th>
                                    <th className="py-2 pr-4">Risk Factor Description</th>
                                    <th className="py-2 pr-4">Importance</th>
                                    <th className="py-2">Frequency</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {negativeCriteria.map((c, idx) => {
                                    const hint = importanceLabel(c)
                                    return (
                                      <tr key={idx} className="border-b border-slate-900/40 hover:bg-slate-900/10 text-slate-350">
                                        <td className="py-2 pr-4 font-bold font-mono text-[9px] text-rose-500/70">{c.id}</td>
                                        <td className="py-2 pr-4 leading-normal">{c.description || c.question}</td>
                                        <td className={`py-2 pr-4 font-bold text-[9px] uppercase ${importanceBadge(hint)}`}>{hint}</td>
                                        <td className="py-2 font-semibold text-[9px] uppercase text-slate-500">{c.market_frequency || 'mixed'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {highValueUnknowns.length > 0 && (
                          <div className="bg-slate-950/50 border border-amber-500/10 rounded-xl p-4 space-y-3 shadow-inner">
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">High-Value Unknown Fields ({highValueUnknowns.length})</span>
                            <div className="space-y-2">
                              {highValueUnknowns.map((u, idx) => (
                                <div key={idx} className="text-[11px] text-slate-450 leading-relaxed border-b border-slate-900/40 pb-2">
                                  <span className="font-bold font-mono text-[9px] text-amber-500/70 mr-2">{u.id}</span>
                                  <span>{u.description}</span>
                                  {u.applies_when && <span className="block text-[10px] text-slate-650 mt-0.5 italic">{u.applies_when}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  } catch {
                    return (
                      <div className="bg-amber-500/5 border border-amber-500/20 text-amber-500/70 p-4 rounded-xl text-[10px] font-mono">
                        Waiting for valid &lt;item_json&gt; block from synthesis output...
                      </div>
                    )
                  }
                })()}
              </div>
            )}

            <div className="pt-4 border-t border-slate-800/40 flex justify-between">
              <button
                onClick={() => setWizardStep(2)}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold py-2.5 px-4 rounded-xl transition-all"
              >
                Back to Step 2
              </button>
              
              <button
                onClick={handleSaveKnowledgeSet}
                disabled={!researcherOutput.trim()}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold py-3 px-6 rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98"
              >
                Save Checklist & Link Guidelines
              </button>
            </div>
          </div>
        )}
      </div>

      {editKsError && (
        <div className="text-xs text-rose-450 font-semibold bg-rose-500/10 p-3.5 rounded-xl border border-rose-500/20">{editKsError}</div>
      )}
    </div>
  )
}
