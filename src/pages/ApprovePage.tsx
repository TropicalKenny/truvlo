import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ApproveRelease from '@/components/ApproveRelease';

const ApprovePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-10">
        <ApproveRelease />
      </main>
      <Footer />
    </div>
  );
};

export default ApprovePage;
