import React from 'react';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label?: React.ReactNode;
  count?: number | string;
  icon?: React.ReactNode;
}

function getPillStateStyles(disabled: boolean, active: boolean): string {
  if (disabled) {
    return 'opacity-40 cursor-not-allowed bg-white/[0.02] border-transparent text-[#9FB3B0]';
  }
  if (active) {
    return 'bg-white/[0.14] text-[#F2F5F4] border-white/20 shadow-sm font-semibold';
  }
  return 'bg-white/[0.05] text-[#9FB3B0] border-transparent hover:bg-white/[0.09] hover:text-[#F2F5F4]';
}

export const Pill: React.FC<PillProps> = ({
  active = false,
  label,
  count,
  icon,
  children,
  className = '',
  disabled = false,
  ...props
}) => {
  const content = label ?? children;
  const baseStyles =
    'inline-flex items-center justify-center gap-1.5 px-3 min-h-[36px] rounded-full text-xs font-medium cursor-pointer transition-all border select-none focus:outline-none focus:ring-1 focus:ring-white/30 shrink-0';
  const stateStyles = getPillStateStyles(disabled, active);

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
