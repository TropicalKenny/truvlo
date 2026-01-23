import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import InvoicePayment from '@/components/InvoicePayment';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

// Error Boundary to catch any uncaught errors
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
        <Card className="max-w-md mx-auto">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h3>
            <p className="text-sm text-muted-foreground mb-2">
              We encountered an error loading this page.
            </p>
            {this.state.error && (
              <p className="text-xs text-muted-foreground mb-4 font-mono p-2 bg-muted rounded">
                {this.state.error.message}
              </p>
            )}
            <Button onClick={this.handleRetry} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

const PaymentPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-10">
        <PaymentErrorBoundary>
          <InvoicePayment />
        </PaymentErrorBoundary>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentPage;
