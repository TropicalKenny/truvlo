import type { VercelRequest } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared.js';
import { WEB_ADMIN_WALLET_ADDRESS } from '../src/lib/admin.js';

export type AdminRole = 'owner' | 'dispute_admin' | 'payout_admin' | 'support_admin';
export type AdminSection =
  | 'profiles'
  | 'wallets'
  | 'invoices'
  | 'failed_emails'
  | 'disputes'
  | 'referral_rewards'
  | 'payout_requests';
export type AdminPermission =
  | AdminSection
  | 'admin_overview'
  | 'dispute_backfill'
  | 'dispute_recommend'
  | 'dispute_resolve'
  | 'payout_process';

export type AdminContext = {
  privyId: string;
  walletAddress: string;
  role: AdminRole;
  notificationEmail: string | null;
  allowedSections: AdminSection[];
};

type AdminMemberRow = {
  privy_id: string | null;
  wallet_address: string;
  role: AdminRole;
  active: boolean;
  notification_email: string | null;
};

const ROLE_SECTIONS: Record<AdminRole, AdminSection[]> = {
  owner: ['profiles', 'wallets', 'invoices', 'failed_emails', 'disputes', 'referral_rewards', 'payout_requests'],
  dispute_admin: ['invoices', 'disputes'],
  payout_admin: ['invoices', 'referral_rewards', 'payout_requests'],
  support_admin: ['invoices'],
};

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  owner: [...ROLE_SECTIONS.owner, 'admin_overview', 'dispute_backfill', 'dispute_recommend', 'dispute_resolve', 'payout_process'],
  dispute_admin: [...ROLE_SECTIONS.dispute_admin, 'admin_overview', 'dispute_recommend'],
  payout_admin: [...ROLE_SECTIONS.payout_admin, 'admin_overview', 'payout_process'],
  support_admin: [...ROLE_SECTIONS.support_admin, 'admin_overview'],
};

export function getAllowedSections(role: AdminRole): AdminSection[] {
  return ROLE_SECTIONS[role] ?? [];
}

export function hasAdminPermission(role: AdminRole, permission: AdminPermission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function shortWallet(value: unknown): string {
  if (value == null || value === '') return '-';
  const text = String(value);
  if (text.length <= 16) return text;
  return `${text.slice(0, 8)}...${text.slice(-8)}`;
}

export function maskIdentifier(value: unknown): string {
  if (value == null || value === '') return '-';
  const text = String(value);
  if (text.length <= 12) return '***';
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function maskEmail(value: unknown): string {
  if (value == null || value === '') return '-';
  const text = String(value);
  const [name, domain] = text.split('@');
  if (!name || !domain) return '***';
  const visible = name.length <= 2 ? `${name[0] ?? ''}*` : `${name.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

export async function requireAdmin(
  req: VercelRequest,
  walletAddress: string | undefined,
  permission: AdminPermission = 'admin_overview'
): Promise<AdminContext | null> {
  const userId = await requireUserId(req);
  if (!userId || !walletAddress || !isValidSolanaAddress(walletAddress)) return null;

  const normalizedWallet = normalizeSolanaAddress(walletAddress);
  if (!(await walletBelongsToUser(supabase, userId, normalizedWallet))) return null;

  let member: AdminMemberRow | null = null;
  const { data, error } = await supabase
    .from('admin_members')
    .select('privy_id, wallet_address, role, active, notification_email')
    .eq('wallet_address', normalizedWallet)
    .maybeSingle();

  if (!error && data) {
    member = data as AdminMemberRow;
  }

  if (!member && normalizedWallet === WEB_ADMIN_WALLET_ADDRESS) {
    const { data: inserted } = await supabase
      .from('admin_members')
      .upsert({
        privy_id: userId,
        wallet_address: normalizedWallet,
        role: 'owner',
        active: true,
      }, { onConflict: 'wallet_address' })
      .select('privy_id, wallet_address, role, active, notification_email')
      .maybeSingle();
    member = inserted as AdminMemberRow | null;
  }

  if (!member || !member.active) return null;
  if (member.privy_id && member.privy_id !== userId) return null;
  if (!hasAdminPermission(member.role, permission)) return null;

  if (!member.privy_id) {
    await supabase
      .from('admin_members')
      .update({ privy_id: userId, updated_at: new Date().toISOString() })
      .eq('wallet_address', normalizedWallet)
      .is('privy_id', null);
  }

  return {
    privyId: userId,
    walletAddress: normalizedWallet,
    role: member.role,
    notificationEmail: member.notification_email,
    allowedSections: getAllowedSections(member.role),
  };
}

export async function logAdminAction(
  admin: AdminContext,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from('admin_audit_log').insert({
    admin_privy_id: admin.privyId,
    admin_wallet: admin.walletAddress,
    admin_role: admin.role,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}
