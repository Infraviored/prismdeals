import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'action-emerald' | 'action-sky' | 'action-indigo' | 'badge' | 'mini-emerald' | 'mini-slate' | 'icon';
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
  const baseStyle = 'inline-flex items-center justify-center font-bold transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-98';

  const variants = {
    primary: 'bg-brand-accent hover:bg-[#f09587] text-white rounded-xl shadow-lg shadow-brand-accent/10 hover:shadow-[#f09587]/20',
    secondary: 'bg-bg-input hover:bg-bg-surface border border-border-subtle text-text-muted hover:text-text-primary rounded-xl',
    'action-emerald': 'bg-bg-surface hover:bg-bg-surface-hover text-text-muted hover:text-brand-accent border border-border-subtle rounded-xl shadow-sm',
    'action-sky': 'bg-bg-surface hover:bg-bg-surface-hover text-text-muted hover:text-sky-400 border border-border-subtle rounded-xl shadow-sm',
    'action-indigo': 'bg-bg-surface hover:bg-bg-surface-hover text-text-muted hover:text-indigo-400 border border-border-subtle rounded-xl shadow-sm',
    badge: 'text-text-muted hover:text-text-primary bg-bg-surface hover:bg-bg-surface-hover border border-border-subtle rounded-xl',
    'mini-emerald': 'bg-brand-accent hover:bg-[#f09587] text-white rounded font-bold transition-colors',
    'mini-slate': 'bg-bg-surface hover:bg-bg-surface-hover text-text-muted rounded transition-colors',
    icon: 'rounded-xl bg-bg-surface/80 hover:bg-bg-surface-hover/80 text-text-muted hover:text-brand-accent border border-border-subtle hover:border-brand-accent/30 shadow-md group',
  };

  const sizes = {
    xs: 'text-[9px] px-2 py-0.5',
    sm: 'text-xs px-3 py-1.5',
    md: 'text-xs px-4 py-2.5',
    lg: 'text-xs py-3 px-6',
  };

  const isBtnDisabled = disabled || loading;

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isBtnDisabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-current"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
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
