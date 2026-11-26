import { TrendingUp, Minus, TrendingDown } from 'lucide-react';
import type { Decision } from '../../types';
import { VERDICT } from '../../lib/brand';

const ICON = { buy: TrendingUp, neutral: Minus, avoid: TrendingDown };

/** Buy = green + TrendingUp, Neutral = amber + Minus, Avoid = rose + TrendingDown. */
export function VerdictPill({ decision, size = 'md' }: { decision: Decision; size?: 'sm' | 'md' }) {
  const v = VERDICT[decision];
  const Icon = ICON[decision];
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-0.5 text-[11.5px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold leading-none ${pad}`}
      style={{ background: v.soft, color: v.dark }}
    >
      <Icon size={size === 'sm' ? 11 : 12.5} strokeWidth={2.6} />
      {v.label}
    </span>
  );
}

/** A small coloured dot (verdict or any colour). */
export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />;
}
