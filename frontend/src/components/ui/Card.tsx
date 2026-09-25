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
  const baseStyle = 'bg-[#06322C] border border-[#0E4A40] rounded-[3px] text-[#F2F5F4] flex flex-col';
  const interactiveStyle = interactive
    ? 'hover:border-[#8FA6A1] transition-colors cursor-pointer'
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
