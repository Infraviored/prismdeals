import { useState, useEffect } from 'react'

interface Campaign {
  id: number
  name: string
}

interface KnowledgeSet {
  id?: number
  name: string
  expert_knowledge: string
  item_json: Record<string, unknown>
}

interface SearchTarget {
  id?: number
  campaign_id: number | null
  name: string
  url: string
  enabled: boolean
  knowledge_set_id: number | null
  expert_knowledge?: string
  item_json?: Record<string, unknown>
}

interface Listing {
  id: string
  title: string
  price: string
  location: string
  url: string
  short_description: string
  detailed_description: string
  extracted_facts: Record<string, unknown>
  niceness_score: number
  status: string
  search_id: number
  item_name?: string
  campaign_name?: string
  llm_processed: boolean
  details?: Record<string, string>
  images?: string[]
  year?: string
  mileage?: string
  cubic_capacity?: string
  date_string?: string
  summary?: string
  criteria_evaluations?: {
    name: string
    reasoning: string
    status: 'satisfied' | 'dealbreaker' | 'neutral'
  }[]
  description?: string
}

interface ScraperProgressCardProps {
  isScraping: boolean;
  scrapingStatus: string;
  scrapingProgress: {
    phase: string;
    current: number;
    total: number;
    status: string;
  } | null;
  liveLogs: string;
  showLogConsole: boolean;
  setShowLogConsole: (val: boolean) => void;
}

