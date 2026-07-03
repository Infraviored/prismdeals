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
    secondary: 'bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-455 hover:text-slate-200 rounded-xl',
    'action-emerald': 'bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-brand-accent border border-slate-800 rounded-xl shadow-sm',
    'action-sky': 'bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-sky-400 border border-slate-800 rounded-xl shadow-sm',
    'action-indigo': 'bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-indigo-400 border border-slate-800 rounded-xl shadow-sm',
    badge: 'text-slate-400 hover:text-slate-200 bg-slate-850 hover:bg-slate-755 border border-slate-800 rounded-xl',
    'mini-emerald': 'bg-brand-accent hover:bg-[#f09587] text-white rounded font-bold transition-colors',
    'mini-slate': 'bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors',
    icon: 'rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-brand-accent border border-slate-700/50 hover:border-brand-accent/30 shadow-md group',
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
