import type { VercelRequest, VercelResponse } from '@vercel/node';

// Resend API — free tier: 3,000 emails/month
// Set RESEND_API_KEY in Vercel environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'notifications@truvlo.io';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invoiceId, clientEmail, creatorWallet, amount, description, senderName, invoiceUrl } = req.body;

  if (!invoiceId || !clientEmail || !creatorWallet || !amount || !invoiceUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const shortCreator = `${creatorWallet.slice(0, 8)}...${creatorWallet.slice(-8)}`;

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Release requested — ${invoiceId}</title>
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
                Release requested
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
                ${senderName ? `<strong style="color:#F8FAFC;">${senderName}</strong> has marked work as complete and is requesting release of funds from escrow.` : 'The creator has marked work as complete and requested release of funds from escrow.'}
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
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Amount in escrow</span>
                    <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#F8FAFC;letter-spacing:-0.02em;">${amount}</p>
                  </td>
                </tr>
                ${description ? `
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Work description</span>
                    <p style="margin:4px 0 0;font-size:14px;color:#F8FAFC;">${description}</p>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;">Creator</span>
                    <p style="margin:4px 0 0;font-size:13px;color:#94A3B8;font-family:monospace;">${shortCreator}</p>
                  </td>
                </tr>
              </table>

              <!-- What this means -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#1C2128;border-radius:8px;border-left:3px solid #2DD4BF;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:500;color:#F8FAFC;">You have 7 days to respond</p>
                    <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
                      Review the work and approve the release, or raise a dispute if there's an issue.
                      If you don't respond within 7 days, funds will automatically release to the creator.
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
                      Review &amp; Respond
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#64748B;text-align:center;line-height:1.6;">
                Or copy this link: <a href="${invoiceUrl}" style="color:#2DD4BF;">${invoiceUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0;font-size:12px;color:#64748B;line-height:1.6;">
                You received this because your email was provided when this invoice was created.
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
        to: [clientEmail],
        subject: `Release requested — ${senderName || shortCreator} is asking for payment (${invoiceId})`,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
