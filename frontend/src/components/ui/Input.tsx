import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`bg-slate-950 border text-xs rounded-xl px-4 py-3 focus:outline-none placeholder-slate-700 w-full text-slate-200 font-semibold transition-all shadow-inner ${
          error
            ? 'border-rose-500/50 focus:border-rose-500'
            : 'border-slate-800 focus:border-emerald-500'
        } ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
