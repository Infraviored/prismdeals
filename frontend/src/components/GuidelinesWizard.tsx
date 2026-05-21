import React, { useState } from 'react'
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
  wizardStep,
  setWizardStep,
  handleSaveKnowledgeSet,
  parsedExpertKnowledge,
  parsedGoodRef,
  parsedBadRef,
  parsedDemoMsg,
  parsedItemJson
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

  return (
    <div className="space-y-6">
      {/* Guidelines Profile Name Header */}
      <div className="space-y-1">
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Guidelines Profile Name</label>
        <input
          type="text"
          value={editKsName}
          onChange={e => setEditKsName(e.target.value)}
          placeholder="e.g. Honda CBR SC57 Checksheet"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-200"
        />
      </div>

      {/* Center 3-Step Wizard Navigation Stepper */}
      <div className="flex justify-between items-center bg-slate-950/80 border border-slate-850 p-1.5 rounded-2xl">
        <button
          onClick={() => setWizardStep(1)}
          className={`flex-1 text-center py-2 text-xs font-extrabold rounded-xl transition-all ${
            wizardStep === 1
              ? 'bg-slate-800 text-emerald-400 shadow-md border border-slate-700/50'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          1. Product Knowledge
        </button>
        <button
          onClick={async () => {
            if (activeSearchTarget?.id) {
              await fetchSampleListings(activeSearchTarget.id)
            }
            setWizardStep(2)
          }}
          className={`flex-1 text-center py-2 text-xs font-extrabold rounded-xl transition-all ${
            wizardStep === 2
              ? 'bg-slate-800 text-emerald-400 shadow-md border border-slate-700/50'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          2. Market Analysis
        </button>
        <button
          onClick={() => setWizardStep(3)}
          className={`flex-1 text-center py-2 text-xs font-extrabold rounded-xl transition-all ${
            wizardStep === 3
              ? 'bg-slate-800 text-emerald-400 shadow-md border border-slate-700/50'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          3. Synthesis & Profile
        </button>
      </div>

      {/* WIZARD STEP 1: PRODUCT KNOWLEDGE ACQUISITION */}
      {wizardStep === 1 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-slate-950/80 border border-slate-850 rounded-2xl p-4 space-y-3.5">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block font-mono">Product Knowledge Acquisition</span>
            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <p>
                Before generating guidelines, prime your external AI (such as Perplexity or another research assistant) with domain knowledge about the exact product target.
              </p>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-2">
                <span className="font-bold text-slate-300 block">Recommended workflow:</span>
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  <li>Use Perplexity or a similar web-search assistant.</li>
                  <li>Research exact details about the item: known technical flaws, year changes, specific options, and crucial inspection criteria (e.g. "demo for bike research").</li>
                  <li>You can skip this research step entirely if your search campaign is already connected to an active guidelines database.</li>
                </ul>
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              if (activeSearchTarget?.id) {
                await fetchSampleListings(activeSearchTarget.id)
              }
              setWizardStep(2)
            }}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/10"
          >
            Continue to Market Analysis &rarr;
          </button>
        </div>
      )}

      {/* WIZARD STEP 2: SAMPLE RETRIEVAL & MARKET MEMO */}
      {wizardStep === 2 && (
        <div className="space-y-5 animate-fadeIn">
          <div className="bg-slate-950/80 border border-slate-850 rounded-2xl p-4 space-y-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block font-mono">Market Calibration Steps</span>
            <p className="text-xs text-slate-300 leading-relaxed">
              We retrieve real classified listing samples from your target search to calibrate the model. Copy the generated **Market Memo Prompt (Prompt A)**, run it in your primed external AI, and then copy the &lt;market_memo&gt; output block back here.
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Real Classified Listings (Conditioning Examples)</span>
            {sampledListingsLoading ? (
              <div className="text-center py-6 text-slate-500 text-xs font-semibold animate-pulse">
                Loading real listing search samples...
              </div>
            ) : sampledListings.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-850 rounded-xl text-slate-650 text-xs font-semibold">
                No sample listings found. Run discovery crawl first to capture context.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 max-h-[220px] overflow-y-auto p-0.5">
                {sampledListings.map((s, idx) => (
                  <div key={s.id || idx} className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-1.5 text-xs">
                    <span className="font-extrabold text-slate-200">#{idx + 1}: {s.title}</span>
                    {s.details && (
                      <span className="text-[10px] text-slate-500 font-semibold block">{s.details}</span>
                    )}
                    <details className="text-[11px] text-slate-400 mt-1 cursor-pointer">
                      <summary className="text-[10px] text-emerald-500 font-bold hover:text-emerald-400 select-none">View description snippet</summary>
                      <p className="mt-1.5 leading-relaxed whitespace-pre-wrap font-mono text-[10px] max-h-[120px] overflow-y-auto bg-slate-900/50 p-2 rounded border border-slate-800">{s.description}</p>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assembled Prompt A Segment */}
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-bold text-slate-250 block">Market memo generation prompt (Prompt A)</span>
                <span className="text-[9px] text-slate-500 font-semibold">Generates a grounded observation map from search distribution</span>
              </div>
              <button
                onClick={() => handleCopyPrompt(getMarketPromptWithContext(), 'prompt-a')}
                className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all ${
                  copiedPromptId === 'prompt-a'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-550/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-350 border border-slate-750'
                }`}
              >
                {copiedPromptId === 'prompt-a' ? 'Copied Prompt A!' : 'Copy Prompt A'}
              </button>
            </div>
            <div className="text-[10px] text-slate-500 bg-slate-900/40 p-2.5 rounded-xl border border-slate-850 font-medium">
              Submit the copied Prompt A to your primed external model. Paste the returned &lt;market_memo&gt; block below.
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Paste Market Memo (&lt;market_memo&gt;)</label>
            <textarea
              value={marketMemo}
              onChange={e => setMarketMemo(e.target.value)}
              placeholder="Paste the full <market_memo> block response here..."
              rows={10}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 whitespace-pre-wrap leading-relaxed"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setWizardStep(1)}
              className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold py-3 rounded-xl transition-all"
            >
              &larr; Back to Research
            </button>
            <button
              onClick={() => setWizardStep(3)}
              disabled={!marketMemo.trim()}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold py-3 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/10"
            >
              Proceed to Synthesis &rarr;
            </button>
          </div>
        </div>
      )}

      {/* WIZARD STEP 3: SYNTHESIS & TARGET PROFILE SCHEMA */}
      {wizardStep === 3 && (
        <div className="space-y-5 animate-fadeIn">
          {/* Assembled Prompt B Segment */}
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-bold text-slate-250 block">Guidelines Profile synthesis prompt (Prompt B)</span>
                <span className="text-[9px] text-slate-500 font-semibold">Generates expert cheat sheets, matching schema, and anchors</span>
              </div>
              <button
                onClick={() => handleCopyPrompt(getProfilePromptWithContext(), 'prompt-b')}
                className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all ${
                  copiedPromptId === 'prompt-b'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-550/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-350 border border-slate-750'
                }`}
              >
                {copiedPromptId === 'prompt-b' ? 'Copied Prompt B!' : 'Copy Prompt B'}
              </button>
            </div>
            <div className="text-[10px] text-slate-500 bg-slate-900/40 p-2.5 rounded-xl border border-slate-850 font-medium">
              Run the synthesized Prompt B externally. Paste the output XML envelope (&lt;researcher_output&gt;) below to preview the immediate extraction schema.
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Paste Synthesis Output (&lt;researcher_output&gt;)</label>
            <textarea
              value={researcherOutput}
              onChange={e => setResearcherOutput(e.target.value)}
              placeholder="Paste the full <researcher_output> response containing <expert_knowledge>, <good_reference_description>, <bad_reference_description>, <demo_message>, and <item_json> here..."
              rows={12}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-550 whitespace-pre-wrap leading-relaxed"
            />
          </div>

          {/* IMMEDIATE parsed live preview */}
          {(parsedExpertKnowledge || parsedGoodRef || parsedBadRef || parsedDemoMsg || parsedItemJson) && (
            <div className="border-t border-slate-850 pt-5 space-y-4 animate-fadeIn">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block font-mono">Immediate Synthesis Preview</span>

              {/* side-by-side Anchors */}
              {(parsedGoodRef || parsedBadRef) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parsedGoodRef && (
                    <div className="bg-slate-950/80 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Good Reference Listing Anchor</span>
                      <p className="text-[11px] text-slate-350 leading-relaxed font-mono whitespace-pre-wrap">{parsedGoodRef}</p>
                    </div>
                  )}

                  {parsedBadRef && (
                    <div className="bg-slate-950/80 border border-rose-500/25 rounded-2xl p-4 space-y-2">
                      <span className="text-[9px] bg-rose-500/10 text-rose-450 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Bad Reference Listing Anchor</span>
                      <p className="text-[11px] text-slate-350 leading-relaxed font-mono whitespace-pre-wrap">{parsedBadRef}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Outreach Demo */}
              {parsedDemoMsg && (
                <div className="bg-slate-950/80 border border-indigo-500/20 rounded-2xl p-4 space-y-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                  <span className="text-[9px] bg-indigo-500/10 text-indigo-450 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Outreach Starter Draft</span>
                  <p className="text-[11px] text-slate-200 font-semibold leading-relaxed italic">"{parsedDemoMsg}"</p>
                </div>
              )}

              {/* Cheat Sheet */}
              {parsedExpertKnowledge && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <span className="text-[9px] bg-slate-800 text-slate-400 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider block w-fit">Parsed Cheat Sheet (Expert Knowledge)</span>
                  <div className="text-[11px] text-slate-300 leading-relaxed font-mono whitespace-pre-wrap max-h-[150px] overflow-y-auto bg-slate-900/40 p-2.5 rounded-xl border border-slate-850">{parsedExpertKnowledge}</div>
                </div>
              )}

              {/* parsed schema checklist */}
              {parsedItemJson && (() => {
                try {
                  const parsedObj = JSON.parse(parsedItemJson)
                  const criteriaList = parsedObj.extraction_criteria || []
                  const weightsDict = parsedObj.scoring_model?.weights || {}
                  const hasNonBoolean = criteriaList.some((c: { type?: string }) => c.type !== 'boolean')

                  return (
                    <div className="space-y-4">
                      {hasNonBoolean && (
                        <div className="bg-rose-500/15 border border-rose-555/30 text-rose-400 p-4 rounded-2xl text-xs font-bold space-y-1.5">
                          <span>⚠️ Legacy Mixed Schema Detected!</span>
                          <p className="text-[10px] text-slate-450 font-semibold normal-case">The synth returned a non-boolean criterion field type. The matching pipeline requires all extraction criteria to be boolean only. Please adjust the planner output to match the boolean-only contract.</p>
                        </div>
                      )}

                      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] bg-slate-800 text-slate-400 font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">Scoring Checklist Criteria ({criteriaList.length})</span>
                          <span className="text-[9px] font-bold text-slate-500 font-mono">65% Checklist | 35% Soft Dimensions</span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[8px]">
                                <th className="py-2 pr-4">Criterion ID</th>
                                <th className="py-2 pr-4">Target Condition</th>
                                <th className="py-2 pr-4">Weight Impact</th>
                                <th className="py-2">Frequency</th>
                              </tr>
                            </thead>
                            <tbody>
                              {criteriaList.map((c: { id: string; description?: string; question?: string; market_frequency?: string }, idx: number) => {
                                const weightCfg = weightsDict[c.id] || {}
                                return (
                                  <tr key={idx} className="border-b border-slate-900/50 hover:bg-slate-900/10 text-slate-350">
                                    <td className="py-2 pr-4 font-bold font-mono text-[9px]">{c.id}</td>
                                    <td className="py-2 pr-4 leading-normal">{c.description || c.question}</td>
                                    <td className="py-2 pr-4 font-mono font-bold text-emerald-450">+{weightCfg.importance || 10} pts</td>
                                    <td className="py-2 font-semibold text-[9px] uppercase text-slate-500">{c.market_frequency || 'mixed'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )
                } catch {
                  return (
                    <div className="bg-amber-500/10 border border-amber-500/25 text-amber-500/80 p-3 rounded-2xl text-[10px] font-mono">
                      Awaiting valid &lt;item_json&gt; syntax parser...
                    </div>
                  )
                }
              })()}
            </div>
          )}

          {editKsError && (
            <div className="text-xs text-rose-450 font-semibold bg-rose-500/10 p-3.5 rounded-xl">{editKsError}</div>
          )}

          <div className="flex gap-3 pt-3 border-t border-slate-900">
            <button
              onClick={() => setWizardStep(2)}
              className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-450 hover:text-slate-200 text-xs font-bold py-3.5 rounded-xl transition-all"
            >
              &larr; Back to Market Analysis
            </button>
            <button
              onClick={handleSaveKnowledgeSet}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3.5 rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98"
            >
              Save Guidelines Profile
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
