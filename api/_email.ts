export const DEFAULT_FROM_EMAIL = 'onboarding@resend.dev';
export const PUBLIC_EMAIL_DELIVERY_ERROR = 'The invoice was created, but the email could not be delivered automatically. Copy the secure invoice link below and send it to your client.';

export async function readResendError(response: Response): Promise<string> {
  const fallback = `Resend rejected the email request with HTTP ${response.status}`;
  try {
    const raw = await response.text();
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: string; name?: string };
      return parsed.message || parsed.error || raw;
    } catch {
      return raw;
    }
  } catch {
    return fallback;
  }
}
