import React from 'react';

export interface PricePoint {
  price_eur: number | null;
  seen_at: string;
}

export interface PriceTrailProps {
  history: PricePoint[];
  /** What comparable listings cost, drawn as the line to beat. */
  reference?: number | null;
  width?: number;
  height?: number;
}

/** Where a price has been, and where the market sits.
 *
 * Small enough to live in a row: what matters is the direction and whether the
 * line has crossed under the market, not the exact shape. A listing whose price
 * has never moved gets nothing at all -- a flat line would claim a history it
 * does not have.
 */
export const PriceTrail: React.FC<PriceTrailProps> = ({
  history,
  reference = null,
  width = 48,
  height = 16,
}) => {
  const points = history.filter(p => typeof p.price_eur === 'number') as Array<{
    price_eur: number;
    seen_at: string;
  }>;
  if (points.length < 2) return null;

  const prices = points.map(p => p.price_eur);
  const values = reference ? [...prices, reference] : prices;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;

  const x = (i: number) => (i / (points.length - 1)) * (width - 2) + 1;
  const y = (value: number) => height - 1 - ((value - low) / span) * (height - 2);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.price_eur).toFixed(1)}`).join(' ');
  const fell = prices[prices.length - 1] < prices[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      {reference !== null && (
        <line
          x1={0}
          x2={width}
          y1={y(reference)}
          y2={y(reference)}
          stroke="#8FA6A1"
          strokeOpacity={0.35}
          strokeDasharray="2 2"
          strokeWidth={1}
        />
      )}
      <path d={path} fill="none" stroke={fell ? '#4E8C6A' : '#8FA6A1'} strokeWidth={1.5} />
      <circle cx={x(points.length - 1)} cy={y(prices[prices.length - 1])} r={1.8} fill={fell ? '#4E8C6A' : '#8FA6A1'} />
    </svg>
  );
};

export default PriceTrail;
