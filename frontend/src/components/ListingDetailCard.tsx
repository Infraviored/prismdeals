import { useState } from 'react';
import type { Listing } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface ListingDetailCardProps {
  l: Listing;
  activeProcessingListingIds: string[];
  handleProcessSingleListing: (id: string) => void;
  selectedListingId: string | null;
  setSelectedListingId: (id: string | null) => void;
}

export default function ListingDetailCard({
  l,
  activeProcessingListingIds,
  handleProcessSingleListing,
  selectedListingId,
  setSelectedListingId
}: ListingDetailCardProps) {
  const { t, lang } = useTranslation();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [copiedOutreach, setCopiedOutreach] = useState(false);

  const handlePrevImage = (maxImages: number) => {
    setActiveImageIndex(prev => (prev - 1 + maxImages) % maxImages);
  };

  const handleNextImage = (maxImages: number) => {
    setActiveImageIndex(prev => (prev + 1) % maxImages);
  };

  const handleCopyOutreach = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedOutreach(true);
    setTimeout(() => setCopiedOutreach(false), 2000);
  };

  return (
    <Card className="p-5 justify-between hover:border-slate-700 hover:-translate-y-0.5 transition-all group">
      <div className="space-y-3">
        
        {/* Image Slideshow */}
        {l.images && l.images.length > 0 && (
          <div className="relative group/gallery w-full aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80 mb-3 shadow-md">
            <img
              src={l.images[activeImageIndex]}
              alt={`Listing visual ${activeImageIndex}`}
              className="w-full h-full object-cover transition-all duration-300 transform group-hover/gallery:scale-102"
            />
            {l.images.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePrevImage(l.images!.length); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-slate-950/85 hover:bg-slate-900 border border-slate-800 text-slate-350 w-7 h-7 rounded-full flex items-center justify-center text-xs opacity-0 group-hover/gallery:opacity-100 transition-opacity focus:outline-none"
                >
                  &larr;
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleNextImage(l.images!.length); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-950/85 hover:bg-slate-900 border border-slate-800 text-slate-350 w-7 h-7 rounded-full flex items-center justify-center text-xs opacity-0 group-hover/gallery:opacity-100 transition-opacity focus:outline-none"
                >
                  &rarr;
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex justify-between items-start">
          <div className="flex flex-col truncate pr-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold truncate max-w-[150px]">{l.item_name}</span>
            <span className="text-[9px] text-emerald-500 font-semibold uppercase">{l.campaign_name}</span>
            {l.last_description_changed_at && (
              <span className="text-[8px] text-slate-500 font-mono mt-0.5" title="Description last modified">
                {t('listing.mod', {
                  date: new Date(l.last_description_changed_at).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })
                })}
              </span>
            )}
          </div>
          
          {/* AI-Eval button + score — always visible, re-eval on click */}
          <div className="flex items-center gap-1.5">
            {l.llm_processed_time && (
              <span className="text-[9px] text-slate-500 font-medium hidden sm:inline-block">
                {new Date(l.llm_processed_time).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })}
              </span>
            )}
            <div className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                l.niceness_score === undefined || l.niceness_score === null
                  ? 'bg-slate-900/60 text-slate-500 border-slate-800'
                  : l.niceness_score >= 70
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : l.niceness_score >= 40
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
              {l.niceness_score === undefined || l.niceness_score === null ? '-' : l.niceness_score}
            </div>

            {(() => {
              const isStale = !l.llm_processed || 
                              !l.last_ai_evaluated_at || 
                              (l.last_description_changed_at && l.last_ai_evaluated_at && l.last_description_changed_at > l.last_ai_evaluated_at);
              
              const buttonStyles = activeProcessingListingIds.includes(l.id)
                ? 'bg-indigo-500/25 text-indigo-300 border-indigo-400/50 animate-pulse'
                : isStale
                ? 'animate-pulse bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30';

              return (
                <Button
                  type="button"
                  variant="badge"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProcessSingleListing(l.id);
                  }}
                  disabled={activeProcessingListingIds.includes(l.id)}
                  title={l.llm_processed ? (isStale ? t('listing.aiStale') : t('listing.reEvaluate')) : t('listing.evaluateWithAi')}
                  className={`flex items-center space-x-1 ${buttonStyles}`}
                >
                  {activeProcessingListingIds.includes(l.id) ? (
                    <div className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
                  ) : (
                    <span>{l.llm_processed ? '↺' : '🤖'} {t('listing.aiEval')}</span>
                  )}
                </Button>
              );
            })()}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-200 line-clamp-1 group-hover:text-emerald-400 transition-colors">{l.title}</h3>
          <div className="flex space-x-2 text-xs font-semibold text-slate-400 mt-1">
            <span className="text-emerald-400 font-bold">{l.price}</span>
            <span>•</span>
            <span>{l.location}</span>
            <span>•</span>
            <span>{l.date_string}</span>
          </div>
        </div>

        {/* Display relevant metadata harvested from full ad */}
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          {l.year && (
            <span className="text-[9px] bg-slate-950/80 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-md font-semibold">
              {t('listing.year', { year: l.year })}
            </span>
          )}
          {l.mileage && (
            <span className="text-[9px] bg-slate-950/80 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-md font-semibold">
              {l.mileage}
            </span>
          )}
          {l.cubic_capacity && (
            <span className="text-[9px] bg-slate-950/80 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-md font-semibold font-mono">
              {l.cubic_capacity}
            </span>
          )}

          {/* AI checklist satisfied and violated tags */}
          {l.llm_processed && l.criteria_evaluations && l.criteria_evaluations.map((evalItem, idx) => {
            if (evalItem.status === 'satisfied') {
              return (
                <span key={`sat-${idx}`} className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-semibold flex items-center gap-0.5">
                  <span className="text-emerald-500 font-bold">✓</span> {evalItem.name}
                </span>
              );
            }
            if (evalItem.status === 'violated') {
              return (
                <span key={`viol-${idx}`} className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md font-semibold flex items-center gap-0.5">
                  <span className="text-rose-400 font-bold">⚠️</span> {evalItem.name}
                </span>
              );
            }
            return null;
          })}

          {/* AI checklist Needs Re-Evaluation status */}
          {l.llm_processed && l.criteria_evaluations?.some(e => e.status === 'Needs Re-Evaluation') && (
            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md font-semibold flex items-center gap-0.5 animate-pulse">
              <span>⚠️</span> {t('listing.needsReEval')}
            </span>
          )}

          {/* AI Structured Highlights */}
          {l.llm_processed && l.highlights && l.highlights.slice(0, 4).map((h, idx) => {
            let colorClasses = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
            let emoji = '🔹';
            if (h.sentiment === 'positive') {
              colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              emoji = '✨';
            } else if (h.sentiment === 'negative') {
              colorClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
              emoji = '⚠️';
            }
            return (
              <span key={`highlight-${idx}`} className={`text-[9px] border px-2 py-0.5 rounded-md font-semibold flex items-center gap-0.5 transition-all duration-300 hover:scale-105 ${colorClasses}`}>
                <span>{emoji}</span> {h.label}
              </span>
            );
          })}
        </div>

        {/* Description Preview */}
        <div className="mt-3 text-[11px] text-slate-400 font-sans leading-relaxed border-t border-slate-850/30 pt-2.5">
          <p 
            style={{
              display: '-webkit-box',
              WebkitLineClamp: selectedListingId ? 12 : 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {l.description ? l.description : t('listing.awaitingScraper')}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
        <button
          onClick={() => setSelectedListingId(selectedListingId === l.id ? null : l.id)}
          className="text-xs text-slate-400 hover:text-slate-200 font-bold transition-colors"
        >
          {selectedListingId === l.id ? t('listing.hideDetails') : t('listing.expandDetails')}
        </button>
        <a
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors"
        >
          {t('listing.viewOriginal')} &rarr;
        </a>
      </div>

      {selectedListingId === l.id && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-4 animate-fadeIn text-xs">
          
          {/* AI Match Summary & Evaluations */}
          {l.llm_processed && (
            <div className="space-y-3">
              {/* High Priority Warnings banner */}
              {l.llm_processed && l.highlights && l.highlights.some(h => h.sentiment === 'negative') && (
                <div className="bg-rose-500/10 border border-rose-500/25 p-3.5 rounded-xl space-y-1.5 animate-fadeIn">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block font-mono">{t('listing.highPriorityWarnings')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {l.highlights.filter(h => h.sentiment === 'negative').map((h, idx) => (
                      <span key={idx} title={`Quote: "${h.evidence_quote}"`} className="text-[10px] bg-rose-500/20 text-rose-350 px-2 py-0.5 rounded-md font-semibold border border-rose-500/20">
                        {h.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* All Structured Highlights Observations */}
              {l.llm_processed && l.highlights && l.highlights.length > 0 && (
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block font-mono">{t('listing.specialHighlights')}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-sans">
                    {l.highlights.map((h, idx) => {
                      let colorClasses = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
                      let emoji = '🔹';
                      if (h.sentiment === 'positive') {
                        colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                        emoji = '✨';
                      } else if (h.sentiment === 'negative') {
                        colorClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                        emoji = '⚠️';
                      }
                      return (
                        <div key={idx} className={`text-[10px] border px-3 py-2 rounded-xl flex flex-col gap-1 ${colorClasses}`}>
                          <div className="flex justify-between items-center font-bold">
                            <span>{emoji} {h.label}</span>
                            <span className="text-[8px] uppercase opacity-75">{h.type} ({h.confidence})</span>
                          </div>
                          {h.evidence_quote && (
                            <p className="text-[9px] opacity-80 italic leading-normal border-t border-current/10 pt-1 mt-0.5">
                              "{h.evidence_quote}"
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">{t('listing.aiMatchSummary')}</span>
                <p className="text-slate-300 leading-relaxed font-sans">{l.summary}</p>
              </div>

              {/* Soft Dimensions */}
              {l.dimensions && (
                <div className="bg-slate-955/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block font-mono">{t('listing.softDimensions')}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(l.dimensions).map(([key, dim]) => {
                       const label = t(`listing.dimensions.${key}` as string) || key;
                       const score = dim.score;
                      const reasoning = dim.reasoning;
                      
                      const isSuspicion = key === 'hiddenRiskSuspicion';
                      const percentage = ((score - 1) / 4) * 100;
                      
                      const barColor = isSuspicion
                        ? (score >= 4 ? 'bg-rose-500' : score >= 3 ? 'bg-amber-500' : 'bg-emerald-500')
                        : (score >= 4 ? 'bg-emerald-500' : score >= 3 ? 'bg-amber-500' : 'bg-rose-500');

                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-semibold text-slate-300">
                            <span>{label}</span>
                            <span className="font-bold font-mono">{score}/5</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                            <div 
                              className={`h-full ${barColor} transition-all duration-550`} 
                              style={{ width: `${percentage}%` }} 
                            />
                          </div>
                          {reasoning && (
                            <p className="text-[9px] text-slate-500 font-sans leading-normal mt-0.5">{reasoning}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reference Anchor Comparison */}
              {l.reference_comparison && (
                <div className="bg-slate-955/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block font-mono">{t('listing.referenceComparison')}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      l.reference_comparison.closer_to === 'good'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : l.reference_comparison.closer_to === 'bad'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {t('listing.closerTo', { type: l.reference_comparison.closer_to.toUpperCase() })}
                    </span>
                  </div>
                  {l.reference_comparison.reasoning && (
                    <p className="text-slate-300 font-sans text-[10px] leading-relaxed italic bg-slate-950/30 p-2.5 rounded-lg border border-slate-900">
                      "{l.reference_comparison.reasoning}"
                    </p>
                  )}
                </div>
              )}
              
              <div className="bg-slate-955/60 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block mb-2 font-mono">{t('dashboard.checklist')}</span>
                <div className="space-y-2">
                  {l.criteria_evaluations && l.criteria_evaluations.map((evalItem, idx) => (
                    <div key={idx} className="flex justify-between items-start py-1 border-b border-slate-900 last:border-0 font-sans">
                      <div className="pr-3">
                        <span className="font-bold text-slate-350 text-[11px]">{evalItem.name}</span>
                        <span className="text-[10px] text-slate-550 block leading-normal mt-0.5">{evalItem.reasoning}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${evalItem.status === 'satisfied' ? 'bg-emerald-500/10 text-emerald-400' : evalItem.status === 'violated' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
                        {evalItem.status === 'satisfied' ? t('listing.satisfied').toUpperCase() : evalItem.status === 'violated' ? t('listing.violated').toUpperCase() : 'NEUTRAL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ready-to-Send Outreach Message Assistant */}
              {l.draft_message && (
                <div className="bg-slate-955/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-1.5">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">{t('listing.outreachAssistant')}</span>
                    <Button
                      type="button"
                      variant="mini-slate"
                      size="xs"
                      onClick={() => handleCopyOutreach(l.draft_message || '')}
                      className={`font-bold px-2.5 py-0.5 transition-all ${
                        copiedOutreach
                          ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 hover:text-emerald-300'
                      }`}
                    >
                      {copiedOutreach ? t('listing.copiedToClipboard') : t('listing.copyDraft')}
                    </Button>
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans italic text-[11px] bg-slate-950/60 p-3 rounded-lg border border-slate-900 select-all whitespace-pre-wrap">
                    {l.draft_message}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
