import { useState, useEffect } from 'react'
import type { Campaign, KnowledgeSet, SearchTarget, Listing } from './types'
import ScraperProgressCard from './components/ScraperProgressCard'
import ListingDetailCard from './components/ListingDetailCard'

interface ExtractedFactsSchema {
  criteria?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  special_info?: string[];
  draft_message?: string;
  [key: string]: unknown;
}

interface ParsedKnowledgeConfig {
  product_domain?: string;
  extraction_criteria?: {
    id: string;
    description?: string;
    type?: string;
    question?: string;
  }[];
  scoring_model?: {
    weights?: Record<string, {
      satisfied_if?: unknown;
      importance?: number;
    }>;
  };
}

export default function App() {
  // Navigation
  const [view, setView] = useState<'landing' | 'dashboard' | 'edit' | 'create-campaign'>('landing')
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
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'All' | 'High Niceness' | 'New' | 'Evaluate with AI'>('All')
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
    let intervalId: ReturnType<typeof setInterval> | null = null;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScraping]);

  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')

  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null)
  const [schemaPrompt, setSchemaPrompt] = useState<string>('Loading...')

  // Custom states for images and descriptions
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)

  // Initial load
  useEffect(() => {
    refreshAll()
    checkSessionStatus()
    fetch('/api/schema-prompt').then(r => r.text()).then(setSchemaPrompt).catch(() => setSchemaPrompt('Failed to load schema_prompt.md'))
    const interval = setInterval(checkSessionStatus, 8000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function checkSessionStatus() {
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

  function refreshAll() {
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
      const mappedListings = listingsData.map((l: Listing) => {
        const year = l.details?.['Erstzulassung'] || '';
        const mileage = l.details?.['Kilometerstand'] || '';
        const cubic_capacity = l.details?.['Hubraum'] || '';
        const date_string = l.details?.['Erstellungsdatum'] || '';

        const description = l.detailed_description || l.short_description || '';

        // Reconstruct criteria_evaluations from extracted_facts and search target schema
        const targetSearch = searchesData.find((s: SearchTarget) => s.id === l.search_id);
        const boundSet = targetSearch && targetSearch.knowledge_set_id
          ? ksData.find((ks: KnowledgeSet) => ks.id === targetSearch.knowledge_set_id)
          : null;

        let criteria_evaluations: NonNullable<Listing['criteria_evaluations']> = [];
        let special_info: string[] = [];
        let draft_message = '';
        let summary = 'Awaiting AI matching checklist evaluation...';

        if (l.llm_processed && boundSet && boundSet.item_json) {
          try {
            const itemConfig = (typeof boundSet.item_json === 'string' ? JSON.parse(boundSet.item_json) : boundSet.item_json) as ParsedKnowledgeConfig;
            const extractionCriteria = itemConfig.extraction_criteria || [];

            const rawFacts = l.extracted_facts as unknown as ExtractedFactsSchema;
            const criteriaDict = rawFacts?.criteria || rawFacts || {};
            const reasoningDict = rawFacts?.reasoning || {};
            special_info = rawFacts?.special_info || [];
            draft_message = rawFacts?.draft_message || '';

            const weights = itemConfig.scoring_model?.weights || {};

            criteria_evaluations = extractionCriteria.map((c: { id: string; question?: string; description?: string }) => {
              const factVal = criteriaDict[c.id];
              const wEntry = weights[c.id];
              const satisfiedIf = wEntry?.satisfied_if;
              let status: 'satisfied' | 'neutral' | 'violated' = 'neutral';

              if (factVal !== undefined && factVal !== null && factVal !== 'unknown') {
                if (satisfiedIf !== undefined) {
                  status = factVal === satisfiedIf ? 'satisfied' : 'violated';
                } else {
                  // fallback for boolean without weights entry
                  if (factVal === true) status = 'satisfied';
                  else if (factVal === false) status = 'violated';
                }
              }

              const rawReasoning = reasoningDict[c.id];
              const reasoning = typeof rawReasoning === 'string'
                ? rawReasoning
                : (rawReasoning ? String(rawReasoning) : '') || (factVal !== undefined && factVal !== null
                  ? `Value: ${factVal}`
                  : 'Not specified in listing description.');

              return {
                id: c.id,
                name: c.question || c.description || c.id,
                reasoning: reasoning,
                status: status,
                value: factVal
              };
            });

            // Make a nice summary
            const satisfiedCount = criteria_evaluations.filter(e => e.status === 'satisfied').length;
            summary = `Evaluated ${criteria_evaluations.length} expert criteria, satisfied ${satisfiedCount}/${criteria_evaluations.length}. Niceness Score: ${l.niceness_score}.`;
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
          special_info,
          draft_message,
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleUpdateWeight = (criterionId: string, newImportance: number) => {
    try {
      const config = JSON.parse(editKsJson) as ParsedKnowledgeConfig;
      if (!config.scoring_model) config.scoring_model = {};
      if (!config.scoring_model.weights) config.scoring_model.weights = {};

      if (!config.scoring_model.weights[criterionId]) {
        // Default: infer satisfied_if from criterion type
        const criterion = (config.extraction_criteria || []).find((c: { id: string; type?: string }) => c.id === criterionId);
        config.scoring_model.weights[criterionId] = {
          satisfied_if: criterion?.type === 'boolean' ? true : 1,
          importance: newImportance
        };
      } else {
        config.scoring_model.weights[criterionId].importance = newImportance;
      }

      setEditKsJson(JSON.stringify(config, null, 2));
    } catch (e) {
      console.error('Could not update weight inside invalid JSON:', e);
    }
  }

  const handleToggleSatisfiedIf = (criterionId: string) => {
    try {
      const config = JSON.parse(editKsJson) as ParsedKnowledgeConfig;
      if (!config.scoring_model) config.scoring_model = {};
      if (!config.scoring_model.weights) config.scoring_model.weights = {};

      const criterion = (config.extraction_criteria || []).find((c: { id: string; type?: string }) => c.id === criterionId);
      const isNumType = criterion?.type === 'number';

      if (!config.scoring_model.weights[criterionId]) {
        config.scoring_model.weights[criterionId] = {
          satisfied_if: isNumType ? 1 : false,
          importance: 0
        };
      } else {
        const current = config.scoring_model.weights[criterionId].satisfied_if;
        if (typeof current === 'boolean') {
          config.scoring_model.weights[criterionId].satisfied_if = !current;
        } else if (typeof current === 'number') {
          config.scoring_model.weights[criterionId].satisfied_if = current === 1 ? 0 : 1;
        } else {
          config.scoring_model.weights[criterionId].satisfied_if = true;
        }
      }

      setEditKsJson(JSON.stringify(config, null, 2));
    } catch (e) {
      console.error('Could not toggle satisfied_if inside invalid JSON:', e);
    }
  }

  const handleUpdateSatisfiedIfValue = (criterionId: string, value: unknown) => {
    try {
      const config = JSON.parse(editKsJson) as ParsedKnowledgeConfig;
      if (!config.scoring_model) config.scoring_model = {};
      if (!config.scoring_model.weights) config.scoring_model.weights = {};

      if (!config.scoring_model.weights[criterionId]) {
        config.scoring_model.weights[criterionId] = {
          satisfied_if: value,
          importance: 0
        };
      } else {
        config.scoring_model.weights[criterionId].satisfied_if = value;
      }

      setEditKsJson(JSON.stringify(config, null, 2));
    } catch (e) {
      console.error('Could not update satisfied_if inside invalid JSON:', e);
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
      return isMatched && l.llm_processed && l.niceness_score >= 70
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
          <div className="space-y-6 animate-fadeIn w-full">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800/80 w-full mb-6">
              <div>
                <h1 className="text-xl font-bold text-slate-200">Hunt Campaigns</h1>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Automated Scraper & AI Agent Portal</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* "+" Add Hunt Campaign Card */}
              {campaigns.map(c => {
                const campaignSearches = searches.filter(s => s.campaign_id === c.id)
                const campaignListings = listings.filter(l => {
                  const s = searches.find(x => x.id === l.search_id)
                  return s && s.campaign_id === c.id
                })
                const unprocessedCount = campaignListings.filter(l => !l.llm_processed).length
                const firstListingWithImages = campaignListings.find(l => l.images && l.images.length > 0)
                const firstImg = firstListingWithImages?.images?.[0]

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setCurrentCampaignId(c.id);
                      setView('dashboard');
                    }}
                    className="bg-slate-900/50 backdrop-blur-xl border border-slate-855 hover:border-slate-700 p-4 rounded-2xl shadow-xl flex flex-col justify-between space-y-4 hover:-translate-y-0.5 transition-all cursor-pointer group"
                  >
                    {firstImg ? (
                      <div className="w-full aspect-[21/9] rounded-xl overflow-hidden relative border border-slate-800 shadow-inner">
                        <img
                          src={firstImg}
                          alt={c.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                      </div>
                    ) : (
                      <div className="w-full aspect-[21/9] rounded-xl relative border border-slate-800/80 bg-gradient-to-br from-indigo-500/10 via-slate-950 to-emerald-500/5 flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent" />
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest font-mono">No listings scraped yet</span>
                      </div>
                    )}

                    <div className="flex-1 flex flex-col justify-between pt-1">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-200 group-hover:text-emerald-400 transition-colors tracking-tight line-clamp-1">{c.name}</h3>
                            <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Campaign Hunt Profile</p>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentCampaignId(c.id);
                              const firstTarget = searches.find(s => s.campaign_id === c.id);
                              setCurrentSearchId(firstTarget?.id || null);
                              setView('edit');
                            }}
                            title="Edit Campaign Targets & Guidelines"
                            className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-all border border-slate-800"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[9px] font-semibold">
                          <span className="bg-slate-950/60 text-slate-400 border border-slate-855 px-2 py-0.5 rounded-md">
                            {campaignSearches.length} Targets
                          </span>
                          <span className="bg-slate-950/60 text-emerald-400 border border-emerald-500/10 px-2 py-0.5 rounded-md font-bold">
                            {campaignListings.length} Matches
                          </span>
                          {unprocessedCount > 0 && (
                            <span className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-md font-extrabold animate-pulse">
                              {unprocessedCount} New
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-855 mt-4 pt-3 flex justify-between items-center text-[11px] text-slate-450 font-bold">
                        <span className="group-hover:text-emerald-400 transition-colors flex items-center space-x-1">
                          <span>Open Dashboard</span>
                          <span className="transform group-hover:translate-x-1 transition-transform">&rarr;</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* "+" Add Hunt Campaign Card */}
              <div
                onClick={() => setView('create-campaign')}
                className="bg-slate-900/20 backdrop-blur-xl border border-dashed border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/[0.02] p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center space-y-4 hover:-translate-y-0.5 transition-all cursor-pointer group h-full min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all shadow-inner">
                  +
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold text-slate-300 group-hover:text-emerald-400 transition-colors">Create Hunt Campaign</h3>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">Launch a new automated agent search category</p>
                </div>
              </div>
            </div>
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
                    <span>🤖 Batch AI-Eval</span>
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
                  <ListingDetailCard
                    key={l.id}
                    l={l}
                    activeProcessingListingId={activeProcessingListingId}
                    handleProcessSingleListing={handleProcessSingleListing}
                    selectedListingId={selectedListingId}
                    setSelectedListingId={setSelectedListingId}
                  />
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
                          className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${activeSearchTarget?.id === s.id
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
                                  onClick={() => handleCopyPrompt(schemaPrompt, 'inline-json')}
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

                          {(() => {
                            let parsedConfig: ParsedKnowledgeConfig | null = null;
                            try {
                              parsedConfig = JSON.parse(editKsJson) as ParsedKnowledgeConfig;
                            } catch {
                              // Ignore invalid JSON in UI helper
                            }

                            if (!parsedConfig || !parsedConfig.extraction_criteria || parsedConfig.extraction_criteria.length === 0) {
                              return null;
                            }

                            const weights = parsedConfig.scoring_model?.weights || {};
                            const totalWeight = Object.values(weights).reduce((sum, w) => sum + (w.importance || 0), 0);

                            return (
                              <div className="bg-slate-955/40 p-4 border border-slate-850 rounded-xl mt-4 space-y-4">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-900 pb-3 gap-2">
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                      <span>🎛️</span>
                                      <span>Interactive Criteria Tuner</span>
                                    </h4>
                                    <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                                      Toggle positive/negative targets and adjust relative importance weights inside the raw JSON.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {totalWeight === 100 ? (
                                      <span className="text-[10px] bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-bold font-mono">
                                        ✓ Weight Sum: 100%
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg font-bold font-mono animate-pulse">
                                        ⚠ Sum: {totalWeight}% (Must be 100%)
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {parsedConfig.extraction_criteria.map((c: { id: string; description?: string; type?: string }) => {
                                    const wEntry = weights[c.id];
                                    const currentImportance = wEntry ? wEntry.importance ?? 0 : 0;
                                    const satisfiedVal = wEntry ? wEntry.satisfied_if : undefined;

                                    const resolvedSatisfiedVal = satisfiedVal === undefined
                                      ? (c.type === 'boolean' ? true : 1)
                                      : satisfiedVal;

                                    const percentBadgeColor = currentImportance === 0
                                      ? 'text-slate-500 bg-slate-800/40 border-slate-800'
                                      : (typeof resolvedSatisfiedVal === 'boolean'
                                        ? (resolvedSatisfiedVal
                                          ? 'text-emerald-450 bg-emerald-500/10 border-emerald-500/20'
                                          : 'text-rose-455 bg-rose-500/10 border-rose-500/20')
                                        : 'text-sky-400 bg-sky-500/10 border-sky-500/20');

                                    return (
                                      <div key={c.id} className="bg-slate-900/40 p-4 rounded-xl border border-slate-855 hover:border-slate-800 transition-all flex flex-col space-y-4 shadow-inner">
                                        <div className="flex justify-between items-start gap-2">
                                          <div className="flex flex-col space-y-1">
                                            <span className="text-xs font-bold text-slate-200 line-clamp-1">{c.description || c.id}</span>
                                            <span className="text-[9px] text-slate-500 font-semibold font-mono tracking-wider uppercase">{c.type || 'boolean'}</span>
                                          </div>
                                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${percentBadgeColor}`}>
                                            {currentImportance}%
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-2 pt-2 border-t border-slate-900/30">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Target:</span>
                                          {typeof resolvedSatisfiedVal === 'boolean' ? (
                                            <button
                                              onClick={() => handleToggleSatisfiedIf(c.id)}
                                              className={`text-[9px] font-extrabold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 cursor-pointer ${
                                                resolvedSatisfiedVal
                                                  ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20 hover:bg-emerald-500/25'
                                                  : 'bg-rose-500/10 text-rose-455 border-rose-500/20 hover:bg-rose-500/25'
                                              }`}
                                            >
                                              {resolvedSatisfiedVal ? '🟢 Positive (TRUE)' : '🔴 Negative (FALSE)'}
                                            </button>
                                          ) : (
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="number"
                                                value={typeof resolvedSatisfiedVal === 'number' ? resolvedSatisfiedVal : 1}
                                                onChange={(e) => {
                                                  const val = e.target.value === '' ? '' : Number(e.target.value);
                                                  handleUpdateSatisfiedIfValue(c.id, val);
                                                }}
                                                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] font-bold text-slate-200 font-mono w-16 text-center"
                                              />
                                              <span className="text-[9px] text-slate-500 font-bold uppercase">(Ideal)</span>
                                            </div>
                                          )}
                                        </div>

                                        <div className="flex flex-col space-y-1.5 pt-1">
                                          <div className="flex justify-between text-[9px] text-slate-500 font-semibold font-sans px-0.5">
                                            <span>Low Importance</span>
                                            <span>Critical Importance</span>
                                          </div>
                                          <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={currentImportance}
                                            onChange={(e) => handleUpdateWeight(c.id, parseInt(e.target.value))}
                                            className="w-full accent-emerald-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer border border-slate-800"
                                            style={{
                                              background: `linear-gradient(to right, rgb(16, 185, 129) 0%, rgb(16, 185, 129) ${currentImportance}%, rgb(15, 23, 42) ${currentImportance}%, rgb(15, 23, 42) 100%)`
                                            }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

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

        {/* VIEW 4: CREATE NEW CAMPAIGN VIEW */}
        {view === 'create-campaign' && (
          <div className="flex flex-col items-center justify-center space-y-6 w-full animate-fadeIn py-12 max-w-lg mx-auto">
            <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 w-full shadow-2xl space-y-6 relative overflow-hidden">
              {/* Abstract decorative glowing orb */}
              <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
              <div className="absolute -left-16 -bottom-16 w-36 h-36 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setView('landing')}
                    className="text-xs text-slate-400 hover:text-emerald-400 transition-colors font-bold flex items-center space-x-1"
                  >
                    <span>&larr; Back</span>
                  </button>
                </div>
                <h2 className="text-xl font-extrabold text-slate-200 font-sans tracking-tight">Create Hunt Campaign</h2>
                <p className="text-xs text-slate-450 leading-relaxed font-medium">Set up a new target category profile to discover listings, map scraper crawlers, and score deals with AI checklist evaluation.</p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Campaign Name</label>
                  <input
                    type="text"
                    value={newCampaignName}
                    onChange={e => setNewCampaignName(e.target.value)}
                    placeholder="e.g. Vintage Scooters, Yamaha Motorcycles"
                    className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 placeholder-slate-700 w-full text-slate-200 font-semibold transition-all shadow-inner"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newCampaignName.trim()) {
                        await handleCreateCampaign();
                        setView('dashboard');
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setView('landing')}
                  className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-450 hover:text-slate-200 text-xs font-bold py-3 rounded-xl transition-all active:scale-98"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!newCampaignName.trim()) return;
                    await handleCreateCampaign();
                    setView('dashboard');
                  }}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold py-3 rounded-xl transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98"
                >
                  Create & Launch &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
