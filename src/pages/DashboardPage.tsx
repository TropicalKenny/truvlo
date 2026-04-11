import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Dashboard from '@/components/Dashboard';

const DashboardPage: React.FC = () => {
  const { authenticated, ready } = usePrivy();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !authenticated) navigate('/', { replace: true });
  }, [ready, authenticated, navigate]);

  if (!ready || !authenticated) return <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }} />;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D1117' }}>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10">
        <Dashboard />
      </main>
      <Footer />
    </div>
  );
};

export default DashboardPage;
