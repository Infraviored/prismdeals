import { useState, useEffect, useCallback } from 'react';
import type { Campaign, SearchTarget, Listing, RouteCorridorData } from '../types';
import type { Place } from '../components/PlaceInput';
import { useTranslation } from './useTranslation';
import { isValidKleinanzeigenUrl, suggestTitleFromUrl } from '../utils/urlHelpers';

interface UseCampaignEditProps {
  currentCampaignId: number | null;
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  searches: SearchTarget[];
  setSearches: React.Dispatch<React.SetStateAction<SearchTarget[]>>;
  listings: Listing[];
  campaignRouteData: RouteCorridorData | null;
  setCampaignRouteData: React.Dispatch<React.SetStateAction<RouteCorridorData | null>>;
  setGeometrySuccessMsg: (msg: string | null) => void;
  refreshAll: () => void;
  setCurrentSearchId: (id: number | null) => void;
  setIsScraping: (v: boolean) => void;
  setScrapingStatus: (s: string) => void;
  setLiveLogs: (logs: string) => void;
  setScrapingProgress: (progress: { phase: string; current: number; total: number; status: string } | null) => void;
}

export function useCampaignEdit({
  currentCampaignId,
  campaigns,
  setCampaigns,
  searches,
  setSearches,
  listings,
  campaignRouteData,
  setCampaignRouteData,
  setGeometrySuccessMsg,
  refreshAll,
  setCurrentSearchId,
  setIsScraping,
  setScrapingStatus,
  setLiveLogs,
  setScrapingProgress,
}: UseCampaignEditProps) {
  const { t } = useTranslation();

  // Edit screen form state
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('');
  const [searchTargetMode, setSearchTargetMode] = useState<'point' | 'route' | 'family'>('point');
  const [routeFrom, setRouteFrom] = useState<Place | null>(null);
  const [routeTo, setRouteTo] = useState<Place | null>(null);
  const [routeRadiusKm, setRouteRadiusKm] = useState(30);
  const [routeCorridorKm, setRouteCorridorKm] = useState(15);
  const [routePlanning, setRoutePlanning] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<{ count: number; width: number } | null>(null);
  const [isRegisteringTarget, setIsRegisteringTarget] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // URL preview debounce
  useEffect(() => {
    if (searchTargetMode === 'family' || campaigns.find(c => c.id === currentCampaignId)?.route_id) return;
    if (!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl)) return;
    const campaignSearches = searches.filter(s => s.campaign_id === currentCampaignId);
    if (!(campaignSearches.length === 0 || isRegisteringTarget)) return;

    const timer = setTimeout(async () => {
      const suggested = suggestTitleFromUrl(newTargetUrl) || 'New Search';
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewCount(null);
      try {
        const countRes = await fetch('/api/searches/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: newTargetUrl }),
        });
        if (countRes.ok) {
          const d = await countRes.json();
          setPreviewCount(d.count);
        }
        const ksRes = await fetch('/api/knowledge-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${suggested} Guidelines`,
            expert_knowledge: '',
            item_json: {},
          }),
        });
        const boundKsId = ksRes.ok ? (await ksRes.json()).id : null;
        const searchRes = await fetch('/api/searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: currentCampaignId,
            name: suggested,
            url: newTargetUrl,
            knowledge_set_id: boundKsId,
          }),
        });
        if (searchRes.ok) {
          const sd = await searchRes.json();
          setNewTargetUrl('');
          setPreviewCount(null);
          setIsRegisteringTarget(false);
          setCurrentSearchId(sd.id);
          setIsScraping(true);
          setScrapingStatus('Spawning targeted crawler...');
          setLiveLogs('Starting targeted Chrome headless scraper session...');
          setScrapingProgress({
            phase: 'starting',
            current: 0,
            total: 100,
            status: 'Spawning scraper worker...',
          });
          await fetch(`/api/searches/${sd.id}/scrape`, { method: 'POST' });
          refreshAll();
        } else {
          const e = await searchRes.json();
          setPreviewError(e.error || 'Failed to auto-register search target.');
        }
      } catch {
        setPreviewError('Failed to auto-register search query due to connection issues.');
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [newTargetUrl, currentCampaignId, searches, isRegisteringTarget, searchTargetMode, refreshAll, setCurrentSearchId, setIsScraping, setScrapingStatus, setLiveLogs, setScrapingProgress, campaigns]);

  const handleDeleteCampaign = useCallback(async (c: Campaign) => {
    const campaignSearches = searches.filter(s => s.campaign_id === c.id);
    const campaignListings = listings.filter(l => {
      const s = searches.find(x => x.id === l.search_id);
      return s && s.campaign_id === c.id;
    });
    const contents = [
      campaignSearches.length ? t('landing.deleteSearches', { count: campaignSearches.length }) : null,
      campaignListings.length ? t('landing.deleteListings', { count: campaignListings.length }) : null,
    ].filter(Boolean).join(', ');
    const message = contents
      ? t('landing.deleteConfirmWithContents', { name: c.name, contents })
      : t('landing.deleteConfirm', { name: c.name });
    if (!window.confirm(message)) return;
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || t('landing.deleteFailed'));
        return;
      }
      refreshAll();
    } catch {
      alert(t('common.connectionIssueFailed'));
    }
  }, [searches, listings, t, refreshAll]);

  const handleCreateCampaign = async (): Promise<number | null> => {
    if (!newCampaignName.trim()) return null;
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCampaignName }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewCampaignName('');
        refreshAll();
        return data.id;
      }
      alert(data.error || 'Failed to create campaign.');
    } catch {
      alert('Failed to connect to backend server.');
    }
    return null;
  };

  const handleUpdateCampaignName = async (name: string) => {
    if (!currentCampaignId) return;
    const previous = campaigns.find(c => c.id === currentCampaignId)?.name;
    setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, name } : c));
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentCampaignId, name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setCampaigns(prev => prev.map(c => c.id === currentCampaignId && previous ? { ...c, name: previous } : c));
        alert(d.error || t('landing.renameFailed'));
      }
    } catch {
      setCampaigns(prev => prev.map(c => c.id === currentCampaignId && previous ? { ...c, name: previous } : c));
      alert(t('common.connectionIssueFailed'));
    }
  };

  const handleAddSearchTarget = useCallback(async () => {
    if (!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl) || !currentCampaignId) return;
    try {
      const suggested = suggestTitleFromUrl(newTargetUrl) || 'New Search';
      const ksRes = await fetch('/api/knowledge-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${suggested} Guidelines`,
          expert_knowledge: '',
          item_json: {},
        }),
      });
      const boundKsId = ksRes.ok ? (await ksRes.json()).id : null;
      const searchRes = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: currentCampaignId,
          name: suggested,
          url: newTargetUrl,
          knowledge_set_id: boundKsId,
        }),
      });
      if (searchRes.ok) {
        const sd = await searchRes.json();
        setNewTargetUrl('');
        setCurrentSearchId(sd.id);
        refreshAll();
      }
    } catch (e) {
      console.error('Failed to add search target:', e);
    }
  }, [newTargetUrl, currentCampaignId, refreshAll, setCurrentSearchId]);

  const handleDeleteSearch = async (searchId: number) => {
    try {
      const res = await fetch(`/api/searches/${searchId}`, { method: 'DELETE' });
      if (res.ok) {
        setSearches(prev => prev.filter(s => s.id !== searchId));
        refreshAll();
      }
    } catch (e) {
      console.error('Failed to delete search:', e);
    }
  };

  const handlePlanCorridor = useCallback(async () => {
    if (!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl)) {
      setRouteError(t('common.routeNeedsUrl'));
      return;
    }
    if (!routeFrom || !routeTo) {
      setRouteError(t('common.routeNeedsBoth'));
      return;
    }
    setRoutePlanning(true);
    setRouteError(null);
    setRouteResult(null);
    try {
      const suggested = suggestTitleFromUrl(newTargetUrl) || 'New Search';
      const ksRes = await fetch('/api/knowledge-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${suggested} Guidelines`,
          expert_knowledge: '',
          item_json: {},
        }),
      });
      const boundKsId = ksRes.ok ? (await ksRes.json()).id : null;
      const res = await fetch('/api/route-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: currentCampaignId,
          base_url: newTargetUrl,
          origin: routeFrom.postal_code,
          destination: routeTo.postal_code,
          radius_km: routeRadiusKm,
          corridor_km: routeCorridorKm,
          knowledge_set_id: boundKsId,
          name: `${suggested}: ${routeFrom.name} → ${routeTo.name}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRouteError(data.error || t('common.targetRegistrationFailed'));
        return;
      }
      setRouteResult({
        count: (data.searches || []).length,
        width: (data.corridor_km || routeCorridorKm) * 2,
      });
      setNewTargetUrl('');
      setRouteFrom(null);
      setRouteTo(null);
      setIsRegisteringTarget(false);
      if (data.searches?.length) setCurrentSearchId(data.searches[0].id);
      if (data.route_id && currentCampaignId) {
        setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, route_id: data.route_id } : c));
      }
      refreshAll();
    } catch {
      setRouteError(t('common.connectionIssueFailed'));
    } finally {
      setRoutePlanning(false);
    }
  }, [newTargetUrl, routeFrom, routeTo, routeRadiusKm, routeCorridorKm, currentCampaignId, t, setCurrentSearchId, refreshAll, setCampaigns]);

  const handleRemoveRoute = async () => {
    if (!currentCampaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${currentCampaignId}/route`, { method: 'DELETE' });
      if (res.ok) {
        setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, route_id: null } : c));
        setCampaignRouteData(null);
        setRouteResult(null);
        setGeometrySuccessMsg(t('campaignSettings.routeRemovedSuccess'));
        setTimeout(() => setGeometrySuccessMsg(null), 4000);
        refreshAll();
      }
    } catch (e) {
      console.error('Failed to remove route:', e);
    }
  };

  const handleUpdateCorridor = useCallback(async (newRadiusKm: number, newCorridorKm: number) => {
    if (!campaignRouteData?.route?.id) return;
    try {
      const res = await fetch(`/api/route-searches/${campaignRouteData.route.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius_km: newRadiusKm, corridor_km: newCorridorKm }),
      });
      if (res.ok) {
        setCampaignRouteData(await res.json());
        setGeometrySuccessMsg(t('searchFamily.savedSuccess'));
        setTimeout(() => setGeometrySuccessMsg(null), 4000);
      }
    } catch (e) {
      console.error('Failed to update corridor:', e);
    }
  }, [campaignRouteData, t, setCampaignRouteData, setGeometrySuccessMsg]);

  return {
    newCampaignName,
    setNewCampaignName,
    newTargetUrl,
    setNewTargetUrl,
    searchTargetMode,
    setSearchTargetMode,
    routeFrom,
    setRouteFrom,
    routeTo,
    setRouteTo,
    routeRadiusKm,
    setRouteRadiusKm,
    routeCorridorKm,
    setRouteCorridorKm,
    routePlanning,
    routeError,
    routeResult,
    previewLoading,
    previewCount,
    previewError,
    handleCreateCampaign,
    handleUpdateCampaignName,
    handleAddSearchTarget,
    handleDeleteSearch,
    handlePlanCorridor,
    handleRemoveRoute,
    handleUpdateCorridor,
    handleDeleteCampaign,
  };
}
