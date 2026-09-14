import { useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { SearchFamilyPreview } from '../types';
import { formatMultiplication } from '../utils/searchFamily';
import { Sparkles, AlertCircle } from 'lucide-react';

interface SearchFamilyPreviewBannerProps {
  preview: SearchFamilyPreview | null;
  loading: boolean;
  error: string | null;
}

export default function SearchFamilyPreviewBanner({
  preview,
  loading,
  error,
}: SearchFamilyPreviewBannerProps) {
  const { t } = useTranslation();

  const formattedMultiplication = useMemo(() => {
    return preview ? formatMultiplication(preview, t) : null;
  }, [preview, t]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-input border border-border-subtle text-xs text-text-muted">
        <div className="animate-spin w-3.5 h-3.5 border-2 border-brand-accent border-t-transparent rounded-full shrink-0" />
        <span>{t('searchFamily.saveDisabledPreviewLoading')}</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-status-danger font-semibold">{error}</p>;
  }

  if (!formattedMultiplication) {
    return null;
  }

  return (
    <div className="p-3.5 rounded-xl bg-bg-input border border-border-subtle space-y-2">
      <div className="flex items-center gap-2 text-xs sm:text-sm text-text-secondary font-mono">
        <Sparkles className="w-4 h-4 text-brand-accent shrink-0" />
        <span className="font-semibold tracking-tight">{formattedMultiplication}</span>
      </div>

      {preview?.conflicts && preview.conflicts.length > 0 && (
        <div className="flex items-center gap-1.5 text-2xs text-text-muted pt-1 border-t border-border-subtle">
          <AlertCircle className="w-3.5 h-3.5 text-brand-accent shrink-0" />
          <span>{t('searchFamily.conflictWarning', { count: preview.conflicts.length })}</span>
        </div>
      )}
    </div>
  );
}
