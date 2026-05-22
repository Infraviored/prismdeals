/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import type { Campaign, KnowledgeSet, SearchTarget, Listing, SampleListing } from './types'
import ScraperProgressCard from './components/ScraperProgressCard'
import ListingDetailCard from './components/ListingDetailCard'
import GuidelinesWizard from './components/GuidelinesWizard'
import SettingsView from './components/SettingsView'
import { transformListing } from './utils/listingTransformer'
import { useHashRouter } from './hooks/useHashRouter'
import { GearIcon } from './components/GearIcon'


const isValidKleinanzeigenUrl = (urlStr: string): boolean => {
  try {
    const url = new URL(urlStr);
    return url.hostname.includes('kleinanzeigen.de');
  } catch {
    return false;
  }
};

const suggestTitleFromUrl = (urlStr: string): string => {
  try {
    const url = new URL(urlStr);
    const paths = url.pathname.split('/');
    const candidate = paths.find(segment => {
      if (!segment) return false;
      if (segment.startsWith('s-')) return false;
      if (segment.includes(':')) return false;
      if (/^\d+$/.test(segment)) return false;
      if (segment.startsWith('k0') || segment.includes('+') || segment.includes('.')) return false;
      if (['suche', 'kategorie', 'anzeigen'].includes(segment.toLowerCase())) return false;
      return true;
    });
    
    if (candidate) {
      return decodeURIComponent(candidate)
        .replace(/-/g, ' ')
        .trim();
    }
  } catch {
    // Ignore
  }
  return '';
};




