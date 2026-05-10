import React from 'react';

interface TruvloLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TruvloLogo: React.FC<TruvloLogoProps> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-4xl',
  };

  return (
    <span
      aria-label="Truvlo"
      className={`font-space font-bold leading-none ${sizeClasses[size]} ${className}`}
      style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, letterSpacing: 0 }}
    >
      <span style={{ color: 'var(--tl-text)' }}>TRU</span>
      <span style={{ color: 'var(--tl-brand)' }}>V</span>
      <span style={{ color: 'var(--tl-text)' }}>LO</span>
    </span>
  );
};

export default TruvloLogo;
