import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug query parameter required' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('privy_id, display_name')
    .eq('profile_slug', slug)
    .maybeSingle();

  if (profileError) return res.status(500).json({ error: profileError.message });
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const { data: wallets, error: walletsError } = await supabase
    .from('wallets')
    .select('wallet_address')
    .eq('privy_id', profile.privy_id);

  if (walletsError) return res.status(500).json({ error: walletsError.message });

  return res.status(200).json({
    display_name: profile.display_name ?? null,
    wallet_addresses: (wallets ?? []).map(w => w.wallet_address),
  });
}
