export const CONTRACT_PLATFORM_TREASURY_WALLET = 'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn';
export const WEB_ADMIN_WALLET_ADDRESS = 'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn';

export function isAdminWallet(address: string | null | undefined): boolean {
  return address === WEB_ADMIN_WALLET_ADDRESS;
}
