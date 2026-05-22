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
  const baseStyle = 'bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-xl flex flex-col';
  const interactiveStyle = interactive
    ? 'hover:border-slate-700 hover:-translate-y-0.5 transition-all cursor-pointer group'
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
