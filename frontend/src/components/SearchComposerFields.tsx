import { ChevronDown, Gauge, Euro, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import PlaceInput, { type Place } from './PlaceInput';
import { Input } from './ui/Input';

export interface SearchComposerFieldsProps {
  place: Place | null;
  onPlaceChange: (place: Place | null) => void;
  radius: number;
  onRadiusChange: (radius: number) => void;
  minPrice: number | null;
  onMinPriceChange: (price: number | null) => void;
  maxPrice: number | null;
  onMaxPriceChange: (price: number | null) => void;
  baseUrl: string;
}

const RADIUS_PRESETS = [10, 20, 30, 50, 100, 200];

export default function SearchComposerFields({
  place,
  onPlaceChange,
  radius,
  onRadiusChange,
  minPrice,
  onMinPriceChange,
  maxPrice,
  onMaxPriceChange,
  baseUrl,
}: SearchComposerFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 pt-1">
      {/* 1. LOCATION (ORT) */}
      <div className="space-y-1.5">
        <PlaceInput
          label={t('searchFamily.locationLabel')}
          placeholder={t('searchFamily.locationPlaceholder')}
          emptyHint={t('searchFamily.locationEmptyHint')}
          value={place}
          onChange={onPlaceChange}
        />
      </div>

      {/* 2. RADIUS & 3. PRICE RANGE (GRID) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* RADIUS CONTROL */}
        <div className="space-y-2 p-3.5 rounded-xl bg-bg-surface-subtle border border-border-subtle">
          <div className="flex items-center justify-between">
            <label htmlFor="radius-slider" className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-brand-accent shrink-0" />
              {t('searchFamily.radiusLabel')}
            </label>
            <span className="text-xs font-mono font-bold text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full">
              {t('searchFamily.radiusKm', { radius })}
            </span>
          </div>

          <input
            id="radius-slider"
            type="range"
            min="5"
            max="200"
            step="5"
            value={radius}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            className="w-full h-2 bg-bg-input rounded-lg appearance-none cursor-pointer accent-brand-accent focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {RADIUS_PRESETS.map((preset) => {
              const active = radius === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onRadiusChange(preset)}
                  className={`text-2xs font-semibold px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    active
                      ? 'bg-brand-accent text-white shadow-sm'
                      : 'bg-bg-input text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover border border-border-subtle'
                  }`}
                >
                  {preset} km
                </button>
              );
            })}
          </div>
        </div>

        {/* PRICE RANGE CONTROL */}
        <div className="space-y-2 p-3.5 rounded-xl bg-bg-surface-subtle border border-border-subtle">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              <Euro className="w-4 h-4 text-brand-accent shrink-0" />
              {t('searchFamily.priceRangeLabel')}
            </label>
            {(minPrice !== null || maxPrice !== null) && (
              <button
                type="button"
                onClick={() => {
                  onMinPriceChange(null);
                  onMaxPriceChange(null);
                }}
                className="text-2xs text-text-muted hover:text-status-danger cursor-pointer underline"
              >
                {t('searchFamily.resetPrice')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="space-y-1">
              <Input
                id="min-price-input"
                type="number"
                min="0"
                step="5"
                value={minPrice !== null ? minPrice : ''}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  onMinPriceChange(val === '' ? null : Math.max(0, parseInt(val, 10) || 0));
                }}
                placeholder={t('searchFamily.minPricePlaceholder')}
                className="w-full text-xs font-mono bg-bg-input border-border-subtle py-1.5"
              />
            </div>
            <div className="space-y-1">
              <Input
                id="max-price-input"
                type="number"
                min="0"
                step="5"
                value={maxPrice !== null ? maxPrice : ''}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  onMaxPriceChange(val === '' ? null : Math.max(0, parseInt(val, 10) || 0));
                }}
                placeholder={t('searchFamily.maxPricePlaceholder')}
                className="w-full text-xs font-mono bg-bg-input border-border-subtle py-1.5"
              />
            </div>
          </div>
          <p className="text-2xs text-text-muted leading-tight">
            {minPrice !== null && maxPrice !== null
              ? t('searchFamily.priceRange', { min: minPrice, max: maxPrice })
              : maxPrice !== null
              ? t('searchFamily.priceUpTo', { max: maxPrice })
              : minPrice !== null
              ? t('searchFamily.priceFrom', { min: minPrice })
              : t('searchFamily.noPriceLimit')}
          </p>
        </div>
      </div>

      {/* 4. ADVANCED / COLLAPSIBLE URL */}
      <details className="group pt-1">
        <summary className="flex items-center gap-1.5 text-2xs text-text-muted hover:text-text-secondary cursor-pointer select-none">
          <SlidersHorizontal className="w-3 h-3 text-text-muted" />
          <span>{t('searchFamily.advancedUrl')}</span>
          <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 p-2.5 rounded-lg bg-bg-surface-subtle border border-border-subtle text-2xs font-mono text-text-muted break-all select-all">
          {baseUrl || '—'}
        </div>
      </details>
    </div>
  );
}
