import { useState, useEffect, useRef } from 'react';

interface UseScraperControlProps {
  /** Called once a crawl ends, and again when its verdicts had time to land. */
  refreshAll: () => void;
}

/** Whether a crawl runs, and starting one. */
export function useScraperControl({ refreshAll }: UseScraperControlProps) {
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingStatus, setScrapingStatus] = useState('');

  const refreshAllRef = useRef(refreshAll);
  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/scrape/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data.active) {
          setIsScraping(true);
          if (data.progress?.status) setScrapingStatus(data.progress.status);
        } else if (isScraping) {
          setIsScraping(false);
          setScrapingStatus('');
          // The server processes after the crawl, whether this page is open
          // or not; look again once that is done.
          refreshAllRef.current();
          setTimeout(() => refreshAllRef.current(), 8000);
        }
      } catch {
        // silent: the next poll asks again
      }
    };
    check();
    const id = setInterval(check, 1500);
    return () => clearInterval(id);
  }, [isScraping]);

  const handleStartScrape = async (campaignId: number | null) => {
    setIsScraping(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) setIsScraping(false);
    } catch {
      setIsScraping(false);
    }
  };

  return { isScraping, setIsScraping, scrapingStatus, setScrapingStatus, handleStartScrape };
}
