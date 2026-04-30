import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared.js';
import { DEFAULT_FROM_EMAIL, PUBLIC_EMAIL_DELIVERY_ERROR, readResendError } from './_email.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || DEFAULT_FROM_EMAIL;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : '';
    const creatorWallet = typeof req.query.creatorWallet === 'string' ? req.query.creatorWallet : '';

    if (!invoiceId || !creatorWallet) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!isValidSolanaAddress(creatorWallet)) {
      return res.status(400).json({ error: 'Invalid creator wallet' });
    }

    const { data, error } = await supabase
      .from('invoice_meta')
      .select('sender_name, description, token_type, amount')
      .eq('invoice_id', invoiceId)
      .eq('creator_wallet', normalizeSolanaAddress(creatorWallet))
      .maybeSingle();

    if (error) return res.status(500).json({ error: 'Failed to load invoice metadata' });
    if (!data) return res.status(404).json({ error: 'Invoice metadata not found' });

    return res.status(200).json({
      sender_name: data.sender_name,
      description: data.description,
      token_type: data.token_type,
      amount: data.amount,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const privyId = await requireUserId(req);
  if (!privyId) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  // 2. Validate body
  const {
    invoiceId, creatorWallet, clientWallet, clientEmail, senderName,
    description, tokenType, amount, invoiceUrl,
  } = req.body;

  if (!invoiceId || !creatorWallet || !tokenType || amount == null || !invoiceUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!isValidSolanaAddress(creatorWallet)) {
    return res.status(400).json({ error: 'Invalid creator wallet' });
  }
  if (clientWallet && !isValidSolanaAddress(clientWallet)) {
    return res.status(400).json({ error: 'Invalid client wallet' });
  }

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  if (!(await walletBelongsToUser(supabase, privyId, normalizedCreatorWallet))) {
    return res.status(403).json({ error: 'Creator wallet does not belong to the authenticated user' });
  }

  // 3. Look up creator's notification_email from their profile
  let creatorEmail: string | null = null;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notification_email')
      .eq('privy_id', privyId)
      .maybeSingle();
    creatorEmail = profile?.notification_email ?? null;
  } catch { /* non-blocking */ }

  // 4. Write to Supabase invoice_meta
  const { error: dbError } = await supabase.from('invoice_meta').insert({
    invoice_id: invoiceId,
    creator_wallet: normalizedCreatorWallet,
    creator_privy_id: privyId,
    client_wallet: clientWallet ? normalizeSolanaAddress(clientWallet) : null,
    client_email: clientEmail || null,
    sender_name: senderName || null,
    description: description || null,
    token_type: tokenType,
    amount,
    invoice_url: invoiceUrl,
    email_sent: false,
    creator_email: creatorEmail,
  });

  if (dbError) {
    console.error('Supabase insert error:', dbError);
    return res.status(500).json({ error: 'Failed to save invoice metadata' });
  }

  // 4. Send invoice email — non-fatal if it fails
  let emailStatus: 'email_sent' | 'email_skipped' | 'email_error' = 'email_skipped';
  let emailError: string | null = null;
  let resendError: string | null = null;

  if (clientEmail && RESEND_API_KEY) {
    try {
      const shortCreator = `${normalizedCreatorWallet.slice(0, 8)}...${normalizedCreatorWallet.slice(-8)}`;
      const emailHtml = buildInvoiceEmail({
        invoiceId, senderName, amount, tokenType, description, invoiceUrl, shortCreator,
      });

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Truvlo <${FROM_EMAIL}>`,
          to: [clientEmail],
          subject: `${senderName ? senderName + ' sent you an invoice' : 'New invoice'} — ${amount} ${tokenType}`,
          html: emailHtml,
        }),
      });

      if (emailRes.ok) {
        await supabase
          .from('invoice_meta')
          .update({ email_sent: true })
          .eq('invoice_id', invoiceId);
        emailStatus = 'email_sent';
      } else {
        resendError = await readResendError(emailRes);
        console.error('Resend error (create-invoice-meta):', resendError);
        emailStatus = 'email_error';
        emailError = PUBLIC_EMAIL_DELIVERY_ERROR;
      }
    } catch (emailErr) {
      console.error('Email send error (create-invoice-meta):', emailErr);
      emailStatus = 'email_error';
      emailError = PUBLIC_EMAIL_DELIVERY_ERROR;
    }
  }

  return res.status(200).json({ success: true, email_status: emailStatus, email_error: emailError });
}

// ── Email template ─────────────────────────────────────────────────────────────

function buildInvoiceEmail({
  invoiceId, senderName, amount, tokenType, description, invoiceUrl, shortCreator,
}: {
  invoiceId: string;
  senderName?: string;
  amount: number;
  tokenType: string;
  description?: string;
  invoiceUrl: string;
  shortCreator: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${invoiceId}</title>
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
                You have a new invoice
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
                ${senderName
                  ? `<strong style="color:#F8FAFC;">${senderName}</strong> sent you an invoice for payment.`
                  : 'Someone sent you an invoice for payment.'
                } Review the details and pay securely through escrow.
              </p>

              <!-- Invoice details -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#161B22;border-radius:8px;border:1px solid rgba(255,255,255,0.08);margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Invoice ID</span>
                    <p style="margin:4px 0 0;font-size:14px;color:#F8FAFC;font-family:monospace;">${invoiceId}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Amount due</span>
                    <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#F8FAFC;letter-spacing:-0.02em;">${amount} ${tokenType}</p>
                  </td>
                </tr>
                ${description ? `
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Description</span>
                    <p style="margin:4px 0 0;font-size:14px;color:#F8FAFC;">${description}</p>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">From</span>
                    ${senderName
                      ? `<p style="margin:4px 0 2px;font-size:15px;font-weight:500;color:#F8FAFC;">${senderName}</p>
                         <p style="margin:0;font-size:12px;color:#64748B;font-family:monospace;">${shortCreator}</p>`
                      : `<p style="margin:4px 0 0;font-size:13px;color:#94A3B8;font-family:monospace;">${shortCreator}</p>`
                    }
                  </td>
                </tr>
              </table>

              <!-- Escrow guarantee -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#1C2128;border-radius:8px;border-left:3px solid #2DD4BF;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:500;color:#F8FAFC;">Your payment is protected</p>
                    <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
                      Funds are held in a smart contract on Solana — not by any company or individual.
                      You set how funds are released to the creator. You can dispute at any time before releasing.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${invoiceUrl}"
                      style="display:inline-block;background:#2DD4BF;color:#0D1117;font-size:15px;font-weight:500;
                             text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:-0.01em;">
                      Review &amp; Pay Invoice
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#64748B;text-align:center;line-height:1.6;">
                Or copy this link:<br>
                <a href="${invoiceUrl}" style="color:#2DD4BF;word-break:break-all;">${invoiceUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0;font-size:12px;color:#64748B;line-height:1.6;">
                You received this because your email was provided when this invoice was created.
                Truvlo is a smart contract escrow platform on Solana. Your funds are always in your control.
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
}
