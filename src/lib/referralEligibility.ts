const REFERRAL_REWARD_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export function isReferralRewardWindowActive(
  referralLinkedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!referralLinkedAt) return false;

  const linkedTime = new Date(referralLinkedAt).getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(linkedTime) || !Number.isFinite(nowTime)) return false;
  if (nowTime < linkedTime) return false;

  return nowTime - linkedTime <= REFERRAL_REWARD_WINDOW_MS;
}
