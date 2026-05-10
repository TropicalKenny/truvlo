import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { AlertTriangle, ArrowRight, CheckCircle2, Coins, FileCheck2, Shield, Timer, Users } from 'lucide-react';

const ledgerRules = [
  {
    icon: Shield,
    control: 'Escrow custody',
    state: 'On-chain',
    stateClass: 'trust-status-blue',
    userImpact: 'Funds sit in the smart contract after payment.',
    riskControl: "Truvlo does not hold client funds in a bank account.",
  },
  {
    icon: Users,
    control: 'Client approval',
    state: 'Required',
    stateClass: 'trust-status-blue',
    userImpact: 'Creators request release when work is ready.',
    riskControl: 'Clients can approve or dispute before funds move.',
  },
  {
    icon: Coins,
    control: 'USDC and SOL',
    state: 'Supported',
    stateClass: 'trust-status-green',
    userImpact: 'Invoices can be paid with the tokens Truvlo supports today.',
    riskControl: 'Amount and token stay visible through the invoice record.',
  },
  {
    icon: AlertTriangle,
    control: 'Managed disputes',
    state: 'Frozen',
    stateClass: 'trust-status-amber',
    userImpact: 'Disputed funds stop moving while evidence is reviewed.',
    riskControl: 'Admin-operated resolution records the final outcome.',
  },
  {
    icon: Timer,
    control: 'Release window',
    state: '7 days',
    stateClass: 'trust-status-blue',
    userImpact: 'Creators are not stuck forever after requesting release.',
    riskControl: 'The client still has time to respond before timeout.',
  },
  {
    icon: FileCheck2,
    control: 'Account record',
    state: 'Tracked',
    stateClass: 'trust-status-green',
    userImpact: 'Completed invoices build readable payment history.',
    riskControl: 'Wallet-linked history helps both sides understand context.',
  },
];

const Features: React.FC = () => {
  const { ready, authenticated, login } = usePrivy();
  const navigate = useNavigate();

  return (
    <section className="trust-section py-20" style={{ backgroundColor: 'var(--tl-bg)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div>
            <h2
              className="text-3xl md:text-4xl"
              style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 800, color: 'var(--tl-text)', letterSpacing: '-0.03em' }}
            >
              Controls for programmable escrow
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
              Truvlo shows what was agreed, what was paid, what proof was submitted, and who needs to act next.
            </p>
          </div>
          <button
            onClick={() => {
              if (!ready) return;
              if (authenticated) {
                navigate('/create');
              } else {
                login();
              }
            }}
            disabled={!ready}
            className="trust-button-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm w-full sm:w-fit"
          >
            Create invoice
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="trust-panel overflow-hidden">
          <div className="hidden lg:grid grid-cols-[1.15fr_0.7fr_1.35fr_1.35fr] gap-4 px-5 py-3 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.12)' }}>
            <span className="trust-label">Control</span>
            <span className="trust-label">State</span>
            <span className="trust-label">User impact</span>
            <span className="trust-label">Risk control</span>
          </div>

          {ledgerRules.map((rule) => {
            const Icon = rule.icon;
            return (
              <div
                key={rule.control}
                className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.7fr_1.35fr_1.35fr] gap-3 lg:gap-4 px-5 py-4 border-b last:border-b-0"
                style={{ borderColor: 'rgba(148, 163, 184, 0.12)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--tl-teal-soft)', color: 'var(--tl-teal)' }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--tl-text)', fontFamily: '"DM Sans", sans-serif' }}>
                    {rule.control}
                  </span>
                </div>
                <div>
                  <span className={`trust-status ${rule.stateClass}`}>{rule.state}</span>
                </div>
                <p className="text-sm leading-6" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
                  {rule.userImpact}
                </p>
                <p className="text-sm leading-6" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
                  {rule.riskControl}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 trust-panel-subtle px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--tl-text)', fontFamily: '"DM Sans", sans-serif' }}>
              No autonomous arbitration promise
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
              AI-assisted review can support the workflow, but human-reviewed dispute actions remain the final authority.
            </p>
          </div>
          <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: 'var(--tl-teal)' }} />
        </div>
      </div>
    </section>
  );
};

export default Features;
