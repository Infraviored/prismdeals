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
          'bg-[#00100F] border text-sm rounded-[3px] px-3.5 min-h-[42px] focus:outline-none placeholder-[#8FA6A1]/40 w-full text-[#F2F5F4] transition-colors',
          error
            ? 'border-[#E87967] focus:border-[#E87967]'
            : 'border-[#0E4A40] focus:border-[#8FA6A1]',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
