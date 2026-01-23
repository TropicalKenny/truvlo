import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CreateInvoiceForm from '@/components/CreateInvoiceForm';

const CreateInvoicePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-10">
        <div className="max-w-md mx-auto mb-6 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Create Invoice
          </h1>
          <p className="text-sm text-muted-foreground">
            Send an escrow-protected invoice to your client
          </p>
        </div>
        <CreateInvoiceForm />
      </main>
      <Footer />
    </div>
  );
};

export default CreateInvoicePage;
