import { useState } from 'react'
import type { SampleListing } from '../types'

interface GuidelinesWizardProps {
  activeSearchTarget: {
    id?: number
    name: string
    url: string
    knowledge_set_id?: number | null
  }
  editKsName: string
  setEditKsName: (name: string) => void
  marketMemo: string
  setMarketMemo: (memo: string) => void
  sampledListings: SampleListing[]
  sampledListingsLoading: boolean
  fetchSampleListings: (searchId: number) => Promise<void>
  researcherOutput: string
  setResearcherOutput: (output: string) => void
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

export default function GuidelinesWizard({
  activeSearchTarget,
  editKsName,
  setEditKsName,
  marketMemo,
  setMarketMemo,
  sampledListings,
  sampledListingsLoading,
  fetchSampleListings,
  researcherOutput,
  setResearcherOutput,
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

  // Copy helper
  const handleCopyPrompt = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPromptId(id)
    setTimeout(() => setCopiedPromptId(null), 2000)
  }

  // Compile Market memo generation prompt (Prompt A)
  const getMarketPromptWithContext = () => {
    if (!marketPromptTemplate) return 'Loading...'
    const sampledStr = sampledListings.map((s, idx) => (
      `=== Sample #${idx + 1} ===\nTitle: ${s.title}\nDetails: ${s.details || ''}\nDescription:\n${s.description}\n`
    )).join('\n')
    const buyerContext = `Target Product: ${activeSearchTarget?.name || 'Used product'}\nSearch URL: ${activeSearchTarget?.url || ''}`
    return marketPromptTemplate
      .replace('{{USER_CONTEXT}}', buyerContext)
      .replace('{{SAMPLED_LISTINGS}}', sampledStr || 'No sampled listings available.')
  }

  // Compile Guidelines Profile synthesis prompt (Prompt B)
  const getProfilePromptWithContext = () => {
    if (!profilePromptTemplate) return 'Loading...'
    const buyerContext = `Target Product: ${activeSearchTarget?.name || 'Used product'}\nSearch URL: ${activeSearchTarget?.url || ''}`
    return profilePromptTemplate
      .replace('{{USER_CONTEXT}}', buyerContext)
      .replace('{{MARKET_MEMO}}', marketMemo || 'No market memo provided.')
  }

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  return (
    <div className="space-y-6 w-full">
      {/* Guidelines Profile Name Header */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 space-y-2">
        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">Guidelines Profile Name</label>
        <input
          type="text"
          value={editKsName}
          onChange={e => setEditKsName(e.target.value)}
          placeholder="e.g. Honda CBR SC57 Checksheet"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-200 transition-all"
        />
      </div>

      {/* Step Indicator Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/60 pb-3 gap-3">
        <div className="flex space-x-5 text-xs font-bold">
          <button
            onClick={() => setWizardStep(1)}
            className={`pb-2 border-b-2 transition-all ${
              wizardStep === 1
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-400'
            }`}
          >
            Step 1: Market Sampling
          </button>
          <button
            onClick={() => sampledListings.length > 0 && setWizardStep(2)}
            disabled={sampledListings.length === 0}
            className={`pb-2 border-b-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              wizardStep === 2
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-400'
            }`}
          >
            Step 2: Market Calibration
          </button>
          <button
            onClick={() => marketMemo.trim().length > 0 && setWizardStep(3)}
            disabled={!marketMemo.trim()}
            className={`pb-2 border-b-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              wizardStep === 3
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-400'
            }`}
          >
            Step 3: Synthesis Checklist
          </button>
        </div>
        <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono font-bold">
          Step {wizardStep} of 3
        </span>
      </div>

      {/* SINGLE COLUMN STEP CONTENT WORKSPACE */}
      <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-5 min-h-[300px]">
        
        {/* STEP 1: MARKET SAMPLING */}
        {wizardStep === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">1. Capture Market Samples</span>
                <p className="text-[11px] text-slate-450 mt-0.5">Harvest listing text to calibrate matching criteria.</p>
              </div>
              {!sampledListingsLoading && sampledListings.length > 0 && (
                <button
                  disabled={isScraping}
                  onClick={() => activeSearchTarget?.id && fetchSampleListings(activeSearchTarget.id)}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all border bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 disabled:opacity-50"
                >
                  Refresh Samples
                </button>
              )}
            </div>

            {/* Scraper progress inside Step 1 */}
            {isScraping && (
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 flex flex-col space-y-2">
                <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                  <span>
                    {scrapingProgress
                      ? `Crawling Market Listings (${scrapingProgress.current}/${scrapingProgress.total})`
                      : scrapingStatus || 'Crawling fresh listings...'}
                  </span>
                </div>
                {scrapingProgress && (
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-1.5 transition-all duration-300" 
                      style={{ width: `${(scrapingProgress.current / scrapingProgress.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {sampledListingsLoading ? (
              <div className="flex items-center justify-center gap-3 py-16 border border-dashed border-slate-800 rounded-xl">
                <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                <span className="text-xs text-slate-400 font-semibold">Loading real classified listings...</span>
              </div>
            ) : sampledListings.length === 0 ? (
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-6 text-center space-y-3 max-w-md mx-auto">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-[12px] font-black">!</div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-300 block">Listing samples required</span>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                    Harvesting real listing descriptions is required to calibrate matching criteria. The background crawler has been triggered automatically.
                  </p>
                </div>
                <button
                  disabled={isScraping || sampledListingsLoading}
                  onClick={() => activeSearchTarget?.id && fetchSampleListings(activeSearchTarget.id)}
                  className="w-full font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 border bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400 disabled:opacity-40"
                >
                  {sampledListingsLoading ? 'Checking...' : 'Check for Crawled Listings'}
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {sampledListings.map((s, idx) => {
                  const isExpanded = expandedIndex === idx;
                  return (
                    <div key={s.id || idx} className="bg-slate-950/40 border border-slate-900 rounded-xl p-3.5 space-y-2 hover:border-slate-800/80 transition-colors">
                      <div 
                        onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                        className="flex justify-between items-center cursor-pointer select-none"
                      >
                        <div className="flex-1 pr-4">
                          <span className="font-bold text-xs text-slate-200 block">#{idx + 1}: {s.title}</span>
                          {s.details && (
                            <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{s.details}</span>
                          )}
                        </div>
                        <span className="text-slate-500 transition-transform">
                          {isExpanded ? (
                            <svg className="w-3.5 h-3.5 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                          )}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="text-[11px] text-slate-400 mt-2 border-t border-slate-900/60 pt-2 leading-relaxed whitespace-pre-wrap font-mono text-[9px] bg-slate-950/80 p-3 rounded-lg border border-slate-900 max-h-[150px] overflow-y-auto">
                          {s.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 border-t border-slate-800/40 flex justify-end">
              <button
                disabled={sampledListings.length === 0}
                onClick={() => setWizardStep(2)}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold py-2.5 px-5 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98"
              >
                Proceed to Step 2: Calibrate Distribution →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: MARKET CALIBRATION */}
        {wizardStep === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="pb-2 border-b border-slate-800/50">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">2. Market Calibration</span>
              <p className="text-[11px] text-slate-450 mt-0.5">Calibrate positive and negative listing factors from market samples.</p>
            </div>

            {/* High Contrast Copy Prompt A Panel */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 text-center space-y-4 max-w-lg mx-auto shadow-inner">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest block">Model Prompt A</span>
                <h3 className="text-sm font-bold text-slate-200">Generate Market Calibration Memo</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Copy this prompt to analyze the listings with Perplexity or a web-searching AI model to capture standard features, model pricing, and common defects.
                </p>
              </div>

              <button
                onClick={() => handleCopyPrompt(getMarketPromptWithContext(), 'prompt-a')}
                className={`mx-auto font-extrabold px-6 py-2.5 rounded-xl text-xs transition-all border flex items-center justify-center gap-2 ${
                  copiedPromptId === 'prompt-a'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10'
                }`}
              >
                {copiedPromptId === 'prompt-a' ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    <span>Prompt A Copied!</span>
                  </>
                ) : (
                  <span>Copy Prompt A (High Contrast)</span>
                )}
              </button>
            </div>

            {/* Paste market_memo text area */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paste &lt;market_memo&gt; block response</label>
              <textarea
                value={marketMemo}
                onChange={e => setMarketMemo(e.target.value)}
                placeholder="Paste <market_memo>...</market_memo> block response here..."
                rows={8}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 whitespace-pre-wrap leading-relaxed shadow-inner placeholder-slate-805"
              />
            </div>

            <div className="pt-4 border-t border-slate-800/40 flex justify-between">
              <button
                onClick={() => setWizardStep(1)}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold py-2.5 px-4 rounded-xl transition-all"
              >
                Back to Step 1
              </button>
              <button
                disabled={!marketMemo.trim()}
                onClick={() => setWizardStep(3)}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold py-2.5 px-5 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98"
              >
                Proceed to Step 3: Synthesis Checklist →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CHECKLIST SYNTHESIS & REACTIVE PREVIEW */}
        {wizardStep === 3 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="pb-2 border-b border-slate-800/50">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">3. Synthesis Checklist</span>
              <p className="text-[11px] text-slate-450 mt-0.5">Paste synthesized matching checklist output to establish deal scoring rules.</p>
            </div>

            {/* High Contrast Copy Prompt B Panel */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 text-center space-y-4 max-w-lg mx-auto shadow-inner">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest block">Model Prompt B</span>
                <h3 className="text-sm font-bold text-slate-200">Synthesize Matching Guidelines</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Copy this prompt to process the calibration memo and generate structured checklist rules, anchors, and scoring weights.
                </p>
              </div>

              <button
                disabled={!marketMemo.trim()}
                onClick={() => handleCopyPrompt(getProfilePromptWithContext(), 'prompt-b')}
                className={`mx-auto font-extrabold px-6 py-2.5 rounded-xl text-xs transition-all border flex items-center justify-center gap-2 ${
                  copiedPromptId === 'prompt-b'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10'
                }`}
              >
                {copiedPromptId === 'prompt-b' ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    <span>Prompt B Copied!</span>
                  </>
                ) : (
                  <span>Copy Prompt B (High Contrast)</span>
                )}
              </button>
            </div>

            {/* Paste researcher_output textarea */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paste &lt;researcher_output&gt; block response</label>
              <textarea
                value={researcherOutput}
                onChange={e => setResearcherOutput(e.target.value)}
                placeholder="Paste <researcher_output>...</researcher_output> block here..."
                rows={8}
                className="w-full bg-slate-950 border border-slate-855 rounded-xl p-3.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 whitespace-pre-wrap leading-relaxed shadow-inner placeholder-slate-805"
              />
            </div>

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
                    <p className="text-[11px] text-slate-200 leading-relaxed italic font-medium">"{parsedDemoMsg}"</p>
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
                      return 'text-slate-400'
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
                                  {u.applies_when && <span className="block text-[10px] text-slate-600 mt-0.5 italic">{u.applies_when}</span>}
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
