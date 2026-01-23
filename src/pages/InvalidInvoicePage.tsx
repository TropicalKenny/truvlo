import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const InvalidInvoicePage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-10">
        <Card className="max-w-md mx-auto">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
            
            <h1 className="text-xl font-semibold text-foreground mb-2">
              Incomplete Invoice Link
            </h1>
            
            <p className="text-sm text-muted-foreground mb-4">
              {invoiceId ? (
                <>Invoice <span className="font-mono">{invoiceId}</span> requires the creator address.</>
              ) : (
                'The invoice link is invalid.'
              )}
            </p>
            
            <div className="p-3 rounded bg-muted text-left mb-6">
              <p className="text-xs text-muted-foreground mb-1">Expected format:</p>
              <p className="text-xs font-mono text-foreground break-all">
                {window.location.origin}/invoice/INV-XXXXXXXX/CreatorAddress
              </p>
            </div>
            
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default InvalidInvoicePage;
