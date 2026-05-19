import type { ScraperProgressCardProps } from '../types';

export default function ScraperProgressCard({
  isScraping,
  scrapingStatus,
  scrapingProgress,
  liveLogs,
  showLogConsole,
  setShowLogConsole
}: ScraperProgressCardProps) {
  if (!isScraping) return null;

  const current = scrapingProgress?.current ?? 0;
  const total = scrapingProgress?.total ?? 100;
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;
  const phase = scrapingProgress?.phase || 'starting';

  let phaseLabel = "Initializing";
  let phaseColor = "bg-amber-500/10 text-amber-400 border border-amber-500/25";
  let barColor = "from-amber-500 to-amber-400 animate-pulse";
  
  if (phase === 'discovery') {
    phaseLabel = "Discovery Phase (Index Page Crawl)";
    phaseColor = "bg-sky-500/10 text-sky-400 border border-sky-500/25";
    barColor = "from-sky-500 to-sky-400";
  } else if (phase === 'harvesting') {
    phaseLabel = "Enrichment Phase (Sequential Page Harvest)";
    phaseColor = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25";
    barColor = "from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]";
  }

  return (
    <div className="bg-slate-900/90 backdrop-blur-2xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4 animate-fadeIn my-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="animate-spin w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full" />
            <h3 className="text-sm font-bold text-slate-200">Active Scraping Session</h3>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${phaseColor}`}>
              {phaseLabel}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed font-medium">
            {scrapingStatus || "Connecting to background scraper worker..."}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-lg font-black text-emerald-400 font-mono tracking-tight">{pct}%</span>
          <span className="text-[10px] text-slate-550 block font-semibold">{current} / {total} Completed</span>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full bg-slate-950/80 h-3 rounded-full overflow-hidden p-0.5 border border-slate-850 shadow-inner">
        <div 
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500 relative`}
          style={{ width: `${pct}%` }}
        >
          {/* Shine animation */}
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>

      {/* Retro Log Console */}
      <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950">
        <button
          onClick={() => setShowLogConsole(!showLogConsole)}
          className="w-full px-4 py-2.5 bg-slate-900/60 hover:bg-slate-900 transition-colors flex items-center justify-between text-xs text-slate-400 hover:text-slate-250 font-bold focus:outline-none"
        >
          <div className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono">view_live_scraper_logs.sh</span>
          </div>
          <span>{showLogConsole ? 'Collapse [-]' : 'Expand [+]'}</span>
        </button>
        
        {showLogConsole && (
          <div className="p-4 border-t border-slate-900 font-mono text-[11px] text-slate-350 leading-relaxed h-48 overflow-y-auto whitespace-pre-wrap select-text selection:bg-emerald-500/30 selection:text-white">
            {liveLogs ? liveLogs : "Waiting for log stream lines..."}
          </div>
        )}
      </div>
    </div>
  );
}
