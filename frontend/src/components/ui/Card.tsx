import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  interactive = false,
  className = '',
  children,
  ...props
}) => {
  const baseStyle = 'bg-bg-surface/50 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-xl flex flex-col';
  const interactiveStyle = interactive
    ? 'hover:border-brand-accent/30 hover:-translate-y-0.5 transition-all cursor-pointer group'
    : '';

  return (
    <div
      className={`${baseStyle} ${interactiveStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
