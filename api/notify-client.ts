import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared.js';
import { DEFAULT_FROM_EMAIL, PUBLIC_EMAIL_DELIVERY_ERROR, readResendError } from './_email.js';
import { resolveAppOrigin } from './_notify-client-origin.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || DEFAULT_FROM_EMAIL;
const APP_ORIGIN = process.env.APP_ORIGIN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const appOrigin = resolveAppOrigin({
    envOrigin: APP_ORIGIN,
    vercelUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL,
    headers: req.headers,
  });
  if (!appOrigin) {
    console.error('Unable to resolve app origin for notify-client');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  // FIX: invoiceUrl is removed from the destructured body — it is no longer trusted.
  const { invoiceId, creatorWallet, amount, description, senderName } = req.body as {
    invoiceId?: string;
    creatorWallet?: string;
    amount?: string;
    description?: string;
    senderName?: string;
  };

  if (!invoiceId || !creatorWallet || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });
  if (!isValidSolanaAddress(creatorWallet)) {
    return res.status(400).json({ error: 'Invalid creator wallet' });
  }

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  if (!(await walletBelongsToUser(supabase, userId, normalizedCreatorWallet))) {
    return res.status(403).json({ error: 'Creator wallet does not belong to the authenticated user' });
  }

  const { data: meta, error: metaError } = await supabase
    .from('invoice_meta')
    .select('client_email, sender_name, description')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet)
    .maybeSingle();

  if (metaError) return res.status(500).json({ error: metaError.message });

  const clientEmail = meta?.client_email;
  if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return res.status(400).json({ error: 'No client email on record for this invoice' });
  }

  // FIX: Generate approve URL server-side from a trusted, allowlisted origin.
  // invoiceId is already validated to belong to this creator, so it is safe to embed.
  const approveUrl = `${appOrigin}/approve/${encodeURIComponent(invoiceId)}/${encodeURIComponent(normalizedCreatorWallet)}`;

  const shortCreator = `${normalizedCreatorWallet.slice(0, 8)}...${normalizedCreatorWallet.slice(-8)}`;
  const displayName = senderName || meta?.sender_name || '';
  const headline = displayName ? `${displayName} requested withdrawal approval` : 'Withdrawal requested';
  const body = displayName
    ? `<strong style="color:#F8FAFC;">${displayName}</strong> has marked the work complete and requested withdrawal.`
    : 'The creator has marked the work complete and requested withdrawal.';

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
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Amount</div>
        <div style="color:#F8FAFC;font-size:22px;font-weight:700;margin-top:4px;">${amount}</div>
        ${description ? `<div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Description</div><div style="color:#F8FAFC;margin-top:4px;">${description}</div>` : ''}
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Creator</div>
        <div style="color:#94A3B8;font-family:monospace;margin-top:4px;">${shortCreator}</div>
      </div>
      <div style="background:#1C2128;border-left:3px solid #2DD4BF;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="color:#F8FAFC;font-size:13px;font-weight:600;margin-bottom:4px;">You have 7 days to respond</div>
        <div style="color:#94A3B8;font-size:13px;line-height:1.6;">Review the work and approve the withdrawal, or raise a dispute if there is an issue.</div>
      </div>
      <a href="${approveUrl}" style="display:inline-block;background:#2DD4BF;color:#0D1117;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Approve or Dispute</a>
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
        to: [clientEmail],
        subject: `Withdrawal requested - ${displayName || shortCreator} (${invoiceId})`,
        html,
      }),
    });

    if (!response.ok) {
      const resendError = await readResendError(response);
      console.error('Resend error (notify-client):', resendError);
      return res.status(502).json({ error: PUBLIC_EMAIL_DELIVERY_ERROR });
    }

    await supabase
      .from('invoice_meta')
      .update({ creator_privy_id: userId })
      .eq('invoice_id', invoiceId)
      .eq('creator_wallet', normalizedCreatorWallet);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
