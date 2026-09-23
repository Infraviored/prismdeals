import { useState, useEffect, useRef } from 'react';
import type { ScraperProgressCardProps } from '../types';

interface UseScraperControlProps {
  refreshAll: () => void;
  onScrapeCompleted?: () => void;
}

export function useScraperControl({
  refreshAll,
  onScrapeCompleted,
}: UseScraperControlProps) {
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingStatus, setScrapingStatus] = useState('');
  const [scrapingProgress, setScrapingProgress] = useState<ScraperProgressCardProps['scrapingProgress']>(null);
  const [liveLogs, setLiveLogs] = useState('');
  const [showLogConsole, setShowLogConsole] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [activeProcessingListingIds, setActiveProcessingListingIds] = useState<string[]>([]);

  // The campaign whose crawl is running. When it finishes, its listings are
  // judged with the free title/description sieve, so a search that found the
  // same listings again gets its verdicts back without anyone pressing a button.
  const crawlingCampaignRef = useRef<number | null>(null);

  const refreshAllRef = useRef(refreshAll);
  const onScrapeCompletedRef = useRef(onScrapeCompleted);
  useEffect(() => {
    refreshAllRef.current = refreshAll;
    onScrapeCompletedRef.current = onScrapeCompleted;
  }, [refreshAll, onScrapeCompleted]);

  // Scraper polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/scrape/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data.active) {
          setIsScraping(true);
          setScrapingProgress(data.progress);
          if (data.progress?.status) setScrapingStatus(data.progress.status);
          const logsRes = await fetch('/api/logs');
          if (logsRes.ok) {
            const d = await logsRes.json();
            setLiveLogs(d.logs || '');
          }
        } else if (isScraping) {
          setIsScraping(false);
          setScrapingProgress(null);
          setScrapingStatus('Scraping completed!');
          const judged = crawlingCampaignRef.current;
          crawlingCampaignRef.current = null;
          if (judged) {
            await fetch(`/api/campaigns/${judged}/judge`, { method: 'POST' }).catch(() => {});
          }
          refreshAllRef.current();
          onScrapeCompletedRef.current?.();
        }
      } catch {
        // silent
      }
    };
    check();
    const id = setInterval(check, 1500);
    return () => clearInterval(id);
  }, [isScraping]);

  // AI processing polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/process/active');
        if (!res.ok) return;
        const data = await res.json();
        setActiveProcessingListingIds(prev => {
          const finished = prev.filter(id => !data.active.includes(id));
          if (finished.length > 0) refreshAllRef.current();
          return data.active;
        });
      } catch {
        // silent
      }
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  const handleStartScrape = async (campaignId: number | null) => {
    crawlingCampaignRef.current = campaignId;
    setIsScraping(true);
    setScrapingStatus('Spawning scraper worker...');
    setLiveLogs('Initializing browser context and logging session...');
    setScrapingProgress({
      phase: 'starting',
      current: 0,
      total: 100,
      status: 'Spawning scraper worker...',
    });
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) {
        alert('Failed to start scraper.');
        setIsScraping(false);
      }
    } catch {
      alert('Error triggering scraper process.');
      setIsScraping(false);
    }
  };

  const handleStartDeepUpdate = async (campaignId: number | null) => {
    setIsScraping(true);
    setScrapingStatus('Spawning deep update worker...');
    setLiveLogs('Initializing browser context for deep listing harvesting...');
    setScrapingProgress({
      phase: 'starting',
      current: 0,
      total: 100,
      status: 'Spawning deep update worker...',
    });
    try {
      const res = await fetch('/api/scrape/update-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) {
        alert('Failed to start deep update.');
        setIsScraping(false);
      }
    } catch {
      alert('Error triggering deep update process.');
      setIsScraping(false);
    }
  };

  const handleStartProcess = async (campaignId: number | null) => {
    setIsProcessing(true);
    setProcessingStatus('Launching AI Matcher checklist evaluation and deal scoring...');
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      if (res.ok) {
        setProcessingStatus('AI matching completed! Updating Deal Matcher results...');
        setTimeout(() => {
          refreshAll();
          setIsProcessing(false);
        }, 4000);
      } else {
        alert('Failed to launch AI Matcher.');
        setIsProcessing(false);
      }
    } catch {
      alert('Error contacting AI Matching backend.');
      setIsProcessing(false);
    }
  };

  const handleProcessSingleListing = async (listingId: string) => {
    setActiveProcessingListingIds(prev => Array.from(new Set([...prev, listingId])));
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      });
      if (!res.ok && res.status !== 409) {
        alert('Failed to run AI agent for this listing.');
        setActiveProcessingListingIds(prev => prev.filter(id => id !== listingId));
      }
    } catch {
      alert('Error contacting backend AI worker.');
      setActiveProcessingListingIds(prev => prev.filter(id => id !== listingId));
    }
  };

  return {
    isScraping,
    setIsScraping,
    scrapingStatus,
    setScrapingStatus,
    scrapingProgress,
    setScrapingProgress,
    liveLogs,
    setLiveLogs,
    showLogConsole,
    setShowLogConsole,
    isProcessing,
    setIsProcessing,
    processingStatus,
    setProcessingStatus,
    activeProcessingListingIds,
    handleStartScrape,
    handleStartDeepUpdate,
    handleStartProcess,
    handleProcessSingleListing,
  };
}
