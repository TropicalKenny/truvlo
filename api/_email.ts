export const DEFAULT_FROM_EMAIL = 'notifications@truvlo.io';
export const VERIFIED_SENDER_ERROR = 'Email setup needs a verified sender domain. Resend test senders can only send to the Resend account email.';

export function isResendTestSender(fromEmail: string): boolean {
  const match = fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail;
  return match.trim().toLowerCase().endsWith('@resend.dev');
}

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
