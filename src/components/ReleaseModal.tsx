import React from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ReleaseModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: string;
  isReleasing: boolean;
}

const ReleaseModal: React.FC<ReleaseModalProps> = ({
  open,
  onClose,
  onConfirm,
  amount,
  isReleasing,
}) => {
  // amount may be "Installment 1 of 1 (100%)" or "500 USDC" etc.
  // Detect if it's an installment label and split it
  const isInstallmentLabel = amount.toLowerCase().startsWith('installment');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-md border"
        style={{
          backgroundColor: 'var(--tl-surface-2)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 500,
              color: '#F8FAFC',
            }}
          >
            <ArrowUpRight className="h-5 w-5" style={{ color: 'var(--tl-brand)' }} />
            Withdraw to Wallet
          </DialogTitle>
          <DialogDescription
            style={{
              fontFamily: '"DM Sans", sans-serif',
              color: '#94A3B8',
            }}
          >
            The client has already approved this withdrawal. Funds will be
            transferred directly to your wallet. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Amount display */}
        <div
          className="rounded-lg p-5 text-center my-2"
          style={{ backgroundColor: 'var(--tl-surface-3)' }}
        >
          {isInstallmentLabel ? (
            <>
              <p
                className="text-xs uppercase tracking-widest mb-1"
                style={{
                  color: '#64748B',
                  fontFamily: '"DM Sans", sans-serif',
                  letterSpacing: '0.08em',
                }}
              >
                Withdrawing
              </p>
              <p
                style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                  color: '#F8FAFC',
                  letterSpacing: '-0.01em',
                }}
              >
                {amount}
              </p>
            </>
          ) : (
            <>
              <p
                className="text-xs uppercase tracking-widest mb-2"
                style={{
                  color: '#64748B',
                  fontFamily: '"DM Sans", sans-serif',
                  letterSpacing: '0.08em',
                }}
              >
                Withdrawal amount
              </p>
              <p
                style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontWeight: 700,
                  fontSize: '2rem',
                  color: 'var(--tl-brand)',
                  letterSpacing: '-0.02em',
                }}
              >
                {amount}
              </p>
            </>
          )}
        </div>

        <p
          className="text-sm text-center"
          style={{
            color: '#64748B',
            fontFamily: '"DM Sans", sans-serif',
          }}
        >
          Funds go straight to your connected wallet. No further approval needed.
        </p>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isReleasing}
            className="flex-1 border font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              borderColor: 'rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isReleasing}
            className="flex-1 font-medium transition-opacity duration-150 hover:opacity-90"
            style={{
              backgroundColor: 'var(--tl-brand)',
              color: 'var(--tl-bg-soft)',
              fontFamily: '"DM Sans", sans-serif',
              border: 'none',
            }}
          >
            {isReleasing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Withdrawing...
              </>
            ) : (
              'Withdraw to Wallet'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReleaseModal;

