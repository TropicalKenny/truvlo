import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrivyClient } from '@privy-io/server-auth';
import { createClient } from '@supabase/supabase-js';

const privy = new PrivyClient(
  process.env.VITE_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyToken(req: VercelRequest): Promise<string | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    return claims.userId;
  } catch {
    return null;
  }
}

function generateSlug(displayName: string | null): string {
  const suffix = Math.random().toString(16).slice(2, 6);
  if (displayName) {
    const base = displayName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 30);
    return base ? `${base}-${suffix}` : `user-${suffix}`;
  }
  return `user-${suffix}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const privyId = await verifyToken(req);
    if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

    const { wallet_address } = req.body as { wallet_address?: string };
    if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });

    // Register the wallet
    const { error: walletError } = await supabase
      .from('wallets')
      .upsert({ privy_id: privyId, wallet_address }, { onConflict: 'privy_id,wallet_address' });
    if (walletError) return res.status(500).json({ error: walletError.message });

    // Ensure profile exists and has a slug
    const { data: profile } = await supabase
      .from('profiles')
      .select('profile_slug, display_name')
      .eq('privy_id', privyId)
      .maybeSingle();

    let slug = profile?.profile_slug ?? null;

    if (!slug) {
      slug = generateSlug(profile?.display_name ?? null);
      await supabase
        .from('profiles')
        .upsert({ privy_id: privyId, profile_slug: slug }, { onConflict: 'privy_id' });
    }

    return res.status(200).json({ profile_slug: slug });
  }

  if (req.method === 'DELETE') {
    const privyId = await verifyToken(req);
    if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

    const { wallet_address } = req.body as { wallet_address?: string };
    if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });

    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('privy_id', privyId)
      .eq('wallet_address', wallet_address);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
