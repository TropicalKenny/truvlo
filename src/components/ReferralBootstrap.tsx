import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';

const STORAGE_KEY = 'escrowpay_pending_referral_code';

function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase();
}

function isReferralCodeCandidate(value: string): boolean {
  return /^[A-Z0-9]{4,32}$/.test(value);
}

const ReferralBootstrap: React.FC = () => {
  const location = useLocation();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const appliedCodeRef = useRef<string | null>(null);
  const bootstrapCompleteRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const referral = params.get('ref');
    if (!referral) return;

    const normalized = normalizeReferralCode(referral);
    if (!isReferralCodeCandidate(normalized)) return;

    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // non-blocking
    }
  }, [location.search]);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      bootstrapCompleteRef.current = false;
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      if (bootstrapCompleteRef.current) return;
      bootstrapCompleteRef.current = true;

      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;

        await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const pendingCode = (() => {
          try {
            return localStorage.getItem(STORAGE_KEY);
          } catch {
            return null;
          }
        })();

        if (!pendingCode || pendingCode === appliedCodeRef.current || cancelled) return;

        const response = await fetch('/api/referrals', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ referred_by_code: pendingCode }),
        });

        if (response.ok) {
          appliedCodeRef.current = pendingCode;
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // non-blocking
          }
          return;
        }

        const status = response.status;
        if ([400, 404, 409].includes(status)) {
          appliedCodeRef.current = pendingCode;
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // non-blocking
          }
        }
      } catch {
        bootstrapCompleteRef.current = false;
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, ready]);

  return null;
};

export default ReferralBootstrap;
