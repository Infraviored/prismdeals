import React from 'react';

export interface EmptyLineProps {
  message?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const EmptyLine: React.FC<EmptyLineProps> = ({
  message,
  actions,
  children,
  className = '',
}) => {
  return (
    <div
      data-testid="surface-empty-line"
      className={`min-h-[56px] w-full px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#0E4A40] text-sm text-[#8FA6A1] ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[#8FA6A1]">
          {message ?? children}
        </span>
      </div>

      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
