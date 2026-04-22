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

// Safely read from localStorage without throwing.
function readPendingCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Safely remove from localStorage without throwing.
function clearPendingCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // non-blocking
  }
}

const ReferralBootstrap: React.FC = () => {
  const location = useLocation();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const appliedCodeRef = useRef<string | null>(null);
  const bootstrapCompleteRef = useRef(false);

  // Capture ?ref= into localStorage whenever the query param is present.
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

  // FIX: When the user logs out, clear any pending referral code from localStorage
  // so it cannot be inherited by the next session on a shared device.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      bootstrapCompleteRef.current = false;
      appliedCodeRef.current = null;
      clearPendingCode();
    }
  }, [ready, authenticated]);

  // On login, apply the pending code — but only after verifying the server
  // has not already set referred_by_code for this account.
  useEffect(() => {
    if (!ready || !authenticated) return;

    let cancelled = false;

    const bootstrap = async () => {
      if (bootstrapCompleteRef.current) return;
      bootstrapCompleteRef.current = true;

      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;

        // Fetch profile to ensure the user row exists AND to check the
        // server-side referred_by_code state before doing anything.
        const profileRes = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!profileRes.ok || cancelled) return;

        const profile = await profileRes.json() as {
          referred_by_code?: string | null;
        };

        // FIX: If the server already has a referral code recorded, discard the
        // pending localStorage value — nothing to do.
        if (profile.referred_by_code) {
          clearPendingCode();
          return;
        }

        const pendingCode = readPendingCode();
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
          clearPendingCode();
          return;
        }

        // 400 / 404 / 409 all mean we should not retry — discard.
        const status = response.status;
        if ([400, 404, 409].includes(status)) {
          appliedCodeRef.current = pendingCode;
          clearPendingCode();
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
