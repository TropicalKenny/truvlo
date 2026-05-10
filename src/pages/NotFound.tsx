import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: 'var(--tl-bg-soft)' }}
    >
      <div className="text-center">
        <p
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: '5rem',
            color: 'rgba(255,255,255,0.06)',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginBottom: '16px',
          }}
        >
          404
        </p>
        <h1
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 600,
            fontSize: '1.25rem',
            color: '#F8FAFC',
            marginBottom: '8px',
          }}
        >
          Page not found
        </h1>
        <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '28px' }}>
          The page you're looking for doesn't exist.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 24px',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#F8FAFC',
            fontFamily: '"DM Sans", sans-serif',
            fontSize: '14px',
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'opacity 150ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
