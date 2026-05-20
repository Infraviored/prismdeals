import { useState } from 'react';
import type { Listing } from '../types';

interface ListingDetailCardProps {
  l: Listing;
  activeProcessingListingId: string | null;
  handleProcessSingleListing: (id: string) => void;
  selectedListingId: string | null;
  setSelectedListingId: (id: string | null) => void;
}

export default function ListingDetailCard({
  l,
  activeProcessingListingId,
  handleProcessSingleListing,
  selectedListingId,
  setSelectedListingId
}: ListingDetailCardProps) {
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
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 hover:border-slate-755 rounded-2xl p-5 flex flex-col justify-between shadow-lg transition-all hover:-translate-y-0.5 group">
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
          </div>
          
          {/* AI-Eval button + score — always visible, re-eval on click */}
          <div className="flex items-center gap-1.5">
          {l.llm_processed && (
            <div className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                l.niceness_score >= 70
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : l.niceness_score >= 40
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
              {l.niceness_score}
            </div>
          )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleProcessSingleListing(l.id);
              }}
              disabled={activeProcessingListingId === l.id}
              title={l.llm_processed ? 'Re-evaluate with AI' : 'Evaluate with AI'}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center space-x-1 transition-all shadow-sm ${
                activeProcessingListingId === l.id
                  ? 'bg-indigo-500/25 text-indigo-300 border-indigo-400/50 animate-pulse'
                  : l.llm_processed
                  ? 'bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-400'
              }`}
            >
              {activeProcessingListingId === l.id ? (
                <div className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
              ) : (
                <span>{l.llm_processed ? '↺' : '🤖'} AI-Eval</span>
              )}
            </button>
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
              Year: {l.year}
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

          {/* AI Special Info highlights */}
          {l.llm_processed && l.special_info && l.special_info.map((info, idx) => (
            <span key={`spec-${idx}`} className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-semibold flex items-center gap-0.5">
              <span className="text-amber-500">⚡</span> {info}
            </span>
          ))}
        </div>

        {/* Description Preview (Always visible, expands preview length if any card is expanded to match grid height) */}
        <div className="mt-3 text-[11px] text-slate-400 font-sans leading-relaxed border-t border-slate-850/30 pt-2.5">
          <p 
            style={{
              display: '-webkit-box',
              WebkitLineClamp: selectedListingId ? 12 : 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {l.description ? l.description : "Awaiting scraping detail harvester to run..."}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-850 flex justify-between items-center">
        <button
          onClick={() => setSelectedListingId(selectedListingId === l.id ? null : l.id)}
          className="text-xs text-slate-400 hover:text-slate-200 font-bold transition-colors"
        >
          {selectedListingId === l.id ? 'Hide Details' : 'Expand Details'}
        </button>
        <a
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors"
        >
          View Original &rarr;
        </a>
      </div>

      {selectedListingId === l.id && (
        <div className="mt-4 pt-4 border-t border-slate-855 space-y-4 animate-fadeIn text-xs">
          
          {/* AI Match Summary & Evaluations */}
          {l.llm_processed && (
            <div className="space-y-3">
              {/* Special Info Warnings banner if present */}
              {l.special_info && l.special_info.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/25 p-3.5 rounded-xl space-y-1.5 animate-fadeIn">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block font-mono">⚠️ High Priority Warnings</span>
                  <div className="flex flex-wrap gap-1.5">
                    {l.special_info.map((info, idx) => (
                      <span key={idx} className="text-[10px] bg-rose-505/20 text-rose-300 px-2 py-0.5 rounded-md font-semibold border border-rose-500/20">
                        {info}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-955/60 p-3.5 rounded-xl border border-slate-850">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">AI Match Summary</span>
                <p className="text-slate-300 leading-relaxed font-sans">{l.summary}</p>
              </div>
              
              <div className="bg-slate-955/60 p-3.5 rounded-xl border border-slate-850">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block mb-2 font-mono">Checklist criteria evaluations</span>
                <div className="space-y-2">
                  {l.criteria_evaluations && l.criteria_evaluations.map((evalItem, idx) => (
                    <div key={idx} className="flex justify-between items-start py-1 border-b border-slate-900 last:border-0 font-sans">
                      <div className="pr-3">
                        <span className="font-bold text-slate-350 text-[11px]">{evalItem.name}</span>
                        <span className="text-[10px] text-slate-550 block leading-normal mt-0.5">{evalItem.reasoning}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${evalItem.status === 'satisfied' ? 'bg-emerald-500/10 text-emerald-400' : evalItem.status === 'violated' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
                        {evalItem.status === 'satisfied' ? 'SATISFIED' : evalItem.status === 'violated' ? 'VIOLATED' : 'NEUTRAL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ready-to-Send Outreach Message Assistant */}
              {l.draft_message && (
                <div className="bg-slate-955/60 p-3.5 rounded-xl border border-slate-850 space-y-2">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-1.5">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">📨 Outreach Assistant (Soft Invite)</span>
                    <button
                      onClick={() => handleCopyOutreach(l.draft_message || '')}
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border transition-all ${
                        copiedOutreach
                          ? 'bg-emerald-950 text-emerald-405 border-emerald-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20'
                      }`}
                    >
                      {copiedOutreach ? 'Copied to Clipboard!' : 'Copy Draft'}
                    </button>
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
    </div>
  );
}
