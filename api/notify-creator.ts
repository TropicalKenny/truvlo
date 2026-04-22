import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ensureReferralCode,
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'notifications@truvlo.io';

type EventType = 'paid' | 'release_approved' | 'disputed';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const {
    invoiceId,
    creatorWallet,
    clientWallet,
    event,
    amount,
  } = req.body as {
    invoiceId?: string;
    creatorWallet?: string;
    clientWallet?: string;
    event?: EventType;
    amount?: string;
  };

  if (!invoiceId || !creatorWallet || !clientWallet || !event) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });
  if (!isValidSolanaAddress(creatorWallet) || !isValidSolanaAddress(clientWallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  const normalizedClientWallet = normalizeSolanaAddress(clientWallet);

  if (!(await walletBelongsToUser(supabase, userId, normalizedClientWallet))) {
    return res.status(403).json({ error: 'Client wallet does not belong to the authenticated user' });
  }

  const { data: meta, error: metaError } = await supabase
    .from('invoice_meta')
    .select('sender_name, description, client_wallet')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet)
    .maybeSingle();

  if (metaError) return res.status(500).json({ error: metaError.message });
  if (meta?.client_wallet && meta.client_wallet !== normalizedClientWallet) {
    return res.status(403).json({ error: 'Client wallet does not match this invoice' });
  }

  const { data: walletRow } = await supabase
    .from('wallets')
    .select('privy_id')
    .eq('wallet_address', normalizedCreatorWallet)
    .maybeSingle();

  if (!walletRow) {
    return res.status(404).json({ error: 'Creator wallet not found' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('notification_email')
    .eq('privy_id', walletRow.privy_id)
    .maybeSingle();

  const creatorEmail = profile?.notification_email;
  if (!creatorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(creatorEmail)) {
    return res.status(200).json({ success: true, skipped: true });
  }

  await ensureReferralCode(supabase, userId);

  await supabase
    .from('invoice_meta')
    .update({
      client_wallet: normalizedClientWallet,
      client_privy_id: userId,
    })
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet);

  const shortWallet = `${normalizedCreatorWallet.slice(0, 8)}...${normalizedCreatorWallet.slice(-8)}`;
  const dashboardUrl = 'https://truvlo.io/dashboard';
  const eventConfig: Record<EventType, { subject: string; headline: string; body: string; accent: string }> = {
    paid: {
      subject: `Payment received — ${invoiceId}`,
      headline: 'Your invoice was paid',
      body: `Your client has paid <strong style="color:#F8FAFC;">${amount || 'the invoice amount'}</strong> into escrow. Funds are held on-chain until release.`,
      accent: '#2DD4BF',
    },
    release_approved: {
      subject: `Release approved — ${invoiceId}`,
      headline: 'Client approved your release request',
      body: `Your client has approved release for <strong style="color:#F8FAFC;">${invoiceId}</strong>. You can now release the funds from your dashboard.`,
      accent: '#4ADE80',
    },
    disputed: {
      subject: `Dispute raised — ${invoiceId}`,
      headline: 'Client raised a dispute',
      body: `Your client has raised a dispute on <strong style="color:#F8FAFC;">${invoiceId}</strong>. Funds are frozen while the case is reviewed by the platform.`,
      accent: '#FCD34D',
    },
  };

  const { subject, headline, body, accent } = eventConfig[event];

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px;">
    <div style="background:#0D1117;border-radius:16px;padding:28px;border:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:20px;font-weight:700;color:#F8FAFC;margin-bottom:16px;">Truvlo</div>
      <h1 style="margin:0 0 8px;font-size:22px;color:#F8FAFC;">${headline}</h1>
      <p style="margin:0 0 20px;color:#94A3B8;line-height:1.6;">${body}</p>
      <div style="background:#161B22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Invoice</div>
        <div style="color:#F8FAFC;font-family:monospace;margin-top:4px;">${invoiceId}</div>
        ${amount ? `<div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Amount</div><div style="color:#F8FAFC;font-size:22px;font-weight:700;margin-top:4px;">${amount}</div>` : ''}
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Creator wallet</div>
        <div style="color:#94A3B8;font-family:monospace;margin-top:4px;">${shortWallet}</div>
      </div>
      <div style="background:#1C2128;border-left:3px solid ${accent};border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="color:#94A3B8;font-size:13px;line-height:1.6;">
          ${event === 'paid' ? 'Go to your dashboard when you are ready to request release.' : ''}
          ${event === 'release_approved' ? 'Go to your dashboard to complete the release.' : ''}
          ${event === 'disputed' ? 'Open the dispute case in your dashboard to review evidence.' : ''}
        </div>
      </div>
      <a href="${dashboardUrl}" style="display:inline-block;background:#2DD4BF;color:#0D1117;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Go to Dashboard</a>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Truvlo <${FROM_EMAIL}>`,
        to: [creatorEmail],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error (notify-creator):', error);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email send error (notify-creator):', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
