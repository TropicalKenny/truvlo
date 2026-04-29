type TokenSymbol = 0 | 1 | 'USDC' | 'SOL';

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  SOL: 9,
};

export function tokenSymbol(tokenType: TokenSymbol): 'USDC' | 'SOL' {
  return tokenType === 1 || tokenType === 'SOL' ? 'SOL' : 'USDC';
}

export function formatTokenAmountValue(value: number, tokenType: TokenSymbol): string {
  if (!Number.isFinite(value)) return '0';

  const symbol = tokenSymbol(tokenType);
  const maxDecimals = TOKEN_DECIMALS[symbol];
  const rounded = Number(value.toFixed(maxDecimals));

  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

export function formatTokenAmount(value: number, tokenType: TokenSymbol): string {
  return `${formatTokenAmountValue(value, tokenType)} ${tokenSymbol(tokenType)}`;
}