export default function App() {
  const {
    view,
    currentCampaignId,
    currentSearchId,
    selectedListingId,
    wizardStep,
    previousView,
    setView,
    setCurrentCampaignId,
    setCurrentSearchId,
    setSelectedListingId,
    setWizardStep,
    navigate
  } = useHashRouter()

  const [isRegisteringTarget, setIsRegisteringTarget] = useState(false)

  // Database lists
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [searches, setSearches] = useState<SearchTarget[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [knowledgeSets, setKnowledgeSets] = useState<KnowledgeSet[]>([])

  // Authentication session state
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)

  // Sidebar selections & details
  const [currentKnowledgeSetId, setCurrentKnowledgeSetId] = useState<number | null>(null)

  const activeSearches = searches.filter(s => s.campaign_id === currentCampaignId)
  const activeSearchTarget = searches.find(s => s.id === currentSearchId) || activeSearches[0]


  // Filtering states for Deal Matcher
  const [selectedSearchId, setSelectedSearchId] = useState<string>('All')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'All' | 'High Niceness' | 'New' | 'Evaluate with AI'>('All')
  const [activeProcessingListingIds, setActiveProcessingListingIds] = useState<string[]>([])

  // Inline forms
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newTargetUrl, setNewTargetUrl] = useState('')
  const [isEditingCampaignName, setIsEditingCampaignName] = useState(false)

  // Step wizard states for Guidelines Editor
  const [sampledListings, setSampledListings] = useState<SampleListing[]>([])
  const [sampledListingsLoading, setSampledListingsLoading] = useState(false)
  const [marketMemo, setMarketMemo] = useState<string>('')
  const [researcherOutput, setResearcherOutput] = useState<string>('')

  // Prompt templates from backend
  const [researchPromptTemplate, setResearchPromptTemplate] = useState<string>('')
  const [marketPromptTemplate, setMarketPromptTemplate] = useState<string>('')
  const [profilePromptTemplate, setProfilePromptTemplate] = useState<string>('')

  // Parsed XML states for Step 3
  const [parsedExpertKnowledge, setParsedExpertKnowledge] = useState('')
  const [parsedGoodRef, setParsedGoodRef] = useState('')
  const [parsedBadRef, setParsedBadRef] = useState('')
  const [parsedDemoMsg, setParsedDemoMsg] = useState('')
  const [parsedItemJson, setParsedItemJson] = useState('')

  // Compatibility names for existing views and components
  const [editKsName, setEditKsName] = useState('')
  const [editKsError, setEditKsError] = useState('')

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

  const fetchSampleListings = async (searchId: number) => {
    setSampledListingsLoading(true)
    try {
      const response = await fetch(`/api/searches/${searchId}/sample-listings`)
      if (response.ok) {
        const data = await response.json()
        setSampledListings(data)
      } else {
        console.error("Failed to fetch sample listings")
        alert("Failed to fetch sample listings from server.")
      }
    } catch (error) {
      console.error("Error fetching sample listings:", error)
      alert("Error contacting the backend to fetch listings.")
    } finally {
      setSampledListingsLoading(false)
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
      const mappedListings = listingsData.map((l: Listing) => transformListing(l, searchesData, ksData));

      setListings(mappedListings)

      // Set default campaign selection if none set
      if (campaignsData.length > 0 && currentCampaignId === null) {
        setCurrentCampaignId(campaignsData[0].id);
      }
    }).catch(err => {
      console.error("Error refreshing dashboard state:", err)
    })
  }

  // Load Prompt templates
  useEffect(() => {
    fetch('/api/prompts/research')
      .then(r => r.text())
      .then(setResearchPromptTemplate)
      .catch(err => console.error("Error loading research template:", err))

    fetch('/api/prompts/market')
      .then(r => r.text())
      .then(setMarketPromptTemplate)
      .catch(err => console.error("Error loading market template:", err))

    fetch('/api/prompts/profile')
      .then(r => r.text())
      .then(setProfilePromptTemplate)
      .catch(err => console.error("Error loading profile template:", err))
  }, [])

  // Parse XML blocks in Step 3 on the fly
  useEffect(() => {
    const ekMatch = researcherOutput.match(/<expert_knowledge>([\s\S]*?)<\/expert_knowledge>/i)
    setParsedExpertKnowledge(ekMatch ? ekMatch[1].trim() : '')

    const grMatch = researcherOutput.match(/<good_reference_description>([\s\S]*?)<\/good_reference_description>/i)
    setParsedGoodRef(grMatch ? grMatch[1].trim() : '')

    const brMatch = researcherOutput.match(/<bad_reference_description>([\s\S]*?)<\/bad_reference_description>/i)
    setParsedBadRef(brMatch ? brMatch[1].trim() : '')

    const dmMatch = researcherOutput.match(/<demo_message>([\s\S]*?)<\/demo_message>/i)
    setParsedDemoMsg(dmMatch ? dmMatch[1].trim() : '')

    const ijMatch = researcherOutput.match(/<item_json>([\s\S]*?)<\/item_json>/i)
    setParsedItemJson(ijMatch ? ijMatch[1].trim() : '')
  }, [researcherOutput])

  // Live URL validation preview
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

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
              if (activeSearchTarget?.id) {
                fetchSampleListings(activeSearchTarget.id);
              }
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
     
  }, [isScraping, activeSearchTarget?.id]);

  // Polling loop for active AI evaluations
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const checkActiveProcesses = async () => {
      try {
        const res = await fetch('/api/process/active');
        if (res.ok) {
          const data = await res.json();
          // If the list of active IDs changed, we might want to refresh listings
          // to get the new scores for those that just finished.
          setActiveProcessingListingIds(prev => {
            const finished = prev.filter(id => !data.active.includes(id));
            if (finished.length > 0) {
              refreshAll();
            }
            return data.active;
          });
        }
      } catch {
        // Ignore
      }
    };
    checkActiveProcesses();
    intervalId = setInterval(checkActiveProcesses, 2000);
    return () => clearInterval(intervalId);
  }, []);

  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')



  // Custom states for images and descriptions

  // Initial load
  useEffect(() => {
    refreshAll()
    checkSessionStatus()

    const interval = setInterval(checkSessionStatus, 8000)
    return () => clearInterval(interval)
     
  }, [])

  // Auto-redirect empty campaigns to configuration view
  useEffect(() => {
    if (currentCampaignId && view === 'dashboard') {
      const campaignSearches = searches.filter(s => s.campaign_id === currentCampaignId);
      if (campaignSearches.length === 0) {
        navigate('edit', currentCampaignId, null);
      }
    }
  }, [currentCampaignId, searches, view, navigate]);

  // Trigger a fast crawler scrape directly from the target URL
  async function triggerFastScrape(searchId: number) {
    setIsScraping(true)
    setScrapingStatus("Spawning targeted crawler to fetch market listings...")
    setLiveLogs("Starting targeted Chrome headless scraper session...")
    setScrapingProgress({ phase: 'starting', current: 0, total: 100, status: 'Spawning scraper worker...' })
    try {
      const res = await fetch(`/api/searches/${searchId}/scrape`, { method: 'POST' })
      if (!res.ok) {
        alert("Failed to start targeted scraper.")
        setIsScraping(false)
      }
    } catch {
      alert("Error triggering targeted scraper.")
      setIsScraping(false)
    }
  }

  // Debounced auto-registration and count fetch
  useEffect(() => {
    if (!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl)) {
      return;
    }

    // Only auto-register if we are in registration mode
    const campaignSearches = searches.filter(s => s.campaign_id === currentCampaignId);
    if (!(campaignSearches.length === 0 || isRegisteringTarget)) {
      return;
    }

    const timer = setTimeout(async () => {
      // Suggest title
      const suggested = suggestTitleFromUrl(newTargetUrl) || 'New Search';

      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewCount(null);

      try {
        // Fetch count in background
        const countRes = await fetch('/api/searches/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: newTargetUrl })
        });
        let fetchedCount = null;
        if (countRes.ok) {
          const countData = await countRes.json();
          fetchedCount = countData.count;
          setPreviewCount(fetchedCount);
        }

        // Auto-create guidelines profile
        const ksRes = await fetch('/api/knowledge-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${suggested} Guidelines`,
            expert_knowledge: '',
            item_json: {}
          })
        });
        let boundKsId = null;
        if (ksRes.ok) {
          const ksData = await ksRes.json();
          boundKsId = ksData.id;
        }

        // Auto-register Search Query
        const searchRes = await fetch('/api/searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: currentCampaignId,
            name: suggested,
            url: newTargetUrl,
            knowledge_set_id: boundKsId
          })
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          // Reset input states
          setNewTargetUrl('');
          setPreviewCount(null);
          setIsRegisteringTarget(false);
          
          // Set newly registered search active
          setCurrentSearchId(searchData.id);
          
          // Trigger the fast crawler crawl
          triggerFastScrape(searchData.id);

          // Force refresh list of campaigns/searches
          refreshAll();
        } else {
          const errData = await searchRes.json();
          setPreviewError(errData.error || "Failed to auto-register search target.");
        }
      } catch {
        setPreviewError("Failed to auto-register search query due to connection issues.");
      } finally {
        setPreviewLoading(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [newTargetUrl, currentCampaignId, searches, isRegisteringTarget]);




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



  // Auto load active guidelines when active search target changes
  useEffect(() => {
    if (activeSearchTarget && activeSearchTarget.knowledge_set_id) {
      const boundSet = knowledgeSets.find(ks => ks.id === activeSearchTarget.knowledge_set_id)
      if (boundSet) {
        setCurrentKnowledgeSetId(boundSet.id || null)
        setEditKsName(boundSet.name)
        setMarketMemo(boundSet.market_memo || '')
        
        let samples: SampleListing[] = []
        if (boundSet.market_samples_json) {
          try {
            samples = typeof boundSet.market_samples_json === 'string' 
              ? JSON.parse(boundSet.market_samples_json) 
              : boundSet.market_samples_json
          } catch { /* empty */ }
        }
        setSampledListings(samples)

        let raw = ''
        if (boundSet.expert_knowledge) {
          raw += `<expert_knowledge>\n${boundSet.expert_knowledge}\n</expert_knowledge>\n\n`
        }
        if (boundSet.good_reference_description) {
          raw += `<good_reference_description>\n${boundSet.good_reference_description}\n</good_reference_description>\n\n`
        }
        if (boundSet.bad_reference_description) {
          raw += `<bad_reference_description>\n${boundSet.bad_reference_description}\n</bad_reference_description>\n\n`
        }
        if (boundSet.item_json) {
          const ijStr = typeof boundSet.item_json === 'string' ? boundSet.item_json : JSON.stringify(boundSet.item_json, null, 2)
          raw += `<item_json>\n${ijStr}\n</item_json>`
        }
        setResearcherOutput(raw.trim())
        setEditKsError('')

        // Intelligent step steering: start on the step where they need to make progress
        if (boundSet.market_memo && boundSet.good_reference_description) {
          setWizardStep(3)
        } else if (boundSet.market_memo) {
          setWizardStep(2)
        } else {
          setWizardStep(1)
        }
      }
    } else {
      setCurrentKnowledgeSetId(null)
      setEditKsName('')
      setMarketMemo('')
      setSampledListings([])
      setResearcherOutput('')
      setEditKsError('')
      setWizardStep(1)
    }
  }, [activeSearchTarget, searches, knowledgeSets])

  // Create Campaign
  const handleCreateCampaign = async (): Promise<number | null> => {
    if (!newCampaignName.trim()) return null
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCampaignName })
      })
      const data = await res.json()
      if (res.ok) {
        setNewCampaignName('')
        refreshAll()
        return data.id
      } else {
        alert(data.error || "Failed to create campaign.")
      }
    } catch {
      alert("Failed to connect to backend server.")
    }
    return null
  }

  const handleUpdateCampaignName = async (name: string) => {
    if (!currentCampaignId) return
    setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, name } : c))
    try {
      await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentCampaignId, name })
      })
    } catch (err) {
      console.error("Error updating campaign name:", err)
    }
  }



  // Trigger AI agent processing on a single specific listing
  const handleProcessSingleListing = async (listingId: string) => {
    // Optimistically add to active list
    setActiveProcessingListingIds(prev => Array.from(new Set([...prev, listingId])))
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId })
      })
      if (!res.ok && res.status !== 409) {
        alert("Failed to run AI agent for this listing.")
        setActiveProcessingListingIds(prev => prev.filter(id => id !== listingId))
      }
    } catch {
      alert("Error contacting backend AI worker.")
      setActiveProcessingListingIds(prev => prev.filter(id => id !== listingId))
    }
  }



  // Save Knowledge Set
  const handleSaveKnowledgeSet = async () => {
    if (!editKsName.trim()) {
      alert("Please enter a name for the Guidelines Profile.")
      return
    }

    let parsedJson: Record<string, unknown> = {}
    if (parsedItemJson.trim()) {
      try {
        parsedJson = JSON.parse(parsedItemJson)
      } catch (e) {
        setEditKsError(`Invalid JSON syntax in <item_json>: ${(e as Error).message}`)
        return
      }
    }

    // Verify boolean-only schema check
    const criteria = (parsedJson.extraction_criteria as { id: string; type: string }[]) || []
    for (const c of criteria) {
      if (c.type !== 'boolean') {
        setEditKsError(`Criteria types must be boolean only. Criterion '${c.id}' has type '${c.type}'. Legacy/mixed schemas are not supported in the new pipeline.`)
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
          expert_knowledge: parsedExpertKnowledge,
          item_json: parsedJson,
          market_memo: marketMemo,
          good_reference_description: parsedGoodRef,
          bad_reference_description: parsedBadRef,
          market_samples_json: JSON.stringify(sampledListings),
          source_search_url: activeSearchTarget?.url || '',
          sample_timestamp: new Date().toISOString()
        })
      })
      if (res.ok) {
        setEditKsError('')
        refreshAll()
        setView('dashboard')
      } else {
        const data = await res.json()
        setEditKsError(data.error || "Failed to save guidelines profile.")
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
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: currentCampaignId })
      })
      if (!res.ok) {
        alert("Failed to start scraper.")
        setIsScraping(false)
      }
    } catch {
      alert("Error triggering scraper process.")
      setIsScraping(false)
    }
  }

  // Trigger deep description updates for all existing listings
  const handleStartDeepUpdate = async () => {
    setIsScraping(true)
    setScrapingStatus("Spawning deep update worker...")
    setLiveLogs("Initializing browser context for deep listing harvesting...")
    setScrapingProgress({ phase: 'starting', current: 0, total: 100, status: 'Spawning deep update worker...' })
    try {
      const res = await fetch('/api/scrape/update-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: currentCampaignId })
      })
      if (!res.ok) {
        alert("Failed to start deep update.")
        setIsScraping(false)
      }
    } catch {
      alert("Error triggering deep update process.")
      setIsScraping(false)
    }
  }

  // Trigger AI Matching Process
  const handleStartProcess = async () => {
    setIsProcessing(true)
    setProcessingStatus("Launching AI Matcher checklist evaluation and deal scoring...")
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: currentCampaignId })
      })
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






  // Filter listings based on currentCampaignId
  const filteredListings = listings.filter(l => {
    const targetSearch = searches.find(s => s.id === l.search_id)
    const matchesCampaign = !currentCampaignId || (targetSearch && targetSearch.campaign_id === currentCampaignId)
    const matchesSearch = selectedSearchId === 'All' || String(l.search_id) === selectedSearchId
    const isMatched = matchesCampaign && matchesSearch

    if (selectedStatusFilter === 'High Niceness') {
      return isMatched && l.llm_processed && l.niceness_score !== null && l.niceness_score !== undefined && l.niceness_score >= 70
    }
    if (selectedStatusFilter === 'New') {
      return isMatched && l.status === 'New'
    }
    if (selectedStatusFilter === 'Evaluate with AI') {
      return isMatched && !l.llm_processed
    }
    return isMatched
  })



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

        <div className="flex items-center space-x-4">
          <button
            onClick={() => {
              if (view !== 'settings') {
                setView('settings');
              }
            }}
            title="Global Settings"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-emerald-455 transition-all border border-slate-700/50 hover:border-emerald-500/30 group shadow-md"
          >
            <GearIcon className="w-4.5 h-4.5 transition-transform duration-500 group-hover:rotate-90 text-slate-400 group-hover:text-emerald-400" />
          </button>
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
                      const campaignSearches = searches.filter(s => s.campaign_id === c.id);
                      if (campaignSearches.length === 0) {
                        navigate('edit', c.id, null);
                      } else {
                        navigate('dashboard', c.id);
                      }
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
                              const firstTarget = searches.find(s => s.campaign_id === c.id);
                              navigate('edit', c.id, firstTarget?.id || null);
                            }}
                            title="Configure Searches & Guidelines"
                            className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-all border border-slate-800"
                          >
                            <GearIcon className="w-4 h-4 transition-transform duration-500 hover:rotate-90" />
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
                    navigate('landing', null, null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 font-bold flex items-center space-x-1 bg-slate-850 hover:bg-slate-755 px-3 py-1.5 rounded-xl border border-slate-800 transition-all"
                >
                  ← Back to Campaigns
                </button>
                <span className="text-slate-750">|</span>
                <h2 className="text-base font-bold text-slate-200">{campaigns.find(c => c.id === currentCampaignId)?.name} Dashboard</h2>

                <button
                  onClick={() => {
                    const firstTarget = searches.find(s => s.campaign_id === currentCampaignId);
                    navigate('edit', currentCampaignId, firstTarget?.id || null);
                  }}
                  title="Configure Searches & Guidelines"
                  className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-400 hover:text-emerald-450 transition-all border border-slate-800"
                >
                  <GearIcon className="w-4 h-4 transition-transform duration-500 hover:rotate-90" />
                </button>
              </div>

              <div className="flex items-center space-x-3">
                {/* Crawler and AI control actions */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleStartScrape}
                    disabled={isScraping || isProcessing}
                    className="bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-emerald-400 text-xs font-bold px-3.5 py-2 rounded-xl transition-all border border-slate-800 flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <span>🔍 Fetch Fresh Listings</span>
                  </button>
                  <button
                    onClick={handleStartDeepUpdate}
                    disabled={isScraping || isProcessing}
                    className="bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-sky-400 text-xs font-bold px-3.5 py-2 rounded-xl transition-all border border-slate-800 flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <span>🔄 Update Descriptions</span>
                  </button>
                  <button
                    onClick={handleStartProcess}
                    disabled={isScraping || isProcessing}
                    className="bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-indigo-400 text-xs font-bold px-3.5 py-2 rounded-xl transition-all border border-slate-800 flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <span>🤖 Evaluate Stale & New</span>
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
                    activeProcessingListingIds={activeProcessingListingIds}
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
          <div className="flex flex-col space-y-6 w-full animate-fadeIn max-w-6xl mx-auto py-2">

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
                <div className="flex flex-col">
                  {isEditingCampaignName ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={campaigns.find(c => c.id === currentCampaignId)?.name || ''}
                        onChange={e => handleUpdateCampaignName(e.target.value)}
                        onBlur={() => setIsEditingCampaignName(false)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            setIsEditingCampaignName(false);
                          }
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-sm font-bold text-slate-200 focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                        autoFocus
                      />
                      <button
                        onClick={() => setIsEditingCampaignName(false)}
                        className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold px-2 py-1 rounded-lg transition-colors border border-emerald-500/20"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 group">
                      <h1 className="text-base font-bold text-slate-200">
                        {campaigns.find(c => c.id === currentCampaignId)?.name} Configuration
                      </h1>
                      <button
                        onClick={() => setIsEditingCampaignName(true)}
                        className="text-slate-500 hover:text-slate-350 transition-colors p-1 rounded-lg hover:bg-slate-900"
                        title="Rename Campaign"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Targets &amp; Guidelines Configuration</p>
                </div>
              </div>
            </div>

            {activeSearches.length === 0 ? (
              <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 max-w-xl mx-auto w-full shadow-2xl space-y-6 relative overflow-hidden animate-fadeIn">
                <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
                
                <div className="space-y-1.5 text-center">
                  <span className="mx-auto text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2.5 py-0.5 rounded uppercase tracking-wider w-fit block">Campaign Target Configuration</span>
                  <h2 className="text-lg font-bold text-slate-200 font-sans tracking-tight">Paste Kleinanzeigen Search URL</h2>
                  <p className="text-xs text-slate-450 leading-relaxed font-semibold">We will automatically parse the URL, suggest a search title, check listing counts, link a new Guidelines checklist, and kick off the initial scraper crawl in the background.</p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Kleinanzeigen Search URL</label>
                    <input
                      type="text"
                      value={newTargetUrl}
                      onChange={e => setNewTargetUrl(e.target.value)}
                      placeholder="Paste your Kleinanzeigen search result URL here..."
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-emerald-500 font-mono text-slate-200 transition-all shadow-inner"
                    />
                  </div>

                  {/* Reactive Indicators Panel */}
                  {newTargetUrl && (
                    <div className="bg-slate-950/60 border border-slate-855 rounded-2xl p-4 space-y-3 shadow-inner animate-fadeIn">
                      <div className="text-xs font-bold text-slate-400 border-b border-slate-900 pb-1.5 flex justify-between items-center">
                        <span>Registration Diagnostics</span>
                        {previewLoading && (
                          <div className="flex items-center space-x-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            <span className="text-[10px] text-emerald-400 font-mono">Processing...</span>
                          </div>
                        )}
                      </div>

                      {/* URL Validity indicator */}
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-[10px] font-mono w-24 text-slate-500">URL Status:</span>
                        {isValidKleinanzeigenUrl(newTargetUrl) ? (
                          <span className="text-emerald-400 font-semibold">✓ Valid Kleinanzeigen Domain</span>
                        ) : (
                          <span className="text-rose-455 font-semibold">✗ Invalid / Waiting for Kleinanzeigen URL</span>
                        )}
                      </div>

                      {/* Suggested Title */}
                      {isValidKleinanzeigenUrl(newTargetUrl) && (
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="text-[10px] font-mono w-24 text-slate-500">Suggested Name:</span>
                          <span className="text-slate-200 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            {suggestTitleFromUrl(newTargetUrl) || 'Extracting title...'}
                          </span>
                        </div>
                      )}

                      {/* Diagnostic Logs */}
                      {previewLoading && (
                        <div className="text-[11px] text-slate-450 space-y-1 font-mono pt-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>Parsing URL path segments for product tags...</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>Querying Kleinanzeigen live search count...</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>Creating linked guidelines calibration checklist...</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>Triggering headless background crawler crawl...</span>
                          </div>
                        </div>
                      )}

                      {previewCount !== null && (
                        <div className="text-xs bg-emerald-500/10 text-emerald-400 px-3.5 py-2.5 rounded-xl border border-emerald-500/10 font-bold animate-fadeIn">
                          ✓ Found {previewCount} live listings! Target registered successfully.
                        </div>
                      )}

                      {previewError && (
                        <div className="text-xs bg-rose-500/10 text-rose-455 px-3.5 py-2.5 rounded-xl border border-rose-500/10 font-bold animate-fadeIn">
                          {previewError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* DIRECT 3-STEP GUIDELINES WIZARD WORKSPACE */
              <div className="w-full animate-fadeIn">
                {activeSearchTarget && (
                  <GuidelinesWizard
                    activeSearchTarget={activeSearchTarget}
                    marketMemo={marketMemo}
                    setMarketMemo={setMarketMemo}
                    sampledListings={sampledListings}
                    sampledListingsLoading={sampledListingsLoading}
                    fetchSampleListings={fetchSampleListings}
                    researcherOutput={researcherOutput}
                    setResearcherOutput={setResearcherOutput}
                    researchPromptTemplate={researchPromptTemplate}
                    marketPromptTemplate={marketPromptTemplate}
                    profilePromptTemplate={profilePromptTemplate}
                    editKsError={editKsError}
                    wizardStep={wizardStep}
                    setWizardStep={setWizardStep}
                    handleSaveKnowledgeSet={handleSaveKnowledgeSet}
                    parsedExpertKnowledge={parsedExpertKnowledge}
                    parsedGoodRef={parsedGoodRef}
                    parsedBadRef={parsedBadRef}
                    parsedDemoMsg={parsedDemoMsg}
                    parsedItemJson={parsedItemJson}
                    isScraping={isScraping}
                    scrapingStatus={scrapingStatus}
                    scrapingProgress={scrapingProgress}
                  />
                )}
              </div>
            )}
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
                        const newId = await handleCreateCampaign();
                        if (newId) {
                          navigate('edit', newId, null);
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setView('landing')}
                  className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-455 hover:text-slate-200 text-xs font-bold py-3 rounded-xl transition-all active:scale-98"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!newCampaignName.trim()) return;
                    const newId = await handleCreateCampaign();
                    if (newId) {
                      navigate('edit', newId, null);
                    }
                  }}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold py-3 rounded-xl transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-98"
                >
                  Create & Launch &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'settings' && (
          <SettingsView onBack={() => setView(previousView)} />
        )}
      </main>
    </div>
  )
}
