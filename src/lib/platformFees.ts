export type FeeTokenType = 0 | 1 | 'USDC' | 'SOL';

export const PLATFORM_FEE_BPS = 100;
export const PLATFORM_FLAT_FEE_USD = 2;
export const PLATFORM_FEE_THRESHOLD_USD = 200;

export interface PlatformFeeBreakdown {
  platformFee: number;
  totalPayable: number;
  feePercentage: number;
  feeLabel: string;
}

function tokenSymbol(tokenType: FeeTokenType): 'USDC' | 'SOL' {
  return tokenType === 1 || tokenType === 'SOL' ? 'SOL' : 'USDC';
}

function roundTokenAmount(value: number, tokenType: FeeTokenType): number {
  const decimals = tokenSymbol(tokenType) === 'USDC' ? 6 : 9;
  return Number(value.toFixed(decimals));
}

function roundPercentage(value: number): number {
  return Number(value.toFixed(7));
}

export function calculatePlatformFeeBreakdown({
  amount,
  tokenType,
  solPriceUsd,
}: {
  amount: number;
  tokenType: FeeTokenType;
  solPriceUsd?: number | null;
}): PlatformFeeBreakdown | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const symbol = tokenSymbol(tokenType);
  let platformFee: number;
  let feePercentage: number;
  let feeLabel: string;

  if (symbol === 'USDC') {
    if (amount < PLATFORM_FEE_THRESHOLD_USD) {
      platformFee = PLATFORM_FLAT_FEE_USD;
      feePercentage = (PLATFORM_FLAT_FEE_USD / amount) * 100;
      feeLabel = `Platform Fee ($${PLATFORM_FLAT_FEE_USD} flat)`;
    } else {
      platformFee = amount * (PLATFORM_FEE_BPS / 10000);
      feePercentage = PLATFORM_FEE_BPS / 100;
      feeLabel = `Platform Fee (${PLATFORM_FEE_BPS / 100}%)`;
    }
  } else {
    if (!solPriceUsd || !Number.isFinite(solPriceUsd) || solPriceUsd <= 0) return null;

    const valueUsd = amount * solPriceUsd;
    if (valueUsd < PLATFORM_FEE_THRESHOLD_USD) {
      platformFee = PLATFORM_FLAT_FEE_USD / solPriceUsd;
      feePercentage = (platformFee / amount) * 100;
      feeLabel = `Platform Fee ($${PLATFORM_FLAT_FEE_USD} flat)`;
    } else {
      platformFee = amount * (PLATFORM_FEE_BPS / 10000);
      feePercentage = PLATFORM_FEE_BPS / 100;
      feeLabel = `Platform Fee (${PLATFORM_FEE_BPS / 100}%)`;
    }
  }

  const roundedFee = roundTokenAmount(platformFee, tokenType);
  return {
    platformFee: roundedFee,
    totalPayable: roundTokenAmount(amount + roundedFee, tokenType),
    feePercentage: roundPercentage(feePercentage),
    feeLabel,
  };
}
