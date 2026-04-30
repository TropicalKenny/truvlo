import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

type TokenType = 'USDC' | 'SOL';

export interface AuthProfile {
  display_name: string | null;
  default_token: TokenType;
  profile_slug: string | null;
  notification_email: string | null;
  referral_code: string | null;
  referred_by_code: string | null;
  referral_linked_at: string | null;
  onboarding_completed_at: string | null;
}

interface AuthProfileContextValue {
  profile: AuthProfile | null;
  profileReady: boolean;
  profileLoading: boolean;
  profileFromCache: boolean;
  refreshProfile: () => Promise<AuthProfile | null>;
}

const AuthProfileContext = createContext<AuthProfileContextValue | undefined>(undefined);
const CACHE_PREFIX = 'truvlo_auth_profile';

function readCachedProfile(cacheKey: string | null): AuthProfile | null {
  if (!cacheKey || typeof window === 'undefined') return null;
  try {
    const cached = window.localStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) as AuthProfile : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(cacheKey: string | null, profile: AuthProfile | null) {
  if (!cacheKey || typeof window === 'undefined') return;
  try {
    if (profile) window.localStorage.setItem(cacheKey, JSON.stringify(profile));
    else window.localStorage.removeItem(cacheKey);
  } catch {
    // localStorage can be unavailable in private contexts; profile still works in memory.
  }
}

export const AuthProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const userId = user?.id ?? null;
  const cacheKey = userId ? `${CACHE_PREFIX}:${userId}` : null;
  const previousCacheKey = useRef<string | null>(null);

  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFromCache, setProfileFromCache] = useState(false);
  const profileRef = useRef<AuthProfile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const refreshProfile = useCallback(async () => {
    if (!ready || !authenticated) {
      setProfile(null);
      setProfileReady(ready);
      setProfileLoading(false);
      setProfileFromCache(false);
      return null;
    }

    setProfileLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setProfileReady(true);
        return null;
      }

      const res = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setProfileReady(true);
        return profileRef.current;
      }

      const freshProfile = await res.json() as AuthProfile;
      setProfile(freshProfile);
      setProfileFromCache(false);
      setProfileReady(true);
      writeCachedProfile(cacheKey, freshProfile);
      return freshProfile;
    } catch {
      setProfileReady(true);
      return profileRef.current;
    } finally {
      setProfileLoading(false);
    }
  }, [authenticated, cacheKey, getAccessToken, ready]);

  useEffect(() => {
    if (!ready) {
      setProfileReady(false);
      return;
    }

    if (!authenticated) {
      if (previousCacheKey.current) writeCachedProfile(previousCacheKey.current, null);
      previousCacheKey.current = null;
      setProfile(null);
      setProfileReady(true);
      setProfileLoading(false);
      setProfileFromCache(false);
      return;
    }

    if (previousCacheKey.current && previousCacheKey.current !== cacheKey) {
      writeCachedProfile(previousCacheKey.current, null);
      setProfile(null);
    }
    previousCacheKey.current = cacheKey;

    const cachedProfile = readCachedProfile(cacheKey);
    if (cachedProfile) {
      setProfile(cachedProfile);
      setProfileFromCache(true);
      setProfileReady(true);
    } else {
      setProfileReady(false);
    }

    void refreshProfile();
  }, [authenticated, cacheKey, ready, refreshProfile]);

  const value = useMemo<AuthProfileContextValue>(() => ({
    profile,
    profileReady,
    profileLoading,
    profileFromCache,
    refreshProfile,
  }), [profile, profileFromCache, profileLoading, profileReady, refreshProfile]);

  return <AuthProfileContext.Provider value={value}>{children}</AuthProfileContext.Provider>;
};

export function useAuthProfile() {
  const context = useContext(AuthProfileContext);
  if (!context) throw new Error('useAuthProfile must be used within AuthProfileProvider');
  return context;
}
