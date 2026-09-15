import { useState, useCallback, useEffect } from 'react';
import type { Campaign, KnowledgeSet, SearchTarget, Listing } from '../types';
import type { RouteCorridorData } from '../components/RouteResultsView';
import { transformListing } from '../utils/listingTransformer';

interface UseAppDataProps {
  currentCampaignId: number | null;
  setCurrentCampaignId: (id: number | null) => void;
  view: string;
  navigate: (view: 'landing' | 'dashboard' | 'edit' | 'create-campaign' | 'settings', campaignId?: number | null, searchId?: number | null) => void;
  appUser: { email: string; role: string } | null;
}

export function useAppData({
  currentCampaignId,
  setCurrentCampaignId,
  view,
  navigate,
  appUser,
}: UseAppDataProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [searches, setSearches] = useState<SearchTarget[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [knowledgeSets, setKnowledgeSets] = useState<KnowledgeSet[]>([]);
  const [campaignRouteData, setCampaignRouteData] = useState<RouteCorridorData | null>(null);
  const [loadingRouteData, setLoadingRouteData] = useState(false);
  const [geometrySuccessMsg, setGeometrySuccessMsg] = useState<string | null>(null);

  const refreshAll = useCallback(() => {
    Promise.all([
      fetch('/api/campaigns').then(r => r.json()),
      fetch('/api/search-urls').then(r => r.json()),
      fetch('/api/listings').then(r => r.json()),
      fetch('/api/knowledge-sets').then(r => r.json()),
      fetch('/api/search-families').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([campaignsData, searchesData, listingsData, ksData, familiesData]) => {
      const familyMap = new Map<number, number>();
      if (Array.isArray(familiesData)) {
        for (const fam of familiesData) {
          if (fam.campaign_id && fam.id) familyMap.set(fam.campaign_id, fam.id);
        }
      }
      setCampaigns(prev => {
        const prevFamilyMap = new Map(prev.map(c => [c.id, c.family_id]));
        return campaignsData.map((c: Campaign) => ({
          ...c,
          family_id: c.family_id ?? familyMap.get(c.id) ?? prevFamilyMap.get(c.id),
        }));
      });
      setSearches(searchesData);
      setKnowledgeSets(ksData);
      setListings(listingsData.map((l: Listing) => transformListing(l, searchesData, ksData)));
      if (campaignsData.length > 0 && currentCampaignId === null) {
        setCurrentCampaignId(campaignsData[0].id);
      }
    }).catch(err => console.error('Error refreshing:', err));
  }, [currentCampaignId, setCurrentCampaignId]);

  useEffect(() => {
    if (!appUser) return;
    refreshAll();
  }, [appUser, refreshAll]);

  useEffect(() => {
    if (currentCampaignId && view === 'dashboard') {
      const campaignSearches = searches.filter(s => s.campaign_id === currentCampaignId);
      if (campaignSearches.length === 0) {
        navigate('edit', currentCampaignId, null);
      }
    }
  }, [currentCampaignId, searches, view, navigate]);

  useEffect(() => {
    if (!currentCampaignId) {
      setCampaignRouteData(null);
      return;
    }
    const c = campaigns.find(item => item.id === currentCampaignId);
    if (!c?.route_id) {
      setCampaignRouteData(null);
      return;
    }
    setLoadingRouteData(true);
    fetch(`/api/campaigns/${currentCampaignId}/route`)
      .then(r => r.ok ? r.json() : null)
      .then(setCampaignRouteData)
      .catch(e => console.error('Failed to fetch campaign route:', e))
      .finally(() => setLoadingRouteData(false));
  }, [currentCampaignId, campaigns]);

  useEffect(() => {
    if (!currentCampaignId) return;
    const c = campaigns.find(item => item.id === currentCampaignId);
    if (c && !c.family_id && !c.route_id) {
      fetch(`/api/search-families?campaign_id=${currentCampaignId}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          if (Array.isArray(data) && data.length > 0 && data[0].id) {
            setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, family_id: data[0].id } : c));
          }
        }).catch(() => {});
    }
  }, [currentCampaignId, campaigns]);

  return {
    campaigns,
    setCampaigns,
    searches,
    setSearches,
    listings,
    setListings,
    knowledgeSets,
    setKnowledgeSets,
    campaignRouteData,
    setCampaignRouteData,
    loadingRouteData,
    geometrySuccessMsg,
    setGeometrySuccessMsg,
    refreshAll,
  };
}
