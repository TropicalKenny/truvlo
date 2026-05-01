import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CreateInvoiceForm from '@/components/CreateInvoiceForm';

const CreateInvoicePage: React.FC = () => {
  return (
    <div className="trust-page min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full px-4 sm:px-6 py-12">
        <div className="trust-form-shell">
          <div className="mb-8 text-center">
            <h1
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                fontSize: '1.75rem',
                color: '#F8FAFC',
                letterSpacing: '-0.02em',
                marginBottom: '8px',
              }}
            >
              Create Invoice
            </h1>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '15px' }}>
              Send an escrow-protected invoice to your client.
            </p>
          </div>
          <CreateInvoiceForm />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CreateInvoicePage;
