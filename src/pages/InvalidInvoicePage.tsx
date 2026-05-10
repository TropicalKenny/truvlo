import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const InvalidInvoicePage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--tl-bg-soft)' }}>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-12">
        <div
          className="max-w-md mx-auto rounded-xl p-10 text-center"
          style={{ backgroundColor: 'var(--tl-surface-2)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <AlertCircle className="h-10 w-10 mx-auto mb-5" style={{ color: '#EF4444' }} />

          <h1
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 600,
              fontSize: '1.25rem',
              color: '#F8FAFC',
              marginBottom: '10px',
            }}
          >
            Incomplete Invoice Link
          </h1>

          <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '16px', lineHeight: 1.6 }}>
            {invoiceId ? (
              <>
                Invoice{' '}
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px' }}>{invoiceId}</span>{' '}
                requires the creator address to load.
              </>
            ) : (
              'The invoice link is invalid or incomplete.'
            )}
          </p>

          <div className="rounded-lg p-4 text-left mb-7" style={{ backgroundColor: 'var(--tl-surface-3)' }}>
            <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
              Expected format
            </p>
            <p
              className="break-all"
              style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: '#94A3B8', lineHeight: 1.6 }}
            >
              {window.location.origin}/invoice/INV-XXXXXXXX/CreatorWalletAddress
            </p>
          </div>

          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Go Home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default InvalidInvoicePage;
