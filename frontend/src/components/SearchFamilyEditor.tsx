import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { useTranslation } from '../hooks/useTranslation';
import type { SearchFamilyTerm, SearchFamilyPreview } from '../types';
import SearchFamilyPreviewBanner from './SearchFamilyPreviewBanner';
import SearchFamilyTermList from './SearchFamilyTermList';
import SearchComposerFields from './SearchComposerFields';
import { useSearchFamilyComposer } from '../hooks/useSearchFamilyComposer';
import { Layers } from 'lucide-react';

export interface SearchFamilyEditorProps {
  familyId?: number;
  initialName?: string;
  initialBaseUrl?: string;
  initialTerms?: SearchFamilyTerm[];
  campaignId?: number | null;
  routeSearchId?: number | null;
  onSave?: (savedFamily: { id: number; searches: number; conflicts?: unknown[] }) => void;
  onCancel?: () => void;
  className?: string;
}

export default function SearchFamilyEditor({
  familyId,
  initialName = '',
  initialBaseUrl = '',
  initialTerms = [],
  campaignId = null,
  routeSearchId = null,
  onSave,
  onCancel,
  className = '',
}: SearchFamilyEditorProps) {
  const { t } = useTranslation();

  const {
    name,
    setName,
    baseUrl,
    terms,
    setTerms,
    pasteText,
    setPasteText,
    additionalText,
    setAdditionalText,
    place,
    locationId,
    locationSlug,
    radius,
    minPrice,
    maxPrice,
    loadingFamily,
    activeTerms,
    handlePlaceChange,
    handleRadiusChange,
    handleMinPriceChange,
    handleMaxPriceChange,
    handleApplyPaste,
    handleAddAdditional,
    handleToggleTerm,
    handleDeleteTerm,
    handleToggleAll,
    handleClearAll,
  } = useSearchFamilyComposer({
    familyId,
    initialName,
    initialBaseUrl,
    initialTerms,
  });

  const [preview, setPreview] = useState<SearchFamilyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestId = useRef(0);

  const activeTermLabelsKey = useMemo(
    () => activeTerms.map((t) => t.term || t.label).join('|'),
    [activeTerms]
  );

  const loadPreview = useCallback(async () => {
    const trimmedUrl = baseUrl.trim();
    if (!trimmedUrl || activeTerms.length === 0) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    const mine = ++requestId.current;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await fetch('/api/search-families/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: trimmedUrl,
          terms: activeTerms.map((t) => t.term || t.label),
          route_search_id: routeSearchId ?? undefined,
        }),
      });

      const data = await res.json();
      if (mine !== requestId.current) return;

      if (!res.ok) {
        setPreviewError(data.error || t('common.connectionIssueFailed'));
        setPreview(null);
      } else {
        setPreview(data);
      }
    } catch {
      if (mine === requestId.current) {
        setPreviewError(t('common.connectionIssueFailed'));
        setPreview(null);
      }
    } finally {
      if (mine === requestId.current) {
        setPreviewLoading(false);
      }
    }
  }, [baseUrl, activeTerms, routeSearchId, t]);

  useEffect(() => {
    const timer = setTimeout(loadPreview, 350);
    return () => clearTimeout(timer);
  }, [baseUrl, activeTermLabelsKey, routeSearchId, loadPreview]);

  const disabledReason = useMemo(() => {
    if (!name.trim()) return t('searchFamily.saveDisabledNoName');
    if (!place && !locationId && !locationSlug && !baseUrl.trim()) {
      return t('searchFamily.saveDisabledNoLocation');
    }
    if (!baseUrl.trim()) return t('searchFamily.saveDisabledNoUrl');
    if (terms.length === 0 || activeTerms.length === 0) return t('searchFamily.saveDisabledNoTerms');
    if (previewLoading) return t('searchFamily.saveDisabledPreviewLoading');
    if (previewError) return t('searchFamily.saveDisabledPreviewError');
    return null;
  }, [name, place, locationId, locationSlug, baseUrl, terms.length, activeTerms.length, previewLoading, previewError, t]);

  const isSaveDisabled = disabledReason !== null || saving;

  const handleSave = async () => {
    if (isSaveDisabled) return;

    setSaving(true);
    setSaveError(null);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      base_url: baseUrl.trim(),
      terms: terms.map((t) => ({
        ...(t.id ? { id: t.id } : {}),
        term: t.term,
        label: t.label || t.term,
        enabled: t.enabled,
      })),
    };
    if (campaignId) payload.campaign_id = campaignId;
    if (routeSearchId) payload.route_search_id = routeSearchId;

    try {
      const url = familyId ? `/api/search-families/${familyId}` : '/api/search-families';
      const method = familyId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || t('common.connectionIssueFailed'));
      } else if (onSave) {
        onSave(data);
      }
    } catch {
      setSaveError(t('common.connectionIssueFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`p-5 sm:p-6 space-y-5 bg-bg-surface border-border-subtle max-w-3xl mx-auto animate-fadeIn ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-accent shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-text-primary tracking-tight font-heading">
              {t('searchFamily.editorTitle')}
            </h2>
            {loadingFamily && (
              <span className="text-xs text-brand-accent animate-pulse font-mono">
                ({t('common.processing')})
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
            {t('searchFamily.editorDescription')}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="family-name" className="text-xs sm:text-sm font-semibold text-text-secondary">
            {t('searchFamily.nameLabel')}
          </label>
          <Input
            id="family-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('searchFamily.namePlaceholder')}
            className="w-full text-sm bg-bg-input border-border-subtle"
          />
        </div>

        {/* 1. MODELS / SEARCH TERMS */}
        <SearchFamilyTermList
          terms={terms}
          activeTerms={activeTerms}
          pasteText={pasteText}
          onPasteTextChange={setPasteText}
          onApplyPaste={handleApplyPaste}
          additionalText={additionalText}
          onAdditionalTextChange={setAdditionalText}
          onAddAdditional={handleAddAdditional}
          onToggleTerm={handleToggleTerm}
          onDeleteTerm={handleDeleteTerm}
          onToggleAll={handleToggleAll}
          onClearAll={handleClearAll}
          onSetTerms={setTerms}
        />

        {/* 2. LOCATION, 3. RADIUS, 4. PRICE RANGE & COLLAPSED ADVANCED URL */}
        <SearchComposerFields
          place={place}
          onPlaceChange={handlePlaceChange}
          radius={radius}
          onRadiusChange={handleRadiusChange}
          minPrice={minPrice}
          onMinPriceChange={handleMinPriceChange}
          maxPrice={maxPrice}
          onMaxPriceChange={handleMaxPriceChange}
          baseUrl={baseUrl}
        />
      </div>

      <SearchFamilyPreviewBanner
        preview={preview}
        loading={previewLoading}
        error={previewError}
      />

      {saveError && (
        <p className="text-xs text-status-danger font-semibold">{saveError}</p>
      )}

      <div className="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={isSaveDisabled}
            title={disabledReason || undefined}
            className="min-w-[12rem] py-3 font-bold text-sm"
          >
            {saving ? t('searchFamily.saving') : t('searchFamily.saveButton')}
          </Button>

          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
              className="py-3 text-sm"
            >
              {t('common.cancel')}
            </Button>
          )}
        </div>

        {disabledReason && (
          <p className="text-xs text-text-muted italic">
            {disabledReason}
          </p>
        )}
      </div>
    </Card>
  );
}
