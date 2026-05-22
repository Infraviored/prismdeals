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
import { useTranslation } from './hooks/useTranslation'
import { Button } from './components/ui/Button'
import { Input } from './components/ui/Input'
import { Card } from './components/ui/Card'


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

  const { t, lang, toggleLanguage } = useTranslation()

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
                {sessionEmail ? t('common.sessionActive', { email: sessionEmail }) : t('common.sessionUnauth')}
              </span>
            </div>

            {!sessionEmail ? (
              <Button
                variant="mini-emerald"
                size="xs"
                onClick={handleTriggerLogin}
                disabled={isScraping || isProcessing}
              >
                {t('common.login')}
              </Button>
            ) : (
              <Button
                variant="mini-slate"
                size="xs"
                onClick={handleTriggerLogin}
                disabled={isScraping || isProcessing}
              >
                {t('common.reauth')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="badge"
            size="sm"
            onClick={toggleLanguage}
            className="px-2.5 py-1.5 text-[10px]"
          >
            {lang.toUpperCase()}
          </Button>

          <Button
            variant="icon"
            onClick={() => {
              if (view !== 'settings') {
                setView('settings');
              }
            }}
            title={t('common.globalSettings')}
            className="p-2"
          >
            <GearIcon className="w-4.5 h-4.5 transition-transform duration-500 group-hover:rotate-90 text-slate-400 group-hover:text-emerald-400" />
          </Button>
        </div>

      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col justify-start">
        {/* VIEW 1: LANDING VIEW - CAMPAIGN HUB GRID */}
        {view === 'landing' && (
          <div className="space-y-6 animate-fadeIn w-full">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800/80 w-full mb-6">
              <div>
                <h1 className="text-xl font-bold text-slate-200">{t('landing.title')}</h1>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t('landing.subtitle')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  <Card
                    interactive
                    key={c.id}
                    onClick={() => {
                      const campaignSearches = searches.filter(s => s.campaign_id === c.id);
                      if (campaignSearches.length === 0) {
                        navigate('edit', c.id, null);
                      } else {
                        navigate('dashboard', c.id);
                      }
                    }}
                    className="p-4 justify-between space-y-4"
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
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest font-mono">{t('landing.noListings')}</span>
                      </div>
                    )}

                    <div className="flex-1 flex flex-col justify-between pt-1">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-200 group-hover:text-emerald-400 transition-colors tracking-tight line-clamp-1">{c.name}</h3>
                            <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">{t('landing.profileType')}</p>
                          </div>

                          <Button
                            variant="icon"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              const firstTarget = searches.find(s => s.campaign_id === c.id);
                              navigate('edit', c.id, firstTarget?.id || null);
                            }}
                            title={t('landing.configureTooltip')}
                            className="p-1.5"
                          >
                            <GearIcon className="w-4 h-4 transition-transform duration-500 hover:rotate-90" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[9px] font-semibold">
                          <span className="bg-slate-950/60 text-slate-400 border border-slate-855 px-2 py-0.5 rounded-md">
                            {campaignSearches.length} {t('landing.targets')}
                          </span>
                          <span className="bg-slate-950/60 text-emerald-400 border border-emerald-500/10 px-2 py-0.5 rounded-md font-bold">
                            {campaignListings.length} {t('landing.matches')}
                          </span>
                          {unprocessedCount > 0 && (
                            <span className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-md font-extrabold animate-pulse">
                              {unprocessedCount} {t('landing.new')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-855 mt-4 pt-3 flex justify-between items-center text-[11px] text-slate-450 font-bold">
                        <span className="group-hover:text-emerald-400 transition-colors flex items-center space-x-1">
                          <span>{t('landing.openDashboard')}</span>
                          <span className="transform group-hover:translate-x-1 transition-transform">&rarr;</span>
                        </span>
                      </div>
                    </div>
                  </Card>
                )
              })}

              {/* "+" Add Hunt Campaign Card */}
              <Card
                interactive
                onClick={() => setView('create-campaign')}
                className="bg-slate-900/20 border-dashed border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/[0.02] p-6 items-center justify-center space-y-4 h-full min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all shadow-inner">
                  +
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold text-slate-300 group-hover:text-emerald-400 transition-colors">{t('landing.createCampaign')}</h3>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">{t('landing.createSubtitle')}</p>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* VIEW 2: CAMPAIGN DASHBOARD - FEED LISTINGS VIEW */}
        {view === 'dashboard' && (
          <div className="flex flex-col space-y-6 animate-fadeIn w-full">

            {/* Campaign Breadcrumb Headers & Filters */}
            <Card className="flex-row flex-wrap gap-4 items-center justify-between p-5">
              <div className="flex items-center space-x-3">
                <Button
                  variant="badge"
                  size="sm"
                  onClick={() => {
                    navigate('landing', null, null);
                  }}
                >
                  <span className="mr-1">←</span>
                  <span>{t('common.backToCampaigns')}</span>
                </Button>
                <span className="text-slate-750">|</span>
                <h2 className="text-base font-bold text-slate-200">
                  {campaigns.find(c => c.id === currentCampaignId)?.name} {lang === 'en' ? 'Dashboard' : 'Dashboard'}
                </h2>

                <Button
                  variant="icon"
                  size="xs"
                  onClick={() => {
                    const firstTarget = searches.find(s => s.campaign_id === currentCampaignId);
                    navigate('edit', currentCampaignId, firstTarget?.id || null);
                  }}
                  title={t('landing.configureTooltip')}
                  className="p-1.5"
                >
                  <GearIcon className="w-4 h-4 transition-transform duration-500 hover:rotate-90" />
                </Button>
              </div>

              <div className="flex items-center space-x-3">
                {/* Crawler and AI control actions */}
                <div className="flex items-center space-x-2">
                  <Button
                    variant="action-emerald"
                    size="sm"
                    onClick={handleStartScrape}
                    disabled={isScraping || isProcessing}
                  >
                    <span>🔍 {t('dashboard.fetchFresh')}</span>
                  </Button>
                  <Button
                    variant="action-sky"
                    size="sm"
                    onClick={handleStartDeepUpdate}
                    disabled={isScraping || isProcessing}
                  >
                    <span>🔄 {t('dashboard.updateDesc')}</span>
                  </Button>
                  <Button
                    variant="action-indigo"
                    size="sm"
                    onClick={handleStartProcess}
                    disabled={isScraping || isProcessing}
                  >
                    <span>🤖 {t('dashboard.autoAi')}</span>
                  </Button>
                </div>

                {/* Target search filter */}
                <select
                  value={selectedSearchId}
                  onChange={e => setSelectedSearchId(e.target.value)}
                  className="bg-slate-950 text-xs font-semibold text-slate-300 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">{t('dashboard.filterAllSearches')}</option>
                  {searches.filter(s => s.campaign_id === currentCampaignId).map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>

                <select
                  value={selectedStatusFilter}
                  onChange={e => setSelectedStatusFilter(e.target.value as typeof selectedStatusFilter)}
                  className="bg-slate-950 text-xs font-semibold text-slate-300 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">{t('dashboard.statusAll')}</option>
                  <option value="High Niceness">{t('dashboard.statusMatches')} (70+)</option>
                  <option value="Evaluate with AI">{t('dashboard.statusPending')}</option>
                  <option value="New">{t('dashboard.statusEvaluated')}</option>
                </select>
              </div>
            </Card>

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
                <Button
                  variant="badge"
                  size="sm"
                  onClick={() => setView('dashboard')}
                >
                  <span>← {t('common.backToDashboard')}</span>
                </Button>
                <div className="w-[1px] h-5 bg-slate-800" />
                <div className="flex flex-col">
                  {isEditingCampaignName ? (
                    <div className="flex items-center space-x-2">
                      <Input
                        type="text"
                        value={campaigns.find(c => c.id === currentCampaignId)?.name || ''}
                        onChange={e => handleUpdateCampaignName(e.target.value)}
                        onBlur={() => setIsEditingCampaignName(false)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            setIsEditingCampaignName(false);
                          }
                        }}
                        className="py-1 text-sm rounded-lg"
                        autoFocus
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => setIsEditingCampaignName(false)}
                      >
                        {t('common.done')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 group">
                      <h1 className="text-base font-bold text-slate-200">
                        {campaigns.find(c => c.id === currentCampaignId)?.name} {t('common.settings')}
                      </h1>
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={() => setIsEditingCampaignName(true)}
                        title={t('common.renameCampaign')}
                        className="p-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </Button>
                    </div>
                  )}
                  <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">{t('common.targetsAndGuidelines')}</p>
                </div>
              </div>
            </div>

            {activeSearches.length === 0 ? (
              <Card className="p-8 max-w-xl mx-auto w-full relative overflow-hidden animate-fadeIn">
                <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
                
                <div className="space-y-1.5 text-center">
                  <span className="mx-auto text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2.5 py-0.5 rounded uppercase tracking-wider w-fit block">{t('common.campaignTargetConfig')}</span>
                  <h2 className="text-lg font-bold text-slate-200 font-sans tracking-tight">{t('common.pasteSearchUrl')}</h2>
                  <p className="text-xs text-slate-450 leading-relaxed font-semibold">{t('wizard.targetsDescription')}</p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">{t('common.pasteSearchUrl')}</label>
                    <Input
                      type="text"
                      value={newTargetUrl}
                      onChange={e => setNewTargetUrl(e.target.value)}
                      placeholder={t('common.searchUrlPlaceholder')}
                      className="font-mono"
                    />
                  </div>

                  {/* Reactive Indicators Panel */}
                  {newTargetUrl && (
                    <div className="bg-slate-950/60 border border-slate-855 rounded-2xl p-4 space-y-3 shadow-inner animate-fadeIn">
                      <div className="text-xs font-bold text-slate-400 border-b border-slate-900 pb-1.5 flex justify-between items-center">
                        <span>{t('common.diagnostics')}</span>
                        {previewLoading && (
                          <div className="flex items-center space-x-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            <span className="text-[10px] text-emerald-400 font-mono">{t('common.processing')}</span>
                          </div>
                        )}
                      </div>

                      {/* URL Validity indicator */}
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-[10px] font-mono w-24 text-slate-500">{t('common.urlStatus')}</span>
                        {isValidKleinanzeigenUrl(newTargetUrl) ? (
                          <span className="text-emerald-400 font-semibold">{t('common.validUrl')}</span>
                        ) : (
                          <span className="text-rose-455 font-semibold">{t('common.invalidUrl')}</span>
                        )}
                      </div>

                      {/* Suggested Title */}
                      {isValidKleinanzeigenUrl(newTargetUrl) && (
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="text-[10px] font-mono w-24 text-slate-500">{t('common.suggestedName')}</span>
                          <span className="text-slate-200 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            {suggestTitleFromUrl(newTargetUrl) || t('common.extractingTitle')}
                          </span>
                        </div>
                      )}

                      {/* Diagnostic Logs */}
                      {previewLoading && (
                        <div className="text-[11px] text-slate-450 space-y-1 font-mono pt-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>{t('common.diagnosticLog1')}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>{t('common.diagnosticLog2')}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>{t('common.diagnosticLog3')}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400">&gt;</span>
                            <span>{t('common.diagnosticLog4')}</span>
                          </div>
                        </div>
                      )}

                      {previewCount !== null && (
                        <div className="text-xs bg-emerald-500/10 text-emerald-400 px-3.5 py-2.5 rounded-xl border border-emerald-500/10 font-bold animate-fadeIn">
                          {t('common.foundCount', { count: previewCount })}
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
              </Card>
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
            <Card className="p-8 w-full relative overflow-hidden">
              {/* Abstract decorative glowing orb */}
              <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
              <div className="absolute -left-16 -bottom-16 w-36 h-36 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="badge"
                    size="xs"
                    onClick={() => setView('landing')}
                  >
                    <span>&larr; {t('common.back')}</span>
                  </Button>
                </div>
                <h2 className="text-xl font-extrabold text-slate-200 font-sans tracking-tight">{t('wizard.createCampaignTitle')}</h2>
                <p className="text-xs text-slate-450 leading-relaxed font-medium">{t('wizard.createCampaignDesc')}</p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">{t('wizard.campaignNameLabel')}</label>
                  <Input
                    type="text"
                    value={newCampaignName}
                    onChange={e => setNewCampaignName(e.target.value)}
                    placeholder={t('wizard.campaignNamePlaceholder')}
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
                <Button
                  variant="secondary"
                  onClick={() => setView('landing')}
                  className="flex-1 py-3"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={async () => {
                    if (!newCampaignName.trim()) return;
                    const newId = await handleCreateCampaign();
                    if (newId) {
                      navigate('edit', newId, null);
                    }
                  }}
                  className="flex-1 py-3"
                >
                  {t('common.save')} &rarr;
                </Button>
              </div>
            </Card>
          </div>
        )}

        {view === 'settings' && (
          <SettingsView onBack={() => setView(previousView)} />
        )}
      </main>
    </div>
  )
}
