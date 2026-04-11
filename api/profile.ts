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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const privyId = await verifyToken(req);
    if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, default_token, profile_slug, notification_email, email, created_at')
      .eq('privy_id', privyId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      display_name: data?.display_name ?? null,
      default_token: data?.default_token ?? 'USDC',
      profile_slug: data?.profile_slug ?? null,
      notification_email: data?.notification_email ?? null,
    });
  }

  if (req.method === 'PATCH') {
    const privyId = await verifyToken(req);
    if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

    const { display_name, default_token, notification_email } = req.body as {
      display_name?: string;
      default_token?: string;
      notification_email?: string;
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

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          privy_id: privyId,
          display_name: trimmed || null,
          default_token: tokenValue,
          ...(emailTrimmed !== undefined ? { notification_email: emailTrimmed } : {}),
        },
        { onConflict: 'privy_id' }
      );

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ display_name: trimmed || null, default_token: tokenValue, notification_email: emailTrimmed ?? null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
