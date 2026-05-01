import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Dashboard from '@/components/Dashboard';

const DashboardPage: React.FC = () => {
  return (
    <div className="trust-page min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 md:py-10">
        <Dashboard />
      </main>
      <Footer />
    </div>
  );
};

export default DashboardPage;
