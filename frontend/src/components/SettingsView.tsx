import { useState, useEffect } from 'react';

interface SettingsViewProps {
  onBack: () => void;
}

export default function SettingsView({ onBack }: SettingsViewProps) {
  const [interval, setIntervalVal] = useState<number>(10);
  const [autoAiEval, setAutoAiEval] = useState<boolean>(true);
  const [fullFetchOnStartup, setFullFetchOnStartup] = useState<boolean>(false);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/schedule');
      if (res.ok) {
        const data = await res.json();
        setIntervalVal(data.interval ?? 10);
        setAutoAiEval(data.autoAiEval ?? true);
        setFullFetchOnStartup(data.fullFetchOnStartup ?? false);
      } else {
        setError('Failed to fetch scheduled scraper settings.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error fetching scraper settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          interval,
          autoAiEval,
          fullFetchOnStartup,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIntervalVal(data.config.interval);
        setAutoAiEval(data.config.autoAiEval);
        setFullFetchOnStartup(data.config.fullFetchOnStartup);
        setSuccess('Global configuration saved successfully and schedule updated!');
        setTimeout(() => setSuccess(''), 4000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to save scraper settings.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error saving scraper settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full animate-fadeIn py-4">
      {/* Header Bar */}
      <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
        <button
          onClick={onBack}
          className="text-xs text-slate-400 hover:text-slate-200 font-bold flex items-center space-x-1 bg-slate-850 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-800 transition-all shadow-sm"
        >
          <span>←</span>
          <span>Back to Campaigns</span>
        </button>
        <span className="text-slate-750 font-semibold select-none">|</span>
        <h2 className="text-base font-bold text-slate-200 tracking-tight">Global Scraper Settings</h2>
      </div>

      {loading ? (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-12 text-center shadow-lg">
          <div className="animate-spin w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-xs text-slate-400 font-medium">Loading background scraper schedule configurations...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/85 rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-44 h-44 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-44 h-44 rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />

          <div className="space-y-1">
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2.5 py-0.5 rounded uppercase tracking-wider w-fit block mb-1">
              Scheduler Configuration
            </span>
            <h3 className="text-lg font-bold text-slate-200 font-sans tracking-tight">Configure Scraper Rules</h3>
            <p className="text-xs text-slate-450 leading-relaxed font-semibold">
              These settings generalize across all campaigns and determine the background crawl behaviors.
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-semibold flex items-center space-x-2 animate-fadeIn">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-450 font-semibold flex items-center space-x-2 animate-fadeIn">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          <div className="space-y-5 pt-2">
            {/* Scraping Frequency */}
            <div className="space-y-1.5">
              <label htmlFor="scraper-interval-input" className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block">
                Crawl Frequency (Minutes)
              </label>
              <div className="relative">
                <input
                  id="scraper-interval-input"
                  type="number"
                  min="1"
                  max="1440"
                  required
                  value={interval}
                  onChange={(e) => setIntervalVal(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 font-medium placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                />
                <div className="absolute right-4 top-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest pointer-events-none select-none">
                  min
                </div>
              </div>
              <span className="text-[10px] text-slate-550 block leading-normal">
                How often the scraper wakes up in the background to fetch new matches. Default is 10 minutes.
              </span>
            </div>

            {/* Separator */}
            <div className="h-px bg-slate-800/80" />

            {/* Toggle: Auto AI Matcher */}
            <div className="flex items-start justify-between space-x-4 py-1">
              <div className="space-y-0.5">
                <label htmlFor="scraper-auto-ai-toggle" className="text-xs font-bold text-slate-200 block cursor-pointer">
                  Auto AI Evaluation
                </label>
                <span className="text-[10px] text-slate-500 block leading-normal max-w-md">
                  Automatically process new crawled listings using our AI model rules right after crawling.
                </span>
              </div>
              <button
                id="scraper-auto-ai-toggle"
                type="button"
                role="switch"
                aria-checked={autoAiEval}
                onClick={() => setAutoAiEval(!autoAiEval)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                  autoAiEval ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-100 shadow-md ring-0 transition duration-250 ease-in-out ${
                    autoAiEval ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Separator */}
            <div className="h-px bg-slate-800/80" />

            {/* Toggle: Full Fetch on Startup */}
            <div className="flex items-start justify-between space-x-4 py-1">
              <div className="space-y-0.5">
                <label htmlFor="scraper-startup-fetch-toggle" className="text-xs font-bold text-slate-200 block cursor-pointer">
                  Full Crawl on Boot
                </label>
                <span className="text-[10px] text-slate-550 block leading-normal max-w-md">
                  Trigger an immediate search index crawl for all active searches when the backend starts up.
                </span>
              </div>
              <button
                id="scraper-startup-fetch-toggle"
                type="button"
                role="switch"
                aria-checked={fullFetchOnStartup}
                onClick={() => setFullFetchOnStartup(!fullFetchOnStartup)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                  fullFetchOnStartup ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-100 shadow-md ring-0 transition duration-250 ease-in-out ${
                    fullFetchOnStartup ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="pt-4 flex space-x-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 disabled:opacity-50 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-400/20 hover:-translate-y-0.5"
            >
              {saving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full" />
                  <span>Saving configuration...</span>
                </>
              ) : (
                <span>Save Scraper Settings</span>
              )}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-3 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider transition-all border border-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
