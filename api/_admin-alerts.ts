import { DEFAULT_FROM_EMAIL, readResendError } from './_email.js';
import { supabase } from './_shared.js';
import { shortWallet } from './_admin.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || DEFAULT_FROM_EMAIL;
const ADMIN_ALERT_WEBHOOK_URL = process.env.ADMIN_ALERT_WEBHOOK_URL;

type DisputeAlert = {
  invoiceId: string;
  creatorWallet: string;
  clientWallet: string | null;
  openedByRole: string;
  status: string;
  openedAt: string;
};

async function sendAdminEmail(to: string, alert: DisputeAlert) {
  if (!RESEND_API_KEY) return { skipped: true };

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px;">
    <div style="background:#0D1117;border-radius:16px;padding:28px;border:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:20px;font-weight:700;color:#F8FAFC;margin-bottom:16px;">Truvlo</div>
      <h1 style="margin:0 0 8px;font-size:22px;color:#F8FAFC;">New dispute opened</h1>
      <p style="margin:0 0 20px;color:#94A3B8;line-height:1.6;">A client raised a dispute. Review the case in the admin dashboard.</p>
      <div style="background:#161B22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Invoice</div>
        <div style="color:#F8FAFC;font-family:monospace;margin-top:4px;">${alert.invoiceId}</div>
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Creator</div>
        <div style="color:#94A3B8;font-family:monospace;margin-top:4px;">${shortWallet(alert.creatorWallet)}</div>
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Client</div>
        <div style="color:#94A3B8;font-family:monospace;margin-top:4px;">${shortWallet(alert.clientWallet)}</div>
      </div>
      <a href="https://truvlo.vercel.app/admin#disputes" style="display:inline-block;background:#2DD4BF;color:#0D1117;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Open Disputes</a>
    </div>
  </div>
</body>
</html>`.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Truvlo <${FROM_EMAIL}>`,
      to: [to],
      subject: `New dispute opened - ${alert.invoiceId}`,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(await readResendError(response));
  }

  return { success: true };
}

async function sendWebhook(alert: DisputeAlert) {
  if (!ADMIN_ALERT_WEBHOOK_URL) return { skipped: true };
  const response = await fetch(ADMIN_ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'dispute.opened',
      invoice_id: alert.invoiceId,
      creator_wallet: shortWallet(alert.creatorWallet),
      client_wallet: shortWallet(alert.clientWallet),
      opened_by_role: alert.openedByRole,
      status: alert.status,
      opened_at: alert.openedAt,
      admin_url: 'https://truvlo.vercel.app/admin#disputes',
    }),
  });
  if (!response.ok) {
    throw new Error(`Admin alert webhook failed with HTTP ${response.status}`);
  }
  return { success: true };
}

export async function sendDisputeAdminAlerts(alert: DisputeAlert) {
  const { data: admins, error } = await supabase
    .from('admin_members')
    .select('notification_email, role, dispute_alerts_enabled, webhook_alerts_enabled')
    .eq('active', true)
    .in('role', ['owner', 'dispute_admin']);

  if (error) {
    console.error('Unable to load dispute alert recipients:', error);
    return;
  }

  await Promise.all((admins ?? []).map(async admin => {
    if (!admin.dispute_alerts_enabled || !admin.notification_email) return;
    try {
      await sendAdminEmail(admin.notification_email, alert);
    } catch (error) {
      console.error('Dispute admin email alert failed:', error);
    }
  }));

  if ((admins ?? []).some(admin => admin.webhook_alerts_enabled)) {
    try {
      await sendWebhook(alert);
    } catch (error) {
      console.error('Dispute admin webhook alert failed:', error);
    }
  }
}
