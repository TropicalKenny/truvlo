import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import InvoicePayment from '@/components/InvoicePayment';
import { AlertCircle, RefreshCw } from 'lucide-react';

// Error Boundary — preserved exactly from original
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PaymentErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[PaymentPage] Error caught by boundary:', error);
    console.error('[PaymentPage] Error info:', errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="trust-form-card max-w-md mx-auto p-10 text-center"
        >
          <AlertCircle className="h-10 w-10 mx-auto mb-4" style={{ color: '#EF4444' }} />
          <h3
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 600,
              fontSize: '1.125rem',
              color: '#F8FAFC',
              marginBottom: '8px',
            }}
          >
            Something went wrong
          </h3>
          <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '8px' }}>
            We encountered an error loading this page.
          </p>
          {this.state.error && (
            <p
              className="text-xs rounded-lg p-3 mb-6"
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                color: '#64748B',
                backgroundColor: 'var(--tl-surface-3)',
              }}
            >
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
              cursor: 'pointer',
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PaymentPage: React.FC = () => {
  return (
    <div className="trust-page min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full px-4 sm:px-6 py-12">
        <PaymentErrorBoundary>
          <InvoicePayment />
        </PaymentErrorBoundary>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentPage;
