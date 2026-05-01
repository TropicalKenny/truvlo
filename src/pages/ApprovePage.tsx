import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ApproveRelease from '@/components/ApproveRelease';

const ApprovePage: React.FC = () => {
  return (
    <div className="trust-page min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full px-4 sm:px-6 py-12">
        <ApproveRelease />
      </main>
      <Footer />
    </div>
  );
};

export default ApprovePage;
