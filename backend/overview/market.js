const { DEAL_RATIO, MIN_ABSOLUTE_SAVING_EUR, MIN_GROUP_SIZE } = require('../db/reference_price');

/**
 * Computes price histogram classes from a list of integer prices.
 */
function buildPriceHistogram(prices) {
  if (!prices || prices.length === 0) {
    return { min: null, max: null, count: 0, bins: [] };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const count = sorted.length;

  if (min === max) {
    return {
      min,
      max,
      count,
      bins: [{ min, max, count, label: `${min} €` }],
    };
  }

  const range = max - min;
  const targetBins = 7;
  const rawStep = range / targetBins;
  const niceSteps = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500, 1000];
  const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep);

  const start = Math.floor(min / step) * step;
  const bins = [];

  for (let current = start; current <= max; current += step) {
    const binMin = current;
    const binMax = current + step - 1;
    bins.push({
      min: binMin,
      max: binMax,
      count: 0,
      label: `${binMin}–${binMax} €`,
    });
  }

  for (const price of sorted) {
    const idx = Math.min(Math.floor((price - start) / step), bins.length - 1);
    if (idx >= 0 && idx < bins.length) {
      bins[idx].count++;
    }
  }

  return { min, max, count, bins };
}

/**
 * Computes market overview statistics: median, deal threshold, cheapest, and clusters.
 */
function computeMarketStats(prices, references, searchIds, primarySearchId) {
  let marketMedian = null;
  let dealThreshold = null;
  let cheapest = null;

  if (searchIds.length > 0) {
    if (primarySearchId && references.has(primarySearchId)) {
      const ref = references.get(primarySearchId);
      marketMedian = ref.median;
      cheapest = ref.cheapest;
      if (ref.count >= MIN_GROUP_SIZE) {
        dealThreshold = Math.min(
          ref.cheapest,
          Math.floor(ref.median * DEAL_RATIO),
          ref.median - MIN_ABSOLUTE_SAVING_EUR
        );
      }
    } else if (references.size > 0) {
      // Average across group references
      const refs = [...references.values()];
      const sumMedian = refs.reduce((acc, r) => acc + r.median, 0);
      marketMedian = Math.round(sumMedian / refs.length);
      const minCheapest = Math.min(...refs.map(r => r.cheapest));
      cheapest = minCheapest;
      dealThreshold = Math.min(
        minCheapest,
        Math.floor(marketMedian * DEAL_RATIO),
        marketMedian - MIN_ABSOLUTE_SAVING_EUR
      );
    }
  }

  // Fallback median from current scoped prices if no reference was stored
  if (marketMedian === null && prices.length > 0) {
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sortedPrices.length / 2);
    marketMedian = sortedPrices.length % 2 === 0
      ? Math.round((sortedPrices[mid - 1] + sortedPrices[mid]) / 2)
      : sortedPrices[mid];
  }

  // Clustering: where most prices gather
  let clusterShare = null;
  let clusterMin = null;
  let clusterMax = null;
  if (prices.length > 0) {
    const freq = {};
    for (const p of prices) freq[p] = (freq[p] || 0) + 1;
    const common = Object.keys(freq)
      .map(Number)
      .sort((a, b) => freq[b] - freq[a])
      .slice(0, 2)
      .sort((a, b) => a - b);
    if (common.length > 0) {
      clusterMin = common[0];
      clusterMax = common[common.length - 1];
      const inCluster = prices.filter(p => p >= clusterMin && p <= clusterMax).length;
      clusterShare = Math.round((100 * inCluster) / prices.length);
    }
  }

  const histogram = buildPriceHistogram(prices);
  return {
    median: marketMedian,
    deal_threshold: dealThreshold,
    cheapest,
    min: histogram.min,
    max: histogram.max,
    count: histogram.count,
    bins: histogram.bins,
    cluster_share: clusterShare,
    cluster_min: clusterMin,
    cluster_max: clusterMax,
  };
}

module.exports = {
  buildPriceHistogram,
  computeMarketStats,
};
