import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'bg-bg-input border text-xs rounded-xl px-4 h-10 focus:outline-none placeholder-text-muted/40 w-full text-text-secondary font-semibold transition-all shadow-inner focus:ring-2 focus:ring-brand-accent/10',
          error
            ? 'border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/10'
            : 'border-border-subtle focus:border-brand-accent',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

