import React from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'quiet'
    | 'badge'
    | 'icon'
    | 'action-emerald'
    | 'action-sky'
    | 'action-indigo'
    | 'mini-emerald'
    | 'mini-slate';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const baseStyle =
    'inline-flex items-center justify-center font-semibold transition-colors duration-150 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed shrink-0 select-none cursor-pointer';

  const variants: Record<string, string> = {
    primary: 'bg-[#E4D6BE] hover:bg-[#F0E4CE] text-[#011F1F] border border-[#E4D6BE] rounded-[3px]',
    secondary: 'bg-transparent hover:border-[#8FA6A1] border border-[#0E4A40] text-[#F2F5F4] rounded-[3px]',
    danger: 'bg-transparent hover:border-[#E87967] border border-[#0E4A40] text-[#8FA6A1] hover:text-[#F2F5F4] rounded-[3px]',
    quiet: 'bg-transparent hover:border-[#8FA6A1] border border-transparent text-[#8FA6A1] hover:text-[#F2F5F4] rounded-[3px]',
    badge: 'text-[#8FA6A1] hover:text-[#F2F5F4] bg-transparent border border-[#0E4A40] rounded-[3px]',
    icon: 'rounded-[3px] bg-transparent hover:border-[#8FA6A1] text-[#8FA6A1] hover:text-[#F2F5F4] border border-[#0E4A40]',
    // Backward-compatible mappings
    'action-emerald': 'bg-transparent hover:border-[#8FA6A1] text-[#F2F5F4] border border-[#0E4A40] rounded-[3px]',
    'action-sky': 'bg-transparent hover:border-[#8FA6A1] text-[#F2F5F4] border border-[#0E4A40] rounded-[3px]',
    'action-indigo': 'bg-transparent hover:border-[#8FA6A1] text-[#F2F5F4] border border-[#0E4A40] rounded-[3px]',
    'mini-emerald': 'bg-[#E4D6BE] hover:bg-[#F0E4CE] text-[#011F1F] border border-[#E4D6BE] rounded-[3px] text-xs font-semibold',
    'mini-slate': 'bg-transparent hover:border-[#8FA6A1] text-[#8FA6A1] border border-[#0E4A40] rounded-[3px] text-xs',
  };

  const sizes = {
    xs: 'min-h-[36px] px-2.5 text-xs rounded-[3px] gap-1',
    sm: 'min-h-[40px] px-3.5 text-sm rounded-[3px] gap-1.5 whitespace-nowrap',
    md: 'min-h-[42px] px-4 text-sm rounded-[3px] gap-1.5 whitespace-nowrap',
    lg: 'min-h-[46px] px-5 text-base rounded-[3px] gap-2',
  };

  const isBtnDisabled = disabled || loading;
  const finalSizeClass = variant === 'icon' && !props.style?.width && !className.includes('w-')
    ? (size === 'lg' ? 'min-h-[44px] min-w-[44px] p-2.5' : 'min-h-[40px] min-w-[40px] p-2')
    : sizes[size];

  return (
    <button
      className={cn(baseStyle, variants[variant], finalSizeClass, className)}
      disabled={isBtnDisabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-current shrink-0"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};