function ScraperProgressCard({
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
          <span className="text-[10px] text-slate-500 block font-semibold">{current} / {total} Completed</span>
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

export default function App() {
  // Navigation
  const [view, setView] = useState<'landing' | 'dashboard' | 'edit'>('landing')
  const [isRegisteringTarget, setIsRegisteringTarget] = useState(false)

  // Database lists
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [searches, setSearches] = useState<SearchTarget[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [knowledgeSets, setKnowledgeSets] = useState<KnowledgeSet[]>([])

  // Authentication session state
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)

  // Sidebar selections & details
  const [currentCampaignId, setCurrentCampaignId] = useState<number | null>(null)
  const [currentSearchId, setCurrentSearchId] = useState<number | null>(null)
  const [currentKnowledgeSetId, setCurrentKnowledgeSetId] = useState<number | null>(null)


  // Filtering states for Deal Matcher
  const [selectedSearchId, setSelectedSearchId] = useState<string>('All')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'All' | 'High Niceness' | 'Dealbreaker' | 'New' | 'Evaluate with AI'>('All')
  const [activeProcessingListingId, setActiveProcessingListingId] = useState<string | null>(null)

  // Inline forms
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newTargetName, setNewTargetName] = useState('')
  const [newTargetUrl, setNewTargetUrl] = useState('')
  const [newTargetKsId, setNewTargetKsId] = useState<string>('')
  
  // Collapsible accordion state for Guidelines Editor

  // Knowledge Set form editor
  const [editKsName, setEditKsName] = useState('')
  const [editKsKnowledge, setEditKsKnowledge] = useState('')
  const [editKsJson, setEditKsJson] = useState('')
  const [editKsError, setEditKsError] = useState('')

  // Live URL validation preview
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [editingUrlValue, setEditingUrlValue] = useState('')

  // General state
  const [isScraping, setIsScraping] = useState(false)
  const [scrapingStatus, setScrapingStatus] = useState('')
  const [scrapingProgress, setScrapingProgress] = useState<{
    phase: string;
    current: number;
    total: number;
    status: string;
  } | null>(null)
  const [liveLogs, setLiveLogs] = useState<string>('')
  const [showLogConsole, setShowLogConsole] = useState(false)

  // Polling loop for active scraping task
  useEffect(() => {
    let intervalId: any = null;

    const checkStatus = async () => {
      try {
        const res = await fetch('/api/scrape/status');
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            setIsScraping(true);
            setScrapingProgress(data.progress);
            if (data.progress && data.progress.status) {
              setScrapingStatus(data.progress.status);
            }
            
            // Also fetch live logs
            const logsRes = await fetch('/api/logs');
            if (logsRes.ok) {
              const logsData = await logsRes.json();
              setLiveLogs(logsData.logs || '');
            }
          } else {
            // Scraper is no longer active in backend
            if (isScraping) {
              setIsScraping(false);
              setScrapingProgress(null);
              setScrapingStatus("Scraping completed!");
              refreshAll();
            }
          }
        }
      } catch (e) {
        console.error("Error polling scraper status:", e);
      }
    };

    // Run immediately
    checkStatus();

    // Poll every 1.5 seconds
    intervalId = setInterval(checkStatus, 1500);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isScraping]);
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null)
  
  // Custom states for images and descriptions
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)
  const [activeImageIndices, setActiveImageIndices] = useState<Record<string, number>>({})

  const handlePrevImage = (id: string, maxImages: number) => {
    setActiveImageIndices(prev => {
      const cur = prev[id] || 0
      return {
        ...prev,
        [id]: (cur - 1 + maxImages) % maxImages
      }
    })
  }

  const handleNextImage = (id: string, maxImages: number) => {
    setActiveImageIndices(prev => {
      const cur = prev[id] || 0
      return {
        ...prev,
        [id]: (cur + 1) % maxImages
      }
    })
  }

  // Initial load
  useEffect(() => {
    refreshAll()
    checkSessionStatus()
    const interval = setInterval(checkSessionStatus, 8000)
    return () => clearInterval(interval)
  }, [])

  const checkSessionStatus = async () => {
    try {
      const res = await fetch('/api/session-status')
      if (res.ok) {
        const data = await res.json()
        setSessionEmail(data.email || null)
      }
    } catch (err) {
      console.error("Error checking session status:", err)
    }
  }

  const handleTriggerLogin = async () => {
    setIsScraping(true)
    setScrapingStatus("Opening interactive browser window on your host... Please complete the login form inside the browser window. We will automatically detect when you have successfully logged in.")
    try {
      const res = await fetch('/api/login-session', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setScrapingStatus("Authentication completed successfully!")
          checkSessionStatus()
        } else {
          setScrapingStatus("Session watcher finished or timed out.")
        }
      } else {
        setScrapingStatus("Authentication process failed to trigger.")
      }
    } catch {
      setScrapingStatus("Error connecting to backend server.")
    } finally {
      setIsScraping(false)
    }
  }

  const refreshAll = () => {
    Promise.all([
      fetch('/api/campaigns').then(res => res.json()),
      fetch('/api/search-urls').then(res => res.json()),
      fetch('/api/listings').then(res => res.json()),
      fetch('/api/knowledge-sets').then(res => res.json())
    ]).then(([campaignsData, searchesData, listingsData, ksData]) => {
      setCampaigns(campaignsData)
      setSearches(searchesData)
      setKnowledgeSets(ksData)

      // Map raw listings to include React UI helper properties
      const mappedListings = listingsData.map((l: any) => {
        const year = l.details?.['Erstzulassung'] || '';
        const mileage = l.details?.['Kilometerstand'] || '';
        const cubic_capacity = l.details?.['Hubraum'] || '';
        const date_string = l.details?.['Erstellungsdatum'] || '';

        const description = l.detailed_description || l.short_description || '';

        // Reconstruct criteria_evaluations from extracted_facts and search target schema
        const targetSearch = searchesData.find((s: any) => s.id === l.search_id);
        const boundSet = targetSearch && targetSearch.knowledge_set_id 
          ? ksData.find((ks: any) => ks.id === targetSearch.knowledge_set_id)
          : null;
        
        let criteria_evaluations: any[] = [];
        let summary = 'Awaiting AI matching checklist evaluation...';

        if (l.llm_processed && boundSet && boundSet.item_json) {
          try {
            const itemConfig = typeof boundSet.item_json === 'string' 
              ? JSON.parse(boundSet.item_json) 
              : boundSet.item_json;
            const extractionCriteria = itemConfig.extraction_criteria || [];
            const scoringModel = itemConfig.scoring_model || {};
            const rules = scoringModel.rules || [];

            criteria_evaluations = extractionCriteria.map((c: any) => {
              const factVal = l.extracted_facts?.[c.id];
              let status: 'satisfied' | 'dealbreaker' | 'neutral' = 'neutral';
              
              // Find matching scoring rules
              const rule = rules.find((r: any) => r.criterion_id === c.id && r.value === factVal);
              if (rule && rule.is_dealbreaker) {
                status = 'dealbreaker';
              } else if (factVal === true) {
                status = 'satisfied';
              }

              const reasoning = factVal !== undefined && factVal !== null 
                ? `Value: ${factVal}` 
                : 'Not specified in listing description.';

              return {
                name: c.question || c.description || c.id,
                reasoning: reasoning,
                status: status
              };
            });

            // Make a nice summary
            const satisfiedCount = criteria_evaluations.filter(e => e.status === 'satisfied').length;
            const dealbreakerCount = criteria_evaluations.filter(e => e.status === 'dealbreaker').length;
            if (dealbreakerCount > 0) {
              summary = `Dealbreaker triggered! Evaluated ${criteria_evaluations.length} criteria, found ${dealbreakerCount} dealbreaker(s).`;
            } else {
              summary = `High compatibility deal! Evaluated ${criteria_evaluations.length} expert criteria, satisfied ${satisfiedCount}/${criteria_evaluations.length}. Niceness Score: ${l.niceness_score}.`;
            }
          } catch (e) {
            console.error("Error generating criteria evaluations:", e);
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
          summary
        };
      });

      setListings(mappedListings)

      // Set default campaign selection if none set
      if (campaignsData.length > 0 && currentCampaignId === null) {
        setCurrentCampaignId(campaignsData[0].id)
      }
    }).catch(err => {
      console.error("Error refreshing dashboard state:", err)
    })
  }

  const activeSearches = searches.filter(s => s.campaign_id === currentCampaignId)
  const activeSearchTarget = searches.find(s => s.id === currentSearchId) || activeSearches[0]

  // Auto load active guidelines when active search target changes
  useEffect(() => {
    if (activeSearchTarget && activeSearchTarget.knowledge_set_id) {
      const boundSet = knowledgeSets.find(ks => ks.id === activeSearchTarget.knowledge_set_id)
      if (boundSet) {
        setCurrentKnowledgeSetId(boundSet.id || null)
        setEditKsName(boundSet.name)
        setEditKsKnowledge(boundSet.expert_knowledge)
        setEditKsJson(JSON.stringify(boundSet.item_json, null, 2))
        setEditKsError('')
      }
    } else {
      setCurrentKnowledgeSetId(null)
      setEditKsName('')
      setEditKsKnowledge('')
      setEditKsJson('')
      setEditKsError('')
    }
  }, [activeSearchTarget, searches, knowledgeSets])

  // Create Campaign
  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim()) return
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCampaignName })
      })
      const data = await res.json()
      if (res.ok) {
        setNewCampaignName('')
        setCurrentCampaignId(data.id)
        refreshAll()
      } else {
        alert(data.error || "Failed to create campaign.")
      }
    } catch {
      alert("Failed to connect to backend server.")
    }
  }

  // Register New Search Target
  const handleRegisterTarget = async () => {
    if (!currentCampaignId || !newTargetName.trim() || !newTargetUrl.trim()) {
      alert("Please fill in target name and search URL.")
      return
    }

    try {
      const res = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: currentCampaignId,
          name: newTargetName,
          url: newTargetUrl,
          knowledge_set_id: newTargetKsId ? parseInt(newTargetKsId, 10) : null
        })
      })
      const data = await res.json()
      if (res.ok) {
        setNewTargetName('')
        setNewTargetUrl('')
        setNewTargetKsId('')
        setPreviewCount(null)
        setPreviewError(null)
        setCurrentSearchId(data.id)
        refreshAll()
      } else {
        alert(data.error || "Failed to save search target.")
      }
    } catch {
      alert("Error saving search target.")
    }
  }

  // Test url listing count
  const handleTestUrl = async (url: string) => {
    if (!url) return
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewCount(null)
    try {
      const res = await fetch('/api/searches/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const data = await res.json()
      if (res.ok) {
        setPreviewCount(data.count)
      } else {
        setPreviewError(data.error || "Failed loading count.")
      }
    } catch {
      setPreviewError("Server connection failed.")
    } finally {
      setPreviewLoading(false)
    }
  }

  // Update target knowledge set binding directly
  const handleBindKnowledgeSet = async (target: SearchTarget, ksId: number | null) => {
    try {
      const res = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          campaign_id: target.campaign_id,
          name: target.name,
          url: target.url,
          knowledge_set_id: ksId
        })
      })
      if (res.ok) {
        refreshAll()
      }
    } catch (err) {
      console.error("Error linking knowledge set:", err)
    }
  }

  // Update target search URL directly
  const handleUpdateTargetUrl = async (target: SearchTarget, newUrl: string) => {
    if (!newUrl.trim()) {
      alert("URL cannot be empty.")
      return
    }
    try {
      const res = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          campaign_id: target.campaign_id,
          name: target.name,
          url: newUrl.trim(),
          knowledge_set_id: target.knowledge_set_id
        })
      })
      if (res.ok) {
        setIsEditingUrl(false)
        refreshAll()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update search URL.")
      }
    } catch {
      alert("Connection to backend server failed.")
    }
  }

  // Trigger AI agent processing on a single specific listing
  const handleProcessSingleListing = async (listingId: string) => {
    setActiveProcessingListingId(listingId)
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId })
      })
      if (res.ok) {
        refreshAll()
      } else {
        alert("Failed to run AI agent for this listing.")
      }
    } catch {
      alert("Error contacting backend AI worker.")
    } finally {
      setActiveProcessingListingId(null)
    }
  }

  // Create new Knowledge Profile and link instantly
  const handleCreateNewSetAndBind = async (target: SearchTarget) => {
    const name = prompt("Enter a name for the new Guidelines Profile:", `${target.name} Guidelines`)
    if (!name) return
    try {
      const res = await fetch('/api/knowledge-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          expert_knowledge: '',
          item_json: {}
        })
      })
      const data = await res.json()
      if (res.ok) {
        await handleBindKnowledgeSet(target, data.id)
      } else {
        alert(data.error || "Failed to create knowledge profile.")
      }
    } catch {
      alert("Error contacting server.")
    }
  }

  // Update target enabled toggle directly
  const handleToggleTarget = async (target: SearchTarget, enabled: boolean) => {
    try {
      await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          campaign_id: target.campaign_id,
          name: target.name,
          url: target.url,
          knowledge_set_id: target.knowledge_set_id,
          enabled: enabled ? 1 : 0
        })
      })
      refreshAll()
    } catch (err) {
      console.error("Error toggling status:", err)
    }
  }

  // Delete search target
  const handleDeleteTarget = async (id: number) => {
    if (!confirm("Are you sure you want to delete this target?")) return
    try {
      const res = await fetch(`/api/searches/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCurrentSearchId(null)
        refreshAll()
      }
    } catch (err) {
      console.error("Error deleting target:", err)
    }
  }

  // Save Knowledge Set
  const handleSaveKnowledgeSet = async () => {
    if (!editKsName.trim()) {
      alert("Please enter a name for the Knowledge Set.")
      return
    }

    let parsedJson = {}
    if (editKsJson.trim()) {
      try {
        parsedJson = JSON.parse(editKsJson)
      } catch (e) {
        setEditKsError(`Invalid JSON syntax: ${(e as Error).message}`)
        return
      }
    }

    try {
      const res = await fetch('/api/knowledge-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentKnowledgeSetId || undefined,
          name: editKsName,
          expert_knowledge: editKsKnowledge,
          item_json: parsedJson
        })
      })
      if (res.ok) {
        setEditKsError('')
        alert("Guidelines profile saved successfully!")
        refreshAll()
      } else {
        const data = await res.json()
        setEditKsError(data.error || "Failed to save knowledge set.")
      }
    } catch {
      setEditKsError("Connection to backend server failed.")
    }
  }

  // Trigger crawler background process (Scrape only)
  const handleStartScrape = async () => {
    setIsScraping(true)
    setScrapingStatus("Spawning scraper worker...")
    setLiveLogs("Initializing browser context and logging session...")
    setScrapingProgress({ phase: 'starting', current: 0, total: 100, status: 'Spawning scraper worker...' })
    try {
      const res = await fetch('/api/scrape', { method: 'POST' })
      if (!res.ok) {
        alert("Failed to start scraper.")
        setIsScraping(false)
      }
    } catch {
      alert("Error triggering scraper process.")
      setIsScraping(false)
    }
  }

  // Trigger AI Matching Process
  const handleStartProcess = async () => {
    setIsProcessing(true)
    setProcessingStatus("Launching AI Matcher checklist evaluation and deal scoring...")
    try {
      const res = await fetch('/api/process', { method: 'POST' })
      if (res.ok) {
        setProcessingStatus("AI matching completed! Updating Deal Matcher results...")
        setTimeout(() => {
          refreshAll()
          setIsProcessing(false)
        }, 4000)
      } else {
        alert("Failed to launch AI Matcher.")
        setIsProcessing(false)
      }
    } catch {
      alert("Error contacting AI Matching backend.")
      setIsProcessing(false)
    }
  }

  // Copy helper
  const handleCopyPrompt = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPromptId(id)
    setTimeout(() => setCopiedPromptId(null), 2000)
  }

  // Filter listings based on currentCampaignId
  const filteredListings = listings.filter(l => {
    const targetSearch = searches.find(s => s.id === l.search_id)
    const matchesCampaign = !currentCampaignId || (targetSearch && targetSearch.campaign_id === currentCampaignId)
    const matchesSearch = selectedSearchId === 'All' || String(l.search_id) === selectedSearchId
    const isMatched = matchesCampaign && matchesSearch
    
    if (selectedStatusFilter === 'High Niceness') {
      return isMatched && l.llm_processed && l.niceness_score >= 70 && l.status !== 'Dealbreaker'
    }
    if (selectedStatusFilter === 'Dealbreaker') {
      return isMatched && l.llm_processed && (l.status === 'Dealbreaker' || l.niceness_score <= -999)
    }
    if (selectedStatusFilter === 'New') {
      return isMatched && l.status === 'New'
    }
    if (selectedStatusFilter === 'Evaluate with AI') {
      return isMatched && !l.llm_processed
    }
    return isMatched
  })

  // Prompt Templates
  const expertGuidelinesPrompt = `You are a world-class expert and seasoned buyer of [Target Campaign Category, e.g., Sports Motorbikes].
Generate a highly comprehensive, detailed general expert knowledge cheat sheet for buying items in this category.

Provide a breakdown that includes:
1. "Worauf du achten willst" (Technical/hardware details, model-specific vulnerabilities, wear-and-tear areas, typical failure points, and service/history checks).
2. "Soft seller questions" (Friendly, non-interrogative questions designed to prompt honest answers about the items' state).
3. "Sample Outreach Message Template" (A German sample template inviting private vendors to share details about their listing).

REFERENCE EXAMPLE (Motorbikes):
### Worauf du achten willst
- Ventilspiel-Historie, vor allem die 24.000-km-Kontrolle.
- Getriebe unter Last, besonders 2. und 3. Gang; nichts darf rausspringen.
- Lichtmaschine / Stator / Regler, vor allem bei frühen SC57.
- Gabeldichtringe (Simmerringe), auf Ölverlust prüfen.

### Soft seller questions
- "Hallo, schönes Teil! Wurde die große Ventilspielkontrolle bei 24.000 km schon erledigt und gibt es Belege dazu?"

Generate a highly targeted German markdown cheat sheet for: [State your target category here]`;

  const prompts = [
    {
      id: 'researcher',
      title: 'Researcher AI Prompt',
      description: 'Run this prompt in your LLM with your campaign parameters to generate the exact item JSON config.',
      content: `You are an expert market analyst. Help me build a structured ingestion profile for my deal matching portal.

We are searching for a specific product target with dynamic parameters. I will provide the product parameters.
Your goal is to output a perfect, raw JSON configuration that matches the following schema exactly.

SCHEMA:
{
  "product_domain": "Target product category or name",
  "extraction_criteria": [
    {
      "id": "camelCaseFieldId",
      "description": "Specific attribute to extract from listing text",
      "type": "boolean | number | string"
    }
  ],
  "scoring_model": {
    "base_score": 50,
    "rules": [
      {
        "criterion_id": "camelCaseFieldId",
        "value": "Value that triggers the score adjustment",
        "weight": 15,
        "is_dealbreaker": false
      }
    ],
    "outreach_strategy": {
      "tone": "casual / professional",
      "opening_hook": "Hi, I am interested in...",
      "questions": [
        {
          "target_criterion": "camelCaseFieldId",
          "question_text": "German outreach question template"
        }
      ]
    }
  }
}`
    }
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-lg shadow-lg shadow-emerald-500/20">K</div>
            <span className="font-semibold text-lg tracking-wide bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent font-sans">Kleinanzeigen Agent</span>
          </div>

          {/* Authentication session state widget */}
          <div className="flex items-center space-x-3 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 shadow-inner">
            <div className="flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${sessionEmail ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[10px] font-semibold text-slate-400">
                {sessionEmail ? `Session: ${sessionEmail}` : 'Session: Unauthenticated'}
              </span>
            </div>
            
            {!sessionEmail ? (
              <button
                onClick={handleTriggerLogin}
                disabled={isScraping || isProcessing}
                className="text-[9px] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-2 py-0.5 rounded transition-colors"
              >
                Log In
              </button>
            ) : (
              <button
                onClick={handleTriggerLogin}
                disabled={isScraping || isProcessing}
                className="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-2 py-0.5 rounded transition-colors"
              >
                Re-auth
              </button>
            )}
          </div>
        </div>

      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col justify-start">
        
        {/* VIEW 1: LANDING VIEW - CAMPAIGN HUB GRID */}
        {view === 'landing' && (
          <div className="space-y-8 animate-fadeIn w-full">
            <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-200">Active Hunt Campaigns</h2>
                <p className="text-xs text-slate-400 mt-1">Consolidated portal for starting browser crawlers, managing target search URLs, and running AI match analysis.</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-2xl flex flex-wrap items-center gap-3 shadow-inner">
                <span className="text-xs font-bold text-slate-450 uppercase tracking-wider">Quick Create:</span>
                <input
                  type="text"
                  value={newCampaignName}
                  onChange={e => setNewCampaignName(e.target.value)}
                  placeholder="e.g. Sports Bikes"
                  className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-700 w-48 text-slate-200 font-semibold"
                />
                <button
                  onClick={async () => {
                    if (!newCampaignName.trim()) return;
                    await handleCreateCampaign();
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95"
                >
                  Create Campaign
                </button>
              </div>
            </div>

            {campaigns.length === 0 ? (
              <div className="bg-slate-900/10 border border-dashed border-slate-800 rounded-2xl p-20 text-center shadow-inner max-w-2xl mx-auto space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl mx-auto shadow-inner">
                  +
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-300">Welcome to Kleinanzeigen Agent!</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed">
                    Create your first campaign to get started with automated listing discovery and AI-powered deal scoring.
                  </p>
                </div>
                <div className="flex justify-center pt-2">
                  <div className="bg-slate-950/80 border border-slate-850 p-3 rounded-2xl flex items-center space-x-2 w-[340px]">
                    <input
                      type="text"
                      value={newCampaignName}
                      onChange={e => setNewCampaignName(e.target.value)}
                      placeholder="Enter campaign category name..."
                      className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder-slate-700 flex-1 text-slate-200 font-semibold"
                    />
                    <button
                      onClick={handleCreateCampaign}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-2 rounded-xl transition-all font-sans"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map(c => {
                  const campaignSearches = searches.filter(s => s.campaign_id === c.id)
                  const campaignListings = listings.filter(l => {
                    const s = searches.find(x => x.id === l.search_id)
                    return s && s.campaign_id === c.id
                  })
                  const unprocessedCount = campaignListings.filter(l => !l.llm_processed).length

                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setCurrentCampaignId(c.id);
                        setView('dashboard');
                      }}
                      className="bg-slate-900/50 backdrop-blur-xl border border-slate-855 hover:border-slate-700 p-6 rounded-2xl shadow-xl flex flex-col justify-between space-y-4 hover:-translate-y-0.5 transition-all cursor-pointer group"
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <h3 className="text-base font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">{c.name}</h3>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentCampaignId(c.id);
                              // Auto select first target if available, or null
                              const firstTarget = searches.find(s => s.campaign_id === c.id);
                              setCurrentSearchId(firstTarget?.id || null);
                              setView('edit');
                            }}
                            title="Edit Campaign Targets & Guidelines"
                            className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-all border border-slate-800"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="flex space-x-3 text-xs text-slate-500 font-medium items-center">
                          <span>{campaignSearches.length} Targets</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-semibold">{campaignListings.length} Total</span>
                          {unprocessedCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse">
                                {unprocessedCount} New Listings
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-855 pt-3 flex justify-between items-center text-[11px] text-slate-400">
                        <span className="font-semibold group-hover:text-emerald-400 transition-colors flex items-center space-x-1">
                          <span>Open Dashboard</span>
                          <span className="transform group-hover:translate-x-1 transition-transform">→</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: CAMPAIGN DASHBOARD - FEED LISTINGS VIEW */}
        {view === 'dashboard' && (
          <div className="flex flex-col space-y-6 animate-fadeIn w-full">
            
            {/* Campaign Breadcrumb Headers & Filters */}
            <div className="flex flex-wrap gap-4 items-center justify-between bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setCurrentCampaignId(null);
                    setView('landing');
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 font-bold flex items-center space-x-1 bg-slate-850 hover:bg-slate-750 px-3 py-1.5 rounded-xl border border-slate-800 transition-all"
                >
                  ← Back to Campaigns
                </button>
                <span className="text-slate-750">|</span>
                <h2 className="text-base font-bold text-slate-200">{campaigns.find(c => c.id === currentCampaignId)?.name} Dashboard</h2>
                
                <button
                  onClick={() => {
                    // Auto select first target if available, or null
                    const firstTarget = searches.find(s => s.campaign_id === currentCampaignId);
                    setCurrentSearchId(firstTarget?.id || null);
                    setView('edit');
                  }}
                  title="Configure Campaign Settings"
                  className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-all border border-slate-800"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center space-x-3">
                {/* Crawler and AI control actions */}
                <div className="flex space-x-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 shadow-inner">
                  <button
                    onClick={handleStartScrape}
                    disabled={isScraping || isProcessing}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs transition-colors flex items-center space-x-1 shadow-lg shadow-emerald-500/10"
                  >
                    <span>🔍 Scrape Listings</span>
                  </button>
                  <button
                    onClick={handleStartProcess}
                    disabled={isScraping || isProcessing}
                    className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold px-3 py-2 rounded-lg text-xs transition-colors flex items-center space-x-1 shadow-lg shadow-indigo-500/10"
                  >
                    <span>🤖 Run AI Matcher</span>
                  </button>
                </div>
                
                {/* Target search filter */}
                <select
                  value={selectedSearchId}
                  onChange={e => setSelectedSearchId(e.target.value)}
                  className="bg-slate-950 text-xs font-semibold text-slate-300 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">All Targets</option>
                  {searches.filter(s => s.campaign_id === currentCampaignId).map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>

                <select
                  value={selectedStatusFilter}
                  onChange={e => setSelectedStatusFilter(e.target.value as typeof selectedStatusFilter)}
                  className="bg-slate-950 text-xs font-semibold text-slate-300 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="High Niceness">High Niceness (70+)</option>
                  <option value="Evaluate with AI">Evaluate with AI</option>
                  <option value="New">Unprocessed / New</option>
                  <option value="Dealbreaker">Dealbreakers</option>
                </select>
              </div>
            </div>

            <ScraperProgressCard
              isScraping={isScraping}
              scrapingStatus={scrapingStatus}
              scrapingProgress={scrapingProgress}
              liveLogs={liveLogs}
              showLogConsole={showLogConsole}
              setShowLogConsole={setShowLogConsole}
            />

            {isProcessing && (
              <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-2xl flex items-center space-x-3 text-xs text-indigo-400">
                <div className="animate-pulse w-3 h-3 rounded-full bg-indigo-400" />
                <span className="font-semibold">{processingStatus}</span>
              </div>
            )}

            {/* Grid of Matched Listings */}
            {filteredListings.length === 0 ? (
              <div className="bg-slate-900/20 border border-dashed border-slate-855 rounded-2xl p-16 text-center shadow-inner">
                <span className="text-sm text-slate-500 font-semibold block mb-1">No matching listings found</span>
                <span className="text-xs text-slate-650 block">Configure search targets, link guidelines checklists, and trigger scraper discovery crawls to harvest deals.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings.map(l => (
                  <div key={l.id} className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 hover:border-slate-755 rounded-2xl p-5 flex flex-col justify-between shadow-lg transition-all hover:-translate-y-0.5 group">
                    <div className="space-y-3">
                      
                      {/* Image Slideshow */}
                      {l.images && l.images.length > 0 && (
                        <div className="relative group/gallery w-full aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80 mb-3 shadow-md">
                          <img
                            src={l.images[activeImageIndices[l.id] || 0]}
                            alt={`Listing visual ${activeImageIndices[l.id] || 0}`}
                            className="w-full h-full object-cover transition-all duration-300 transform group-hover/gallery:scale-102"
                          />
                          {l.images.length > 1 && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePrevImage(l.id, l.images!.length); }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-slate-950/85 hover:bg-slate-900 border border-slate-800 text-slate-350 w-7 h-7 rounded-full flex items-center justify-center text-xs opacity-0 group-hover/gallery:opacity-100 transition-opacity focus:outline-none"
                              >
                                &larr;
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleNextImage(l.id, l.images!.length); }}
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

                      {/* Display relevant metadata harvested from full article */}
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
                        
                        {/* Expanded details attributes */}
                        <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-xl space-y-2 text-slate-450">
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

                        {l.llm_processed && (
                          <div className="space-y-3">
                            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850">
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">AI Match Summary</span>
                              <p className="text-slate-300 leading-relaxed font-sans">{l.summary}</p>
                            </div>
                            
                            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850">
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
                        
                        <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-850">
                          <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block mb-1">Detailed Description</span>
                          <p className="text-slate-405 whitespace-pre-wrap leading-relaxed font-sans text-[11px]">
                            {l.description ? l.description : "Awaiting scraping detail harvester to run..."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: CAMPAIGN TARGETS & GUIDELINES EDITOR */}
        {view === 'edit' && (
          <div className="flex flex-col space-y-6 w-full animate-fadeIn">
            
            {/* Sub Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 w-full">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setView('dashboard')}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-emerald-400 text-xs font-bold px-3.5 py-2 rounded-xl transition-all border border-slate-800 flex items-center space-x-1.5 shadow-sm active:scale-95"
                >
                  <span>← Back to Dashboard</span>
                </button>
                <div className="w-[1px] h-5 bg-slate-800" />
                <div>
                  <h1 className="text-base font-bold text-slate-200">{campaigns.find(c => c.id === currentCampaignId)?.name} Settings</h1>
                  <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">Targets & Guidelines Configuration</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start h-full w-full">
            
              {/* LEFT PANEL: CAMPAIGNS & TARGETS LIST */}
              <div className="lg:col-span-1 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 space-y-6 shadow-2xl flex flex-col">
                
                {/* Targets List */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search Targets ({activeSearches.length})</span>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {activeSearches.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-slate-850 rounded-xl text-slate-650 text-xs font-semibold">
                        No targets added to this campaign.
                      </div>
                    ) : (
                      activeSearches.map(s => (
                        <div
                          key={s.id}
                          onClick={() => setCurrentSearchId(s.id || null)}
                          className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${
                            activeSearchTarget?.id === s.id
                              ? 'bg-slate-800/80 border-slate-600 shadow-md'
                              : 'bg-slate-950/40 border-slate-855 hover:bg-slate-900/60'
                          }`}
                        >
                          <div className="flex flex-col truncate pr-2">
                            <span className="text-xs font-bold text-slate-200 truncate">{s.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono truncate">{s.url}</span>
                          </div>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.enabled ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add target action toggle */}
                  {!isRegisteringTarget ? (
                    <button
                      onClick={() => setIsRegisteringTarget(true)}
                      className="w-full bg-slate-950/40 hover:bg-slate-900/60 border border-slate-850 border-dashed hover:border-slate-750 text-slate-400 hover:text-slate-250 font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-1"
                    >
                      <span>+ Register New Target</span>
                    </button>
                  ) : (
                    <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3 pt-3 animate-fadeIn">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-350 block uppercase">Register New Search Target</span>
                        <button
                          onClick={() => setIsRegisteringTarget(false)}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-400"
                        >
                          Cancel
                        </button>
                      </div>
                      
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={newTargetName}
                          onChange={e => setNewTargetName(e.target.value)}
                          placeholder="Target Item Name (e.g. CBR 1000)"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-200"
                        />
                        <input
                          type="text"
                          value={newTargetUrl}
                          onChange={e => setNewTargetUrl(e.target.value)}
                          placeholder="Kleinanzeigen search URL..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-emerald-500 font-mono text-slate-200"
                        />
                        
                        <div className="flex gap-2 items-center">
                          <select
                            value={newTargetKsId}
                            onChange={e => setNewTargetKsId(e.target.value)}
                            className="flex-1 bg-slate-950 text-xs border border-slate-800 rounded-lg px-2 py-2 focus:outline-none focus:border-emerald-550 text-slate-400"
                          >
                            <option value="">No Linked Guidelines Profile</option>
                            {knowledgeSets.map(ks => (
                              <option key={ks.id} value={ks.id}>{ks.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleTestUrl(newTargetUrl)}
                            disabled={previewLoading}
                            className="bg-slate-850 hover:bg-slate-700 text-[10px] font-bold px-2 py-2 rounded-lg text-slate-300 transition-colors"
                          >
                            Test Count
                          </button>
                        </div>

                        {previewCount !== null && (
                          <div className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">Found {previewCount} live listings!</div>
                        )}
                        {previewError && (
                          <div className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-1 rounded">{previewError}</div>
                        )}

                        <button
                          onClick={async () => {
                            await handleRegisterTarget();
                            setIsRegisteringTarget(false);
                          }}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold py-2 rounded-lg transition-colors mt-2"
                        >
                          + Add Target to Campaign
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* RIGHT PANEL: TARGET INSPECTOR & UNIFIED GUIDELINES EDITOR */}
              <div className="lg:col-span-2 space-y-6">
                {activeSearchTarget ? (
                  <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
                    
                    {/* Target details */}
                    <div className="flex justify-between items-start pb-4 border-b border-slate-800">
                      <div className="space-y-1">
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded uppercase">Search Target</span>
                        <div className="flex items-center space-x-2">
                          <h2 className="text-xl font-bold text-slate-200">{activeSearchTarget.name}</h2>
                          
                          {/* Inline Test Count Action for registered target */}
                          <button
                            onClick={() => handleTestUrl(activeSearchTarget.url)}
                            disabled={previewLoading}
                            className="text-[9px] bg-slate-850 hover:bg-slate-700 text-slate-300 border border-slate-750 px-2 py-0.5 rounded font-bold transition-all inline-flex items-center"
                          >
                            {previewLoading ? 'Testing...' : '🔍 Test Count'}
                          </button>

                          {previewCount !== null && (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Live: {previewCount}</span>
                          )}
                          {previewError && (
                            <span className="text-[9px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded font-bold">Error: {previewError}</span>
                          )}
                        </div>
                        
                        {isEditingUrl ? (
                          <div className="flex items-center space-x-2 mt-1">
                            <input
                              type="text"
                              value={editingUrlValue}
                              onChange={e => setEditingUrlValue(e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 text-slate-200 font-mono w-[300px]"
                              placeholder="https://www.kleinanzeigen.de/..."
                            />
                            <button
                              onClick={() => handleUpdateTargetUrl(activeSearchTarget, editingUrlValue)}
                              className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setIsEditingUrl(false)}
                              className="text-[10px] bg-slate-850 hover:bg-slate-755 text-slate-400 font-bold px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 mt-1">
                            <a href={activeSearchTarget.url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 font-mono hover:text-emerald-400 truncate block max-w-[320px]">
                              {activeSearchTarget.url}
                            </a>
                            <button
                              onClick={() => {
                                setEditingUrlValue(activeSearchTarget.url);
                                setIsEditingUrl(true);
                              }}
                              className="text-[9px] bg-slate-850 hover:bg-slate-700 text-slate-400 px-2 py-0.5 rounded border border-slate-800 transition-all font-semibold"
                            >
                              Edit URL
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-850 rounded-xl px-3 py-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${activeSearchTarget.enabled ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                        <span className="text-xs font-bold text-slate-300">{activeSearchTarget.enabled ? 'Active' : 'Disabled'}</span>
                        <button
                          onClick={() => handleToggleTarget(activeSearchTarget, !activeSearchTarget.enabled)}
                          className="ml-2 text-[9px] bg-slate-855 hover:bg-slate-700 text-slate-400 font-bold px-2 py-1 rounded border border-slate-800"
                        >
                          Toggle
                        </button>
                      </div>
                    </div>

                    {/* Linked guidelines profile */}
                    <div className="bg-slate-955/40 border border-slate-850 p-4 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expert Guidelines & Target Specification</span>
                        
                        {!activeSearchTarget.knowledge_set_id && (
                          <button
                            onClick={() => handleCreateNewSetAndBind(activeSearchTarget)}
                            className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 font-bold px-2.5 py-1 rounded-lg transition-all"
                          >
                            + Create Guidelines Set
                          </button>
                        )}
                      </div>

                      <div className="flex items-center space-x-3">
                        <select
                          value={activeSearchTarget.knowledge_set_id || ''}
                          onChange={e => {
                            const id = e.target.value ? parseInt(e.target.value, 10) : null
                            handleBindKnowledgeSet(activeSearchTarget, id)
                          }}
                          className="bg-slate-950 text-xs font-semibold text-slate-450 border border-slate-800 rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500 flex-1"
                        >
                          <option value="">No linked guidelines profile (Passively scrapes only)</option>
                          {knowledgeSets.map(ks => (
                            <option key={ks.id} value={ks.id}>{ks.name}</option>
                          ))}
                        </select>
                      </div>

                      {activeSearchTarget.knowledge_set_id && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Guidelines Profile Name</label>
                            <input
                              type="text"
                              value={editKsName}
                              onChange={e => setEditKsName(e.target.value)}
                              placeholder="e.g. Honda CBR SC57 Checksheet"
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500 text-slate-200"
                            />
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {/* Left Column: Guidelines Checklist */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center bg-slate-900/40 px-2.5 py-1.5 rounded-lg border border-slate-850">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">1. Expert guidelines checklist</span>
                                <button
                                  onClick={() => handleCopyPrompt(expertGuidelinesPrompt, 'inline-guidelines')}
                                  className={`text-[9px] px-2 py-0.5 rounded font-bold transition-all ${copiedPromptId === 'inline-guidelines' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/25' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                                >
                                  {copiedPromptId === 'inline-guidelines' ? 'Copied prompt!' : 'Copy Template'}
                                </button>
                              </div>
                              <textarea
                                value={editKsKnowledge}
                                onChange={e => setEditKsKnowledge(e.target.value)}
                                placeholder="Paste model vulnerabilities, soft seller questions, big service milestones..."
                                rows={8}
                                className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 font-sans whitespace-pre-wrap"
                              />
                            </div>

                            {/* Right Column: Ingestion Schema JSON */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center bg-slate-900/40 px-2.5 py-1.5 rounded-lg border border-slate-850">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">2. AI Researcher JSON schema</span>
                                <button
                                  onClick={() => handleCopyPrompt(prompts[0].content, 'inline-json')}
                                  className={`text-[9px] px-2 py-0.5 rounded font-bold transition-all ${copiedPromptId === 'inline-json' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/25' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                                >
                                  {copiedPromptId === 'inline-json' ? 'Copied prompt!' : 'Copy Template'}
                                </button>
                              </div>
                              <textarea
                                value={editKsJson}
                                onChange={e => setEditKsJson(e.target.value)}
                                placeholder="Paste structured JSON criteria config containing 'extraction_criteria' and 'scoring_model'..."
                                rows={8}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-emerald-400 font-mono focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          </div>

                          {editKsError && (
                            <div className="text-xs text-rose-400 font-semibold bg-rose-500/10 p-2 rounded">{editKsError}</div>
                          )}

                          <div className="flex justify-between items-center pt-2 border-t border-slate-900">
                            <span className="text-[10px] text-slate-500">Saves globally to the linked guidelines profile.</span>
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveKnowledgeSet}
                                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-lg shadow-emerald-500/10"
                              >
                                Save Guidelines Profile
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!activeSearchTarget.knowledge_set_id && (
                        <div className="text-center py-8 space-y-3">
                          <p className="text-xs text-slate-500">No active knowledge profile linked to this search target.</p>
                          <button
                            onClick={() => handleCreateNewSetAndBind(activeSearchTarget)}
                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/10"
                          >
                            Create & Link New Guidelines Profile
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Dangerous actions */}
                    <div className="pt-4 border-t border-slate-800 flex justify-end">
                      <button
                        onClick={() => handleDeleteTarget(activeSearchTarget.id!)}
                        className="text-xs text-rose-500 hover:text-rose-400 font-bold transition-colors"
                      >
                        Delete Search Target
                      </button>
                    </div>

                  </div>
                ) : (
                  <div className="bg-slate-900/20 border border-dashed border-slate-855 rounded-2xl p-20 text-center shadow-inner h-full flex flex-col justify-center items-center">
                    <span className="text-sm text-slate-500 font-semibold block mb-1">No search targets registered yet</span>
                    <span className="text-xs text-slate-650 block">Click "+ Register New Target" on the left panel to create your first tracking target.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
