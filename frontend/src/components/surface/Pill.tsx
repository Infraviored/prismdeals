import React from 'react';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label?: React.ReactNode;
  count?: number | string;
  icon?: React.ReactNode;
  variant?: 'default' | 'accent';
}

function getPillStateStyles(disabled: boolean, active: boolean, variant: 'default' | 'accent'): string {
  if (disabled) {
    return 'opacity-40 cursor-not-allowed bg-white/[0.02] border-transparent text-[#9FB3B0]';
  }
  if (active) {
    if (variant === 'accent') {
      return 'bg-[#E87967]/20 text-[#E87967] border-[#E87967]/60 ring-1 ring-[#E87967]/30 shadow-sm font-semibold';
    }
    return 'bg-white/[0.14] text-[#F2F5F4] border-white/20 shadow-sm font-semibold';
  }
  if (variant === 'accent') {
    return 'bg-white/[0.05] text-[#9FB3B0] border-white/10 hover:bg-white/[0.09] hover:border-white/20 hover:text-[#F2F5F4]';
  }
  return 'bg-white/[0.05] text-[#9FB3B0] border-transparent hover:bg-white/[0.09] hover:text-[#F2F5F4]';
}

export const Pill: React.FC<PillProps> = ({
  active = false,
  label,
  count,
  icon,
  variant = 'default',
  children,
  className = '',
  disabled = false,
  ...props
}) => {
  const content = label ?? children;
  const baseStyles =
    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all border select-none focus:outline-none focus:ring-1 focus:ring-white/30 shrink-0';
  const stateStyles = getPillStateStyles(disabled, active, variant);

  return (
    <button
      type="button"
      data-testid="surface-pill"
      data-active={active ? 'true' : 'false'}
      disabled={disabled}
      className={`${baseStyles} ${stateStyles} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {content && <span className="truncate">{content}</span>}
      {count !== undefined && count !== null && (
        <span
          data-testid="surface-pill-count"
          className="text-2xs tabular-nums opacity-75 font-mono"
        >
          {count}
        </span>
      )}
    </button>
  );
};
