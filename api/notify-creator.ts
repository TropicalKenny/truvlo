import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'notifications@truvlo.io';

type EventType = 'paid' | 'release_approved' | 'disputed';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { invoiceId, creatorWallet, event, amount } = req.body as {
    invoiceId?: string;
    creatorWallet?: string;
    event?: EventType;
    amount?: string;
  };

  if (!invoiceId || !creatorWallet || !event) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

  // Look up invoice metadata (description only — creator_email does not exist in invoice_meta)
  const { data: meta } = await supabase
    .from('invoice_meta')
    .select('sender_name, description')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', creatorWallet)
    .maybeSingle();

  // FIX: creator email lives in profiles, joined via profile_wallets → profiles.email
  // invoice_meta has no creator_email column per the schema in AGENT_CONTEXT
  const { data: walletRow } = await supabase
    .from('wallets')
    .select('privy_id')
    .eq('wallet_address', creatorWallet)
    .maybeSingle();

  const { data: profile } = walletRow
    ? await supabase
        .from('profiles')
        .select('notification_email')
        .eq('privy_id', walletRow.privy_id)
        .maybeSingle()
    : { data: null };

  console.log('walletRow:', JSON.stringify(walletRow));
console.log('profile:', JSON.stringify(profile));
console.log('creatorEmail:', profile?.notification_email);
const creatorEmail = profile?.notification_email;
  if (!creatorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(creatorEmail)) {
    // No email on record — not an error, just skip silently
    return res.status(200).json({ success: true, skipped: true });
  }

  const shortWallet = `${creatorWallet.slice(0, 8)}...${creatorWallet.slice(-8)}`;
  const dashboardUrl = `https://truvlo.io/dashboard`;

  const eventConfig: Record<EventType, { subject: string; headline: string; body: string; accent: string }> = {
    paid: {
      subject: `Payment received — ${invoiceId}`,
      headline: 'Your invoice was paid',
      body: `Your client has paid <strong style="color:#F8FAFC;">${amount || 'the invoice amount'}</strong> into escrow. Funds are secured in the smart contract until you request release.`,
      accent: '#2DD4BF',
    },
    release_approved: {
      subject: `Release approved — ${invoiceId}`,
      headline: 'Client approved your release request',
      body: `Your client has approved the release of funds for <strong style="color:#F8FAFC;">${invoiceId}</strong>. You can now release the funds to your wallet from your dashboard.`,
      accent: '#4ADE80',
    },
    disputed: {
      subject: `Dispute raised — ${invoiceId}`,
      headline: 'Client raised a dispute',
      body: `Your client has raised a dispute on <strong style="color:#F8FAFC;">${invoiceId}</strong>. Funds are frozen while the dispute is under review. A mediator will contact both parties.`,
      accent: '#FCD34D',
    },
  };

  const { subject, headline, body, accent } = eventConfig[event];

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0D1117;border-radius:12px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="font-size:22px;font-weight:700;color:#F8FAFC;letter-spacing:-0.02em;">
                <span style="color:#2DD4BF;">T</span>ruvlo
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#F8FAFC;letter-spacing:-0.01em;">
                ${headline}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
                ${body}
              </p>

              <!-- Invoice details -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#161B22;border-radius:8px;border:1px solid rgba(255,255,255,0.08);margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Invoice</span>
                    <p style="margin:4px 0 0;font-size:14px;color:#F8FAFC;font-family:monospace;">${invoiceId}</p>
                  </td>
                </tr>
                ${amount ? `
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Amount</span>
                    <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#F8FAFC;letter-spacing:-0.02em;">${amount}</p>
                  </td>
                </tr>` : ''}
                ${meta?.description ? `
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Work description</span>
                    <p style="margin:4px 0 0;font-size:14px;color:#F8FAFC;">${meta.description}</p>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Creator wallet</span>
                    <p style="margin:4px 0 0;font-size:13px;color:#94A3B8;font-family:monospace;">${shortWallet}</p>
                  </td>
                </tr>
              </table>

              <!-- Accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#1C2128;border-radius:8px;border-left:3px solid ${accent};margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 20px;">
                    <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
                      ${event === 'paid' ? 'Go to your dashboard to request release when you\'re ready.' : ''}
                      ${event === 'release_approved' ? 'Head to your dashboard to complete the release.' : ''}
                      ${event === 'disputed' ? 'Log in to your dashboard for more details. A mediator will review the dispute.' : ''}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                      style="display:inline-block;background:#2DD4BF;color:#0D1117;font-size:15px;font-weight:500;
                             text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:-0.01em;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0;font-size:12px;color:#64748B;line-height:1.6;">
                You received this because you set this email as your notification address in Truvlo.
                Truvlo is a smart contract escrow platform on Solana.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Truvlo <${FROM_EMAIL}>`,
        to: [creatorEmail],
        subject,
        html: emailHtml,
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
