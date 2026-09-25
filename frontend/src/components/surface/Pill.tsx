import React from 'react';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label?: React.ReactNode;
  count?: number | string;
  icon?: React.ReactNode;
}

function getPillStateStyles(disabled: boolean, active: boolean): string {
  if (disabled) {
    return 'opacity-40 cursor-not-allowed bg-transparent border-[#0E4A40]/40 text-[#8FA6A1]';
  }
  if (active) {
    return 'bg-[#0E4A40] text-[#F2F5F4] border-[#F2F5F4] font-medium';
  }
  return 'bg-transparent text-[#8FA6A1] border-[#0E4A40] hover:text-[#F2F5F4] hover:border-[#8FA6A1]';
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
    'inline-flex items-center justify-center gap-1.5 px-3 min-h-[34px] rounded-[3px] text-xs font-medium cursor-pointer transition-colors border select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#E4D6BE] shrink-0';
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
          className="num text-2xs opacity-85 ml-0.5"
        >
          {count}
        </span>
      )}
    </button>
  );
};
