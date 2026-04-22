import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureReferralCode, requireUserId, supabase } from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const privyId = await requireUserId(req);
    if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

    const referralCode = await ensureReferralCode(supabase, privyId);
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, default_token, profile_slug, notification_email, email, created_at, referral_code, referred_by_code, referral_linked_at')
      .eq('privy_id', privyId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      display_name: data?.display_name ?? null,
      default_token: data?.default_token ?? 'USDC',
      profile_slug: data?.profile_slug ?? null,
      notification_email: data?.notification_email ?? null,
      referral_code: referralCode ?? data?.referral_code ?? null,
      referred_by_code: data?.referred_by_code ?? null,
      referral_linked_at: data?.referral_linked_at ?? null,
    });
  }

  if (req.method === 'PATCH') {
    const privyId = await requireUserId(req);
    if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

    const { display_name, default_token, notification_email, referred_by_code } = req.body as {
      display_name?: string;
      default_token?: string;
      notification_email?: string;
      referred_by_code?: string | null;
    };

    if (typeof display_name !== 'string') {
      return res.status(400).json({ error: 'display_name must be a string' });
    }
    const trimmed = display_name.trim().slice(0, 50);
    const tokenValue = default_token === 'SOL' ? 'SOL' : 'USDC';
    const emailTrimmed = typeof notification_email === 'string' ? notification_email.trim().toLowerCase() || null : undefined;
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return res.status(400).json({ error: 'Invalid notification email' });
    }

    const referralCode = await ensureReferralCode(supabase, privyId);
    const referredByCode = typeof referred_by_code === 'string' ? referred_by_code.trim().toUpperCase() : null;
    if (referredByCode && referredByCode === referralCode) {
      return res.status(400).json({ error: 'You cannot refer yourself' });
    }
    if (referredByCode) {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('privy_id')
        .eq('referral_code', referredByCode)
        .maybeSingle();
      if (!referrer) {
        return res.status(404).json({ error: 'Referral code not found' });
      }
      const { data: current } = await supabase
        .from('profiles')
        .select('referred_by_code')
        .eq('privy_id', privyId)
        .maybeSingle();
      if (current?.referred_by_code && current.referred_by_code !== referredByCode) {
        return res.status(409).json({ error: 'Referral code already set' });
      }
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          privy_id: privyId,
          display_name: trimmed || null,
          default_token: tokenValue,
          ...(emailTrimmed !== undefined ? { notification_email: emailTrimmed } : {}),
          ...(referredByCode ? { referred_by_code: referredByCode, referral_linked_at: new Date().toISOString() } : {}),
          referral_code: referralCode,
        },
        { onConflict: 'privy_id' }
      );

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      display_name: trimmed || null,
      default_token: tokenValue,
      notification_email: emailTrimmed ?? null,
      referral_code: referralCode,
      referred_by_code: referredByCode,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
