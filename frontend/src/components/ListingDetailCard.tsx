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

  const handlePrevImage = (maxImages: number) => {
    setActiveImageIndex(prev => (prev - 1 + maxImages) % maxImages);
  };

  const handleNextImage = (maxImages: number) => {
    setActiveImageIndex(prev => (prev + 1) % maxImages);
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
          
           {!l.llm_processed ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleProcessSingleListing(l.id);
              }}
              disabled={activeProcessingListingId !== null}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center space-x-1.5 transition-all shadow-sm ${
                activeProcessingListingId === l.id
                  ? 'bg-amber-500/25 text-amber-300 border-amber-400/50 animate-pulse'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-400'
              }`}
            >
              {activeProcessingListingId === l.id ? (
                <>
                  <div className="animate-spin w-3 h-3 border border-amber-400 border-t-transparent rounded-full" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  <span>Evaluate with AI</span>
                </>
              )}
            </button>
          ) : l.niceness_score <= -999 ? (
            <div className="text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              DEALBREAKER
            </div>
          ) : (
            <div className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Score: {l.niceness_score}
            </div>
          )}
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
          
          {/* Harvested Specs */}
          <div className="bg-slate-955/40 border border-slate-850 p-3 rounded-xl space-y-2 text-slate-450">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Harvested Specifications</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-sans">
              {l.price && <div><span className="font-semibold text-slate-500">Price:</span> {l.price}</div>}
              {l.location && <div><span className="font-semibold text-slate-500">Location:</span> {l.location}</div>}
              {l.mileage && <div><span className="font-semibold text-slate-500">Mileage:</span> {l.mileage}</div>}
              {l.year && <div><span className="font-semibold text-slate-500">First Reg:</span> {l.year}</div>}
              {l.cubic_capacity && <div><span className="font-semibold text-slate-500">Capacity:</span> {l.cubic_capacity}</div>}
              {l.date_string && <div><span className="font-semibold text-slate-500">Listed:</span> {l.date_string}</div>}
            </div>
          </div>

          {/* AI Match Summary & Evaluations */}
          {l.llm_processed && (
            <div className="space-y-3">
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
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${evalItem.status === 'satisfied' ? 'bg-emerald-500/10 text-emerald-400' : evalItem.status === 'dealbreaker' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
                        {evalItem.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <div className="bg-slate-955/40 p-3.5 rounded-xl border border-slate-850">
            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block mb-1">Detailed Description</span>
            <p className="text-slate-400 whitespace-pre-wrap leading-relaxed font-sans text-[11px]">
              {l.description ? l.description : "Awaiting scraping detail harvester to run..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
