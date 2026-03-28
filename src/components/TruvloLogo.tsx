import React from 'react';

interface TruvloLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TruvloLogo: React.FC<TruvloLogoProps> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-4xl',
  };

  return (
    <span
      className={`font-space font-bold tracking-tight leading-none ${sizeClasses[size]} ${className}`}
      style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700 }}
    >
      <span style={{ color: '#2DD4BF' }}>T</span>
      <span style={{ color: '#F8FAFC' }}>ruvlo</span>
    </span>
  );
};

export default TruvloLogo;
