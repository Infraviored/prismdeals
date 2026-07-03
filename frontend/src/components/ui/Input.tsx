import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`bg-bg-input border text-xs rounded-xl px-4 py-3 focus:outline-none placeholder-text-muted/40 w-full text-text-secondary font-semibold transition-all shadow-inner ${
          error
            ? 'border-rose-500/50 focus:border-rose-500'
            : 'border-border-subtle focus:border-brand-accent'
        } ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
