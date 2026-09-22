import type { TranslateFn } from './freshness';

/**
 * "60 € VB" is not "60 €".
 *
 * The number carries the amount and the raw string carries the terms. Building
 * the label from the number alone dropped the "VB" everywhere it appeared:
 * every row and every sheet showed a negotiable asking price as a fixed one,
 * which is the difference between a price and an invitation to haggle.
 */
export function formatPrice(
  priceEur: number | null | undefined,
  rawPrice: string | null | undefined,
  t: TranslateFn
): { text: string; isMissing: boolean } {
  const raw = rawPrice?.trim() || '';

  if (typeof priceEur === 'number' && priceEur > 0) {
    // Only the terms are taken from the raw string; the amount is the
    // parsed number, so a mangled "1.200 €" still reads as 1200.
    const negotiable = /\bVB\b/i.test(raw) || /verhandlungsbasis/i.test(raw);
    return { text: negotiable ? `${priceEur} € VB` : `${priceEur} €`, isMissing: false };
  }
  if (raw) {
    return { text: raw, isMissing: false };
  }
  return { text: t('surface.noPrice'), isMissing: true };
}
