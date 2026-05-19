import { useState, useEffect } from 'react'

interface Criterion {
  id: string
  description: string
  type: string
}

interface ScoringRule {
  criterion_id: string
  value: boolean
  weight: number
  is_dealbreaker: boolean
  description: string
}

interface Profile {
  id: number
  domain: string
  extraction_criteria: Criterion[]
  scoring_model: {
    rules: ScoringRule[]
  }
  outreach_strategy: {
    tone: string
    opening_hook: string
    questions: Array<{
      target_criterion: string
      question_text: string
    }>
  }
}

interface Listing {
  id: string
  title: string
  price: string
  location: string
  url: string
  short_description: string
  detailed_description: string
  llm_processed: boolean
  full_info_obtained: boolean
  extracted_facts: Record<string, boolean | string>
  niceness_score: number
  status: string
  profile_id: number | null
  profile_domain?: string
}

interface SearchTarget {
  id?: number
  url: string
  name: string
  enabled: boolean
  profile_id: number | null
}

function App() {
  const [listings, setListings] = useState<Listing[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [searches, setSearches] = useState<SearchTarget[]>([])
  const [activeTab, setActiveTab] = useState<'prompts' | 'matcher' | 'inbox' | 'profiles' | 'searches'>('matcher')
  
  // Selection States
  const [activeListingId, setActiveListingId] = useState<string | null>(null)
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('All')
  
  // Custom States
  const [isScraping, setIsScraping] = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null)
  const [profileJsonInput, setProfileJsonInput] = useState('')
  const [profileIngestError, setProfileIngestError] = useState<string | null>(null)
  
  // Pre-computed drafts cache
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [draftsLoading, setDraftsLoading] = useState<Record<string, boolean>>({})

  // Copy success indicator
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null)

  useEffect(() => {
    refreshAll()
  }, [])

  const refreshAll = () => {
    Promise.all([
      fetch('/api/listings').then(res => res.json()),
      fetch('/api/profiles').then(res => res.json()),
      fetch('/api/search-urls').then(res => res.json())
    ]).then(([listingsData, profilesData, searchesData]) => {
      setListings(listingsData)
      setProfiles(profilesData)
      setSearches(searchesData)
      
      // Auto-select first elements if null
      if (listingsData.length > 0 && !activeListingId) {
        setActiveListingId(listingsData[0].id)
      }
      if (profilesData.length > 0 && !activeProfileId) {
        setActiveProfileId(profilesData[0].id)
      }
    }).catch(err => {
      console.error("Error refreshing dashboard state:", err)
    })
  }

  // Pre-compute draft for a specific listing if not loaded yet
  const ensureDraftLoaded = (listingId: string) => {
    if (drafts[listingId] || draftsLoading[listingId]) return

    setDraftsLoading(prev => ({ ...prev, [listingId]: true }))
    fetch('/api/listings/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId })
    })
      .then(res => res.json())
      .then(data => {
        setDrafts(prev => ({ ...prev, [listingId]: data.draft || 'No outreach generated.' }))
        setDraftsLoading(prev => ({ ...prev, [listingId]: false }))
      })
      .catch(err => {
        console.error("Draft generation error:", err)
        setDrafts(prev => ({ ...prev, [listingId]: 'Failed to generate outreach message.' }))
        setDraftsLoading(prev => ({ ...prev, [listingId]: false }))
      })
  }

  const triggerCrawl = () => {
    setIsScraping(true)
    setScrapeStatus("Launching search crawl and Worker AI classification pipeline...")
    
    fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setScrapeStatus("Crawler finished! Recalculating and importing listings...")
          setTimeout(() => {
            setScrapeStatus(null)
            setIsScraping(false)
            refreshAll()
          }, 3000)
        } else {
          setScrapeStatus("Crawler failed to execute.")
          setIsScraping(false)
        }
      })
      .catch(() => {
        setScrapeStatus("Network error running crawling agent.")
        setIsScraping(false)
      })
  }

  const handleIngestProfile = () => {
    setProfileIngestError(null)
    try {
      const parsed = JSON.parse(profileJsonInput)
      fetch('/api/profiles/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setProfileIngestError(data.error)
          } else {
            setProfileJsonInput('')
            alert("Profile successfully ingested!")
            refreshAll()
          }
        })
        .catch(() => setProfileIngestError("Failed to connect to ingestion service."))
    } catch (e: any) {
      setProfileIngestError(`Invalid JSON format: ${e.message}`)
    }
  }

  const handleSliderChange = (profileId: number, ruleIdx: number, val: number) => {
    const updatedProfiles = [...profiles]
    const p = updatedProfiles.find(p => p.id === profileId)
    if (!p) return

    p.scoring_model.rules[ruleIdx].weight = val
    setProfiles(updatedProfiles)
  }

  const saveSliderWeights = (profile: Profile) => {
    fetch('/api/profiles/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: profile.id,
        scoring_model: profile.scoring_model
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert(`Weights updated! Listing scores recalculated.`)
          refreshAll()
        }
      })
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPromptId(id)
    setTimeout(() => setCopiedPromptId(null), 2500)
  }

  const handleSaveSearches = () => {
    fetch('/api/search-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searches)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert("Search targets saved successfully!")
          refreshAll()
        }
      })
  }

  const activeProfile = profiles.find(p => p.id === activeProfileId)
  const activeListing = listings.find(l => l.id === activeListingId)

  // Ensure active listing draft is pre-computed when view shifts to Deal Matcher or details panel
  if (activeListingId) {
    ensureDraftLoaded(activeListingId)
  }

  // Filter listings
  const filteredListings = listings.filter(l => {
    if (selectedStatusFilter === 'All') return true
    if (selectedStatusFilter === 'Dealbreaker') return l.status === 'Dealbreaker' || l.niceness_score <= -999
    return l.status === selectedStatusFilter
  })

  // Grouped search list rendering helpers
  const handleSearchRowChange = (index: number, key: keyof SearchTarget, val: any) => {
    const updated = [...searches]
    updated[index] = { ...updated[index], [key]: val }
    setSearches(updated)
  }

  const addSearchRow = () => {
    setSearches([...searches, { url: '', name: 'New Motorbike/Notebook Model', enabled: true, profile_id: null }])
  }

  const removeSearchRow = (index: number) => {
    setSearches(searches.filter((_, idx) => idx !== index))
  }

  // PROMPTS PRESETS
  const PROMPT_RESEARCHER = `You are an Elite Market Researcher and Domain Expert specialized in peer-to-peer secondary market dynamics. Your objective is to compile a highly actionable, specialized expert profile for buying a specific product category.

The product category is: [INSERT CHOSEN PRODUCT HERE, e.g. Sports Motorbikes, or RTX Series GPUs]

Your task is to analyze typical model-specific issues, modifications, typical usage risks, and premium upgrades that add value. Then, synthesize this knowledge into a single, highly structured JSON configuration matching the schema below.

### Output JSON Schema:
{
  "product_domain": "A concise, clean name for this product category (e.g., 'Sports Motorbikes')",
  "extraction_criteria": [
    {
      "id": "valve_clearance_checked",
      "description": "Output true if valve clearance check is documented/done, false if overdue/not done, or 'unknown'.",
      "type": "boolean"
    },
    {
      "id": "track_use",
      "description": "Output true if motorcycle was raced or used on a track, false if street only, or 'unknown'.",
      "type": "boolean"
    }
  ],
  "scoring_model": {
    "rules": [
      {
        "criterion_id": "valve_clearance_checked",
        "value": true,
        "weight": 30,
        "is_dealbreaker": false,
        "description": "Valve clearance history verified"
      },
      {
        "criterion_id": "track_use",
        "value": true,
        "weight": -9999,
        "is_dealbreaker": true,
        "description": "Hard dealbreaker: raced on track"
      }
    ]
  },
  "outreach_strategy": {
    "tone": "casual, polite, informed",
    "opening_hook": "Hi, I'm very interested in your listing! Looks like a great bike.",
    "questions": [
      {
        "target_criterion": "valve_clearance_checked",
        "question_text": "Weißt du, ob beim Ventilspiel schon mal was gemacht oder kontrolliert wurde?"
      }
    ]
  }
}

Provide only the valid, copyable JSON block. Do not include any conversational preamble.`

  const PROMPT_CHEAT_SHEET = `You are an Elite P2P Negotiations Coach. I am looking to buy one of the following specific models:
- Honda CBR1000RR SC57
- Yamaha R1 RN12 / RN19
- Kawasaki ZX-10R
- Suzuki GSX-R1000 K5/K6

For these models, generate a compact markdown cheat sheet detailing:
1. "Worauf du achten willst" (Key items to check)
2. "Die Fragen, weich formuliert" (Polite, conversational questions to ask the vendor)
3. A highly tailored "Demo message" template that demonstrates deep model-specific expertise while remaining humble and friendly.

Structure the output with one clean section per model, prioritizing invitations for the seller to talk openly rather than sounding like a cold interrogator.`

  return (
    <div className="min-h-screen bg-[#070913] bg-radial-[circle_at_top_right] from-[#131b3e] to-[#070913] text-slate-100 antialiased selection:bg-cyan-500 selection:text-slate-900 font-sans pb-12">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <svg className="h-6 w-6 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white font-heading bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                KLEINANZEIGEN AGENT
              </h1>
              <p className="text-[11px] text-cyan-400/80 font-mono tracking-widest uppercase">Multi-Domain Hunter</p>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="flex bg-slate-900/60 p-1.5 rounded-xl border border-white/10 backdrop-blur-sm">
            {(['matcher', 'inbox', 'profiles', 'searches', 'prompts'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg font-heading transition-all duration-300 ${
                  activeTab === tab
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab === 'matcher' && 'Deal Matcher'}
                {tab === 'inbox' && 'Inbox & Feed'}
                {tab === 'profiles' && 'Agent Profiles'}
                {tab === 'searches' && 'Search Targets'}
                {tab === 'prompts' && 'Prompts Hub'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Crawling Progress Notification */}
      {scrapeStatus && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="relative overflow-hidden rounded-xl bg-cyan-950/40 border border-cyan-500/30 p-4 flex items-center gap-3 backdrop-blur-sm animate-pulse">
            <div className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            <p className="text-sm font-mono text-cyan-300">{scrapeStatus}</p>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 mt-6">
        
        {/* ==================== 1. DEAL MATCHER TAB ==================== */}
        {activeTab === 'matcher' && (
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-2xl bg-slate-900/40 border border-white/10 p-6 backdrop-blur-md">
              <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-cyan-500/5 blur-3xl" />
              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white font-heading">High-Relevance Deals</h2>
                  <p className="text-slate-400 text-sm mt-1">Pre-computed target outreach templates for items crossing the Niceness Score threshold.</p>
                </div>
                <button
                  onClick={triggerCrawl}
                  disabled={isScraping}
                  className="px-5 py-2.5 rounded-xl font-heading text-sm font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/10 flex items-center gap-2"
                >
                  <svg className={`h-4 w-4 ${isScraping ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" />
                  </svg>
                  {isScraping ? 'Crawling...' : 'Run Scraper Crawler'}
                </button>
              </div>

              {/* Feed Grid */}
              <div className="grid grid-cols-1 gap-6 mt-8">
                {listings.filter(l => l.status !== 'Dealbreaker' && l.niceness_score > 0).length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-xl bg-slate-900/20">
                    <p className="text-slate-400 font-medium">No high-relevance deals found yet.</p>
                    <p className="text-slate-500 text-xs mt-1">Adjust sliders, map search profiles, or hit run to scrape targets.</p>
                  </div>
                ) : (
                  listings
                    .filter(l => l.status !== 'Dealbreaker' && l.niceness_score > 0)
                    .map(listing => {
                      // Fetch listing draft text
                      ensureDraftLoaded(listing.id)
                      const scoreLevel = listing.niceness_score >= 70 ? 'excellent' : 'neutral'

                      return (
                        <div key={listing.id} className="group relative overflow-hidden rounded-xl bg-slate-950/60 border border-white/10 hover:border-cyan-500/30 p-5 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/5">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            
                            {/* Card Main Info */}
                            <div className="flex items-start gap-4">
                              <div className={`h-14 w-14 rounded-xl flex flex-col items-center justify-center border font-mono ${
                                scoreLevel === 'excellent' 
                                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400 shadow-md shadow-emerald-500/5'
                                  : 'bg-slate-900 border-white/10 text-cyan-400'
                              }`}>
                                <span className="text-[10px] text-slate-500 font-sans leading-none">Niceness</span>
                                <span className="text-lg font-bold leading-none mt-1">{listing.niceness_score}</span>
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-white font-heading group-hover:text-cyan-300 transition-colors">{listing.title}</h3>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                                  <span className="text-cyan-400 font-medium">{listing.profile_domain || 'Unassigned Category'}</span>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-rose-400 font-bold font-mono">{listing.price}</span>
                                  <span className="text-slate-600">•</span>
                                  <span>{listing.location}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions bar */}
                            <div className="flex items-center gap-3">
                              <a
                                href={listing.url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
                              >
                                Contact Seller
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                              <button
                                onClick={() => {
                                  setActiveListingId(listing.id)
                                  setActiveTab('inbox')
                                }}
                                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 hover:border-cyan-500/40 transition-all"
                              >
                                View Context Detail
                              </button>
                            </div>

                          </div>

                          {/* Precomputed message display */}
                          <div className="mt-4 rounded-lg bg-slate-950/70 border border-white/5 p-4 relative">
                            <span className="absolute top-2 right-2 text-[10px] font-mono text-slate-600 uppercase tracking-widest">Target Message</span>
                            {draftsLoading[listing.id] ? (
                              <div className="flex items-center gap-2 py-4">
                                <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-slate-500 font-mono">Worker AI drafting custom outreach...</span>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-slate-300 text-sm whitespace-pre-wrap font-sans bg-transparent border-0 p-0 m-0 w-full resize-none focus:ring-0 leading-relaxed">
                                  {drafts[listing.id]}
                                </p>
                                <div className="flex justify-end pt-2 border-t border-white/5">
                                  <button
                                    onClick={() => copyToClipboard(drafts[listing.id] || '', `deal-${listing.id}`)}
                                    className="px-3 py-1.5 text-xs font-semibold rounded bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all flex items-center gap-1"
                                  >
                                    {copiedPromptId === `deal-${listing.id}` ? (
                                      <>
                                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        Copied!
                                      </>
                                    ) : (
                                      <>
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                        </svg>
                                        Copy Message
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                        </div>
                      )
                    })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. INBOX & FEED TAB ==================== */}
        {activeTab === 'inbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Sidebar Feed */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-xl bg-slate-900/40 border border-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">Inbox & Feed</h3>
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-lg text-xs py-1 px-2.5 text-slate-300 outline-none focus:border-cyan-500 transition-all"
                  >
                    <option value="All">Filter: All</option>
                    <option value="New">Status: New</option>
                    <option value="Dealbreaker">Status: Dealbreakers</option>
                    <option value="Contacted">Status: Contacted</option>
                    <option value="Negotiating">Status: Negotiating</option>
                  </select>
                </div>

                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {filteredListings.length === 0 ? (
                    <p className="text-center py-8 text-xs text-slate-500">No matching listings found.</p>
                  ) : (
                    filteredListings.map(l => {
                      const isDealbreaker = l.status === 'Dealbreaker' || l.niceness_score <= -999
                      const isActive = l.id === activeListingId
                      
                      let scoreClass = 'neutral'
                      if (isDealbreaker) scoreClass = 'dealbreaker'
                      else if (l.niceness_score >= 70) scoreClass = 'excellent'

                      return (
                        <div
                          key={l.id}
                          onClick={() => setActiveListingId(l.id)}
                          className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-300 ${
                            isActive
                              ? 'bg-cyan-500/10 border-cyan-500/40 shadow-md shadow-cyan-500/5'
                              : 'bg-slate-950/40 border-white/5 hover:bg-slate-950/80 hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              scoreClass === 'excellent' ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' :
                              scoreClass === 'dealbreaker' ? 'bg-rose-950/20 border-rose-500/30 text-rose-400' :
                              'bg-slate-900 border-white/10 text-slate-400'
                            }`}>
                              Score: {isDealbreaker ? '❌' : l.niceness_score}
                            </span>
                            <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase">{l.status}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-200 mt-2 truncate font-heading">{l.title}</h4>
                          <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-slate-400">
                            <span className="text-cyan-400 font-semibold">{l.price}</span>
                            <span>{l.location}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Content Details Split Pane */}
            <div className="lg:col-span-8">
              {activeListing ? (
                <div className="space-y-6">
                  {/* Detailed Panel */}
                  <div className="rounded-xl bg-slate-900/40 border border-white/10 p-6 backdrop-blur-md">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
                      <div>
                        <h2 className="text-xl font-bold text-white font-heading">{activeListing.title}</h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-400">
                          <span className="text-cyan-400 font-semibold">{activeListing.price}</span>
                          <span>•</span>
                          <span>{activeListing.location}</span>
                          <span>•</span>
                          <span className="text-slate-500">ID: {activeListing.id}</span>
                        </div>
                      </div>
                      <a
                        href={activeListing.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:opacity-90 active:scale-95 shadow-md shadow-cyan-500/10 flex items-center gap-1.5"
                      >
                        Contact Vendor on Kleinanzeigen
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>

                    {/* Extracted Facts Map */}
                    <div className="mt-6">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider font-heading mb-3">Extracted Profile Metadata</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(activeListing.extracted_facts).map(([key, val]) => (
                          <div key={key} className="p-3 rounded-lg bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                            <span className="text-[11px] font-mono text-slate-400 truncate">{key.replace(/_/g, ' ')}</span>
                            <div className="flex items-center gap-2 mt-1.5">
                              {val === true && (
                                <>
                                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                  <span className="text-xs font-semibold text-emerald-400">TRUE</span>
                                </>
                              )}
                              {val === false && (
                                <>
                                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                                  <span className="text-xs font-semibold text-rose-400">FALSE</span>
                                </>
                              )}
                              {val !== true && val !== false && (
                                <>
                                  <span className="h-2 w-2 rounded-full bg-slate-600" />
                                  <span className="text-xs font-semibold text-slate-400">{String(val).toUpperCase()}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic AI Outreach Box */}
                    <div className="mt-6 border-t border-white/10 pt-6">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-heading">AI Outreach Copy Draft</h3>
                        <button
                          onClick={() => copyToClipboard(drafts[activeListing.id] || '', `details-${activeListing.id}`)}
                          className="px-3 py-1.5 text-xs font-semibold rounded bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all flex items-center gap-1"
                        >
                          {copiedPromptId === `details-${activeListing.id}` ? 'Copied!' : 'Copy to Clipboard'}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={drafts[activeListing.id] || 'Drafting...'}
                        className="w-full h-40 bg-slate-950/80 border border-white/10 rounded-xl p-4 text-slate-300 font-sans text-sm outline-none resize-none focus:border-cyan-500 transition-all"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-xl bg-slate-900/20">
                  <p className="text-slate-400 font-medium">Select a listing card to view details.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 3. AGENT PROFILES TAB ==================== */}
        {activeTab === 'profiles' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Ingest side */}
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-xl bg-slate-900/40 border border-white/10 p-6 backdrop-blur-md">
                <h2 className="text-xl font-bold text-white font-heading mb-2">Ingest Category Profile</h2>
                <p className="text-slate-400 text-xs mb-4">Paste the JSON configuration derived from your external Researcher AI prompt.</p>
                
                <textarea
                  value={profileJsonInput}
                  onChange={(e) => setProfileJsonInput(e.target.value)}
                  placeholder='{\n  "product_domain": "Sports Motorbikes",\n  "extraction_criteria": [...],\n  "scoring_model": [...]\n}'
                  className="w-full h-80 bg-slate-950 border border-white/10 rounded-xl p-4 text-xs font-mono text-slate-300 outline-none focus:border-cyan-500 transition-all resize-none"
                />

                {profileIngestError && (
                  <div className="mt-3 p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs text-rose-400 font-mono">
                    {profileIngestError}
                  </div>
                )}

                <button
                  onClick={handleIngestProfile}
                  className="w-full mt-4 py-2.5 rounded-xl font-heading text-sm font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:opacity-90 transition-all shadow-md shadow-cyan-500/10"
                >
                  Import Profile
                </button>
              </div>
            </div>

            {/* List & Weights Adjust side */}
            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-xl bg-slate-900/40 border border-white/10 p-6 backdrop-blur-md">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="text-xl font-bold text-white font-heading">Interactive Scoring Sliders</h2>
                  <select
                    value={activeProfileId || ''}
                    onChange={(e) => setActiveProfileId(Number(e.target.value))}
                    className="bg-slate-950 border border-white/10 rounded-lg text-xs py-1.5 px-3 text-slate-300 outline-none focus:border-cyan-500 transition-all"
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.domain}</option>
                    ))}
                  </select>
                </div>

                {activeProfile ? (
                  <div className="space-y-6">
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                      {activeProfile.scoring_model.rules.map((rule, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-slate-950/60 border border-white/5">
                          <div className="flex justify-between items-center gap-2">
                            <div>
                              <span className="text-xs font-mono text-cyan-400">{rule.criterion_id}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ml-2 ${
                                rule.value ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
                              }`}>
                                Value: {String(rule.value).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-300">
                              Weight: {rule.weight}
                            </span>
                          </div>
                          
                          <p className="text-slate-500 text-[11px] mt-1">{rule.description}</p>
                          
                          <div className="flex items-center gap-4 mt-3">
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              value={rule.weight}
                              onChange={(e) => handleSliderChange(activeProfile.id, idx, Number(e.target.value))}
                              className="flex-1 accent-cyan-400 cursor-pointer"
                            />
                            <div className="flex items-center gap-2 text-xs">
                              <label className="flex items-center gap-1.5 text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={rule.is_dealbreaker}
                                  onChange={(e) => {
                                    const updated = [...profiles]
                                    const p = updated.find(x => x.id === activeProfile.id)
                                    if (p) {
                                      p.scoring_model.rules[idx].is_dealbreaker = e.target.checked
                                      if (e.target.checked) p.scoring_model.rules[idx].weight = -9999
                                      setProfiles(updated)
                                    }
                                  }}
                                  className="rounded border-white/10 bg-slate-950 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                                />
                                Dealbreaker
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => saveSliderWeights(activeProfile)}
                      className="w-full py-2.5 rounded-xl font-heading text-sm font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all shadow-md shadow-cyan-500/10"
                    >
                      Save Sliders & Recalculate Scores
                    </button>
                  </div>
                ) : (
                  <p className="text-center py-8 text-slate-500">No profile configurations loaded.</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ==================== 4. SEARCH TARGETS TAB ==================== */}
        {activeTab === 'searches' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-slate-900/40 border border-white/10 p-6 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white font-heading">Search Target Mappings</h2>
                  <p className="text-slate-400 text-xs mt-1">Specify target Kleinanzeigen queries and connect them to active expert profiles for generalized analysis.</p>
                </div>
                <button
                  onClick={addSearchRow}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 border border-white/10 text-cyan-400 hover:text-white hover:border-cyan-500/30 transition-all flex items-center gap-1.5"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Search Row
                </button>
              </div>

              <div className="space-y-3">
                {searches.length === 0 ? (
                  <p className="text-center py-6 text-slate-500 text-xs">No search urls configured. Add rows below.</p>
                ) : (
                  searches.map((search, idx) => (
                    <div key={idx} className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 p-4 rounded-xl bg-slate-950/60 border border-white/5">
                      
                      {/* Name input */}
                      <input
                        type="text"
                        value={search.name}
                        onChange={(e) => handleSearchRowChange(idx, 'name', e.target.value)}
                        placeholder="Search Label (e.g. CBR1000RR SC57 rep)"
                        className="bg-slate-950 border border-white/10 rounded-lg text-xs py-2 px-3 text-slate-200 outline-none focus:border-cyan-500 transition-all font-heading lg:w-64"
                      />

                      {/* URL input */}
                      <input
                        type="text"
                        value={search.url}
                        onChange={(e) => handleSearchRowChange(idx, 'url', e.target.value)}
                        placeholder="Kleinanzeigen listing page URL..."
                        className="flex-1 bg-slate-950 border border-white/10 rounded-lg text-xs py-2 px-3 text-slate-200 outline-none focus:border-cyan-500 transition-all font-mono"
                      />

                      {/* Profile assign dropdown */}
                      <select
                        value={search.profile_id || ''}
                        onChange={(e) => handleSearchRowChange(idx, 'profile_id', e.target.value ? Number(e.target.value) : null)}
                        className="bg-slate-950 border border-white/10 rounded-lg text-xs py-2 px-3 text-slate-300 outline-none focus:border-cyan-500 transition-all lg:w-48"
                      >
                        <option value="">Choose Profile Category</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.domain}</option>
                        ))}
                      </select>

                      {/* Enabled Checkbox & remove */}
                      <div className="flex items-center gap-4 justify-between lg:justify-start">
                        <label className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
                          <input
                            type="checkbox"
                            checked={search.enabled}
                            onChange={(e) => handleSearchRowChange(idx, 'enabled', e.target.checked)}
                            className="rounded border-white/10 bg-slate-950 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                          />
                          Active
                        </label>
                        <button
                          onClick={() => removeSearchRow(idx)}
                          className="p-2 rounded-lg bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 transition-all"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex gap-4">
                <button
                  onClick={handleSaveSearches}
                  className="flex-1 py-2.5 rounded-xl font-heading text-sm font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all shadow-md shadow-cyan-500/10"
                >
                  Save Search URL Configurations
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 5. PROMPTS HUB TAB ==================== */}
        {activeTab === 'prompts' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-slate-900/40 border border-white/10 p-6 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-cyan-500/5 blur-3xl" />
              <h2 className="text-2xl font-bold text-white font-heading">Prompts Hub</h2>
              <p className="text-slate-400 text-sm mt-1">Copy these expert system prompts and paste them into your external LLM of choice to generate profiles or structured cheat sheets.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                
                {/* Profile Gen Prompt */}
                <div className="rounded-xl bg-slate-950/60 border border-white/5 p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center gap-2 mb-3">
                      <h3 className="text-md font-bold text-white font-heading">1. Profile JSON Generator</h3>
                      <button
                        onClick={() => copyToClipboard(PROMPT_RESEARCHER, 'researcher')}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all"
                      >
                        {copiedPromptId === 'researcher' ? 'Copied!' : 'Copy Prompt'}
                      </button>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed mb-4">
                      Feed this to Claude/ChatGPT to automatically generate the strict JSON configuration required by the <strong>Agent Profiles</strong> tab.
                    </p>
                  </div>
                  <pre className="p-3 bg-slate-950 rounded-lg border border-white/5 text-[10px] font-mono text-slate-500 overflow-y-auto max-h-48 text-left">
                    {PROMPT_RESEARCHER}
                  </pre>
                </div>

                {/* Cheat Sheet Prompt */}
                <div className="rounded-xl bg-slate-950/60 border border-white/5 p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center gap-2 mb-3">
                      <h3 className="text-md font-bold text-white font-heading">2. Model-Specific Cheat Sheet</h3>
                      <button
                        onClick={() => copyToClipboard(PROMPT_CHEAT_SHEET, 'cheat')}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all"
                      >
                        {copiedPromptId === 'cheat' ? 'Copied!' : 'Copy Prompt'}
                      </button>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed mb-4">
                      Instructs the LLM to write highly structured cheat sheets with conversational questions (like CBR vs GSX-R) to guide your manual vendor interactions.
                    </p>
                  </div>
                  <pre className="p-3 bg-slate-950 rounded-lg border border-white/5 text-[10px] font-mono text-slate-500 overflow-y-auto max-h-48 text-left">
                    {PROMPT_CHEAT_SHEET}
                  </pre>
                </div>

              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default App
