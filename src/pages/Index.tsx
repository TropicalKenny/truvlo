import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import HowItWorks from '@/components/HowItWorks';
import Features from '@/components/Features';
import Footer from '@/components/Footer';

const Index: React.FC = () => {
  const { authenticated, ready } = usePrivy();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && authenticated) navigate('/dashboard', { replace: true });
  }, [ready, authenticated, navigate]);

  return (
    <div className="trust-page min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
