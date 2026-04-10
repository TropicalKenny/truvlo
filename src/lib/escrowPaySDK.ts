/**
 * EscrowPay SDK v2
 * SDK for interacting with the EscrowPay Solana program
 * Supports: USDC, SOL, Platform Fees, Milestone Payments
 */

import { BN, Program, Provider, Idl, BorshCoder, utils } from "@coral-xyz/anchor";
import { 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { 
  PublicKey, 
  SystemProgram,
} from "@solana/web3.js";
import IDL from "../idl/workspace.json";

// Program ID from the deployed contract
const PROGRAM_ID = new PublicKey(IDL.address || "12mH9wkUUvyQmhqD9A6gJzLGxEUCTZCCuddK6W9EbG2w");

// Anchor discriminator for Invoice accounts — sha256("account:Invoice")[0..8]
// Source: workspace.json accounts[0].discriminator
const INVOICE_DISCRIMINATOR = Buffer.from([51, 194, 250, 114, 6, 104, 18, 164]);

// Token Mints
export const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Platform Treasury (from smart contract)
export const PLATFORM_TREASURY = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
export const PLATFORM_FEE_BPS = 100; // 1% above $200
export const PLATFORM_FLAT_FEE_USD = 2; // $2 flat below $200
export const PLATFORM_FEE_THRESHOLD_USD = 200; // $200 threshold
export const PYTH_SOL_USD_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

const RENT_SYSVAR_ID = new PublicKey("SysvarRent111111111111111111111111111111111");

// Token Type Enum
export enum TokenType {
  USDC = 0,
  SOL = 1,
}

// Invoice Status Enum
export enum InvoiceStatus {
  Unpaid = 0,
  PartiallyPaid = 1,
  FullyPaid = 2,
  Released = 3,
  Disputed = 4,
}

// Type Definitions
export interface InvoiceData {
  bump: number;
  escrowBump: number;
  invoiceId: string;
  creator: PublicKey;
  client: PublicKey | null;
  amount: BN;
  amountPaid: BN;
  amountReleased: BN;
  tokenType: TokenType;
  status: InvoiceStatus;
  createdAt: BN;
  paidAt: BN | null;
  releasedAt: BN | null;
  releaseSchedule: number[];
  currentReleaseIndex: number;
  completionRequestedAt: BN | null;
  clientApproved: boolean;
  disputeRaisedAt: BN | null;
  verdictHash: number[] | null; // SHA-512 of off-chain dispute verdict
}

export interface CreateInvoiceParams {
  invoiceId: string;
  amount: number;
  tokenType: TokenType;
}

export interface PaymentBreakdown {
  invoiceAmount: number;
  platformFee: number;
  totalPayable: number;
  feePercentage: number;
}

export interface SDKResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Safely stringify any value for error messages
 */
function safeStringify(obj: any): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  
  try {
    if (obj instanceof Error) {
      return obj.message || obj.toString() || 'Error';
    }
    if (obj.message && typeof obj.message === 'string') {
      return obj.message;
    }
    const seen = new WeakSet();
    const str = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    if (str && str !== '{}' && str !== '[]') {
      return str.length > 300 ? str.substring(0, 300) + '...' : str;
    }
  } catch {
    // Ignore stringify errors
  }
  try {
    return String(obj);
  } catch {
    return 'Unknown error';
  }
}

/**
 * EscrowPay SDK for invoice and escrow management
 */
export class EscrowPaySDK {
  private readonly provider: Provider;
  private program: Program<Idl> | null = null;
  private readonly usdcMint: PublicKey;
  private readonly programId: PublicKey;
  private coder: BorshCoder | null = null;
  private initialized: boolean = false;
  private initError: string | null = null;

  constructor(provider: Provider, useMainnet: boolean = false) {
    this.provider = provider;
    this.programId = PROGRAM_ID;
    this.usdcMint = useMainnet ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
    
    try {
      this.program = new Program(IDL as Idl, this.provider);
      this.coder = new BorshCoder(IDL as Idl);
      this.initialized = true;
    } catch (e) {
      console.error('Failed to initialize Anchor program:', e);
      this.initError = e instanceof Error ? e.message : 'Failed to initialize program';
      this.initialized = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getInitError(): string | null {
    return this.initError;
  }

  private decodeInvoiceAccount(data: Buffer): any {
    if (!this.coder) return null;
    try {
      return this.coder.accounts.decode('Invoice', data);
    } catch (e) {
      try {
        return this.coder.accounts.decode('invoice', data);
      } catch {
        console.error('Failed to decode invoice account:', e);
        return null;
      }
    }
  }

  private parseInvoiceData(raw: any): InvoiceData | null {
    if (!raw) return null;
    
    try {
      let tokenType = TokenType.USDC;
      if (raw.tokenType?.sol !== undefined || raw.token_type?.sol !== undefined) {
        tokenType = TokenType.SOL;
      }

      let status = InvoiceStatus.Unpaid;
      const rawStatus = raw.status || {};
      if (rawStatus.partiallyPaid !== undefined || rawStatus.partially_paid !== undefined) {
        status = InvoiceStatus.PartiallyPaid;
      } else if (rawStatus.fullyPaid !== undefined || rawStatus.fully_paid !== undefined) {
        status = InvoiceStatus.FullyPaid;
      } else if (rawStatus.released !== undefined) {
        status = InvoiceStatus.Released;
      } else if (rawStatus.disputed !== undefined) {
        status = InvoiceStatus.Disputed;
      }

      return {
        bump: raw.bump,
        escrowBump: raw.escrowBump ?? raw.escrow_bump ?? 0,
        invoiceId: raw.invoiceId ?? raw.invoice_id ?? '',
        creator: raw.creator,
        client: raw.client,
        amount: raw.amount,
        amountPaid: raw.amountPaid ?? raw.amount_paid ?? new BN(0),
        amountReleased: raw.amountReleased ?? raw.amount_released ?? new BN(0),
        tokenType,
        status,
        createdAt: raw.createdAt ?? raw.created_at ?? new BN(0),
        paidAt: raw.paidAt ?? raw.paid_at ?? null,
        releasedAt: raw.releasedAt ?? raw.released_at ?? null,
        releaseSchedule: raw.releaseSchedule ?? raw.release_schedule ?? [],
        currentReleaseIndex: raw.currentReleaseIndex ?? raw.current_release_index ?? 0,
        completionRequestedAt: raw.completionRequestedAt ?? raw.completion_requested_at ?? null,
        clientApproved: raw.clientApproved ?? raw.client_approved ?? false,
        disputeRaisedAt: raw.disputeRaisedAt ?? raw.dispute_raised_at ?? null,
        verdictHash: raw.verdictHash ?? raw.verdict_hash ?? null,
      };
    } catch (e) {
      console.error('Failed to parse invoice data:', e);
      return null;
    }
  }

  calculatePaymentBreakdown(paymentAmount: number, tokenType: TokenType, solPriceUsd?: number): PaymentBreakdown {
    let platformFee: number;
    let feePercentage: number;
    
    if (tokenType === TokenType.USDC) {
      if (paymentAmount < PLATFORM_FEE_THRESHOLD_USD) {
        platformFee = PLATFORM_FLAT_FEE_USD;
        feePercentage = (PLATFORM_FLAT_FEE_USD / paymentAmount) * 100;
      } else {
        platformFee = paymentAmount * (PLATFORM_FEE_BPS / 10000);
        feePercentage = PLATFORM_FEE_BPS / 100;
      }
    } else {
      if (solPriceUsd && solPriceUsd > 0) {
        const valueUsd = paymentAmount * solPriceUsd;
        if (valueUsd < PLATFORM_FEE_THRESHOLD_USD) {
          platformFee = PLATFORM_FLAT_FEE_USD / solPriceUsd;
          feePercentage = (platformFee / paymentAmount) * 100;
        } else {
          platformFee = paymentAmount * (PLATFORM_FEE_BPS / 10000);
          feePercentage = PLATFORM_FEE_BPS / 100;
        }
      } else {
        platformFee = paymentAmount * (PLATFORM_FEE_BPS / 10000);
        feePercentage = PLATFORM_FEE_BPS / 100;
      }
    }
    
    const totalPayable = paymentAmount + platformFee;
    return {
      invoiceAmount: paymentAmount,
      platformFee: parseFloat(platformFee.toFixed(tokenType === TokenType.USDC ? 6 : 9)),
      totalPayable: parseFloat(totalPayable.toFixed(tokenType === TokenType.USDC ? 6 : 9)),
      feePercentage,
    };
  }

  /**
   * Convert to smallest unit — BigInt string-based to avoid float precision loss
   */
  private toSmallestUnit(amount: number, tokenType: TokenType): BN {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    const amountStr = amount.toFixed(decimals);
    const [intPart, fracPart = ''] = amountStr.split('.');
    const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
    const smallestUnit = BigInt(intPart) * BigInt(10 ** decimals) + BigInt(paddedFrac);
    return new BN(smallestUnit.toString());
  }

  /**
   * Convert from smallest unit — BigInt string-based to avoid float precision loss
   */
  private fromSmallestUnit(amount: BN, tokenType: TokenType): number {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    try {
      return amount.toNumber() / Math.pow(10, decimals);
    } catch {
      return parseInt(amount.toString()) / Math.pow(10, decimals);
    }
  }

  private async testConnection(): Promise<boolean> {
    try {
      if (!this.provider?.connection) return false;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('connection timeout')), 5_000)
      );
      const { value } = await Promise.race([
        this.provider.connection.getLatestBlockhashAndContext('finalized'),
        timeout,
      ]);
      return !!(value && value.blockhash);
    } catch {
      return false;
    }
  }

  private parseError(error: any): string {
    if (!error) return 'Unknown error occurred.';
    if (typeof error === 'string') return error;
    
    let message = '';
    try {
      message = error.message || error.msg || '';
      if (typeof message !== 'string') message = safeStringify(message);
    } catch { message = ''; }
    
    let errorStr = '';
    try {
      errorStr = typeof error.toString === 'function' ? error.toString() : '';
      if (errorStr === '[object Object]') errorStr = '';
    } catch { errorStr = ''; }
    
    if (message.includes('User rejected') || message.includes('rejected the request') ||
        errorStr.includes('User rejected') || errorStr.includes('rejected the request')) {
      return 'Transaction was cancelled.';
    }
    if (message.toLowerCase().includes('insufficient') || 
        errorStr.toLowerCase().includes('insufficient') ||
        message.includes('no record of a prior credit') ||
        errorStr.includes('no record of a prior credit') ||
        message.includes('Attempt to debit an account') ||
        errorStr.includes('Attempt to debit an account')) {
      return 'Insufficient SOL balance. Please add SOL to your wallet for transaction fees.';
    }
    if (message.includes('Simulation failed') || errorStr.includes('Simulation failed')) {
      if (message.includes('no record of a prior credit') || message.includes('Attempt to debit')) {
        return 'Insufficient SOL balance. Please add SOL to your wallet for transaction fees.';
      }
      if (message.includes('custom program error')) {
        const match = message.match(/custom program error: (0x[0-9a-fA-F]+|\d+)/);
        if (match) return `Program error: ${match[1]}`;
      }
      return 'Transaction simulation failed. Please try again.';
    }
    try {
      if (error.error?.errorCode?.code) {
        const msg = error.error.errorMessage || error.error.errorCode.name;
        if (msg && typeof msg === 'string') return msg;
        return 'Program error: ' + String(error.error.errorCode.code);
      }
    } catch { /* ignore */ }
    try {
      if (error.logs && Array.isArray(error.logs)) {
        for (const log of error.logs) {
          if (typeof log === 'string') {
            if (log.includes('Error Code:')) {
              const match = log.match(/Error Code: (\w+)/);
              if (match) return 'Error: ' + match[1];
            }
            if (log.includes('Error Message:')) {
              const match = log.match(/Error Message: (.+)/);
              if (match) return match[1];
            }
          }
        }
      }
    } catch { /* ignore */ }
    try {
      if (error.simulationResponse?.err) {
        const simErr = error.simulationResponse.err;
        if (typeof simErr === 'string') return simErr;
        if (simErr?.InstructionError) {
          const instErr = simErr.InstructionError[1];
          if (typeof instErr === 'string') return instErr;
          if (instErr?.Custom !== undefined) return 'Program error code: ' + String(instErr.Custom);
        }
        return 'Transaction simulation failed.';
      }
    } catch { /* ignore */ }
    if (message && message.length > 0) {
      if (message.includes('AnchorError')) {
        const match = message.match(/Error Message: ([^.]+)/);
        if (match) return match[1];
      }
      return message.length > 200 ? message.substring(0, 200) + '...' : message;
    }
    if (errorStr && errorStr.length > 0 && errorStr !== '[object Object]') {
      return errorStr.length > 200 ? errorStr.substring(0, 200) + '...' : errorStr;
    }
    return 'Transaction failed. Please try again.';
  }

  private logError(context: string, error: any): void {
    const safeError = {
      context,
      name: String(error?.name || 'Unknown'),
      message: String(error?.message || 'No message'),
      parsed: this.parseError(error),
    };
    console.error('SDK Error:', JSON.stringify(safeError, null, 2));
  }

  async getInvoicePDA(invoiceId: string, creator: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), Buffer.from(invoiceId), creator.toBuffer()],
      this.programId
    );
  }

  async getEscrowPDA(invoiceId: string, creator: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(invoiceId), creator.toBuffer()],
      this.programId
    );
  }

  generateInvoiceId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'INV-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Create a new invoice (USDC or SOL)
   * description and clientEmail are now stored in Supabase — not on-chain
   */
  async createInvoice(params: CreateInvoiceParams): Promise<SDKResult<{ 
    signature: string; 
    invoiceAddress: string;
    invoiceId: string;
  }>> {
    if (!this.provider.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }
    if (!this.initialized || !this.program) {
      return { success: false, error: this.initError || "SDK not initialized" };
    }

    try {
      if (!(await this.testConnection())) {
        return { success: false, error: "Network unavailable" };
      }
      const trimmedId = params.invoiceId?.trim() ?? '';
      if (!trimmedId || trimmedId.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
        return { success: false, error: "Invoice ID must be 1–32 characters (letters, numbers, hyphens, underscores only)" };
      }
      if (params.amount <= 0) {
        return { success: false, error: "Amount must be greater than 0" };
      }

      const [invoiceAddress] = await this.getInvoicePDA(params.invoiceId, this.provider.publicKey);
      const amountSmallestUnit = this.toSmallestUnit(params.amount, params.tokenType);

      let tx: string;

      if (params.tokenType === TokenType.SOL) {
        tx = await this.program.methods
          .initializeConfigSol(
            params.invoiceId,
            amountSmallestUnit,
          )
          .accounts({
            invoice: invoiceAddress,
            creator: this.provider.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else {
        const [escrowAddress] = await this.getEscrowPDA(params.invoiceId, this.provider.publicKey);
        tx = await this.program.methods
          .initializeConfig(
            params.invoiceId,
            amountSmallestUnit,
          )
          .accounts({
            invoice: invoiceAddress,
            escrow: escrowAddress,
            usdcMint: this.usdcMint,
            creator: this.provider.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: RENT_SYSVAR_ID,
          })
          .rpc();
      }

      return {
        success: true,
        data: {
          signature: tx,
          invoiceAddress: invoiceAddress.toString(),
          invoiceId: params.invoiceId,
        }
      };
    } catch (error: any) {
      this.logError('createInvoice', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Pay an invoice (supports partial/milestone payments)
   */
  async payInvoice(
    invoiceId: string, 
    creatorPubkey: PublicKey, 
    paymentAmount: number,
    tokenType: TokenType,
    solPriceUsd?: number
  ): Promise<SDKResult<{ signature: string; breakdown: PaymentBreakdown }>> {
    if (!this.provider.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }
    if (!this.initialized || !this.program) {
      return { success: false, error: this.initError || "SDK not initialized" };
    }

    try {
      if (!(await this.testConnection())) {
        return { success: false, error: "Network unavailable" };
      }

      const [invoiceAddress] = await this.getInvoicePDA(invoiceId, creatorPubkey);
      const paymentSmallestUnit = this.toSmallestUnit(paymentAmount, tokenType);
      const resolvedSolPrice = tokenType === TokenType.SOL && !solPriceUsd
        ? await this.getSolPriceUsd()
        : solPriceUsd ?? null;
      const breakdown = this.calculatePaymentBreakdown(paymentAmount, tokenType, resolvedSolPrice ?? undefined);

      let tx: string;

      if (tokenType === TokenType.SOL) {
        const feeSmallestUnit = this.toSmallestUnit(breakdown.platformFee, TokenType.SOL);
        tx = await this.program.methods
          .payInvoiceSol(invoiceId, paymentSmallestUnit, feeSmallestUnit)
          .accounts({
            invoice: invoiceAddress,
            platformTreasury: PLATFORM_TREASURY,
            client: this.provider.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else {
        const [escrowAddress] = await this.getEscrowPDA(invoiceId, creatorPubkey);
        const clientToken = getAssociatedTokenAddressSync(this.usdcMint, this.provider.publicKey);
        const treasuryToken = getAssociatedTokenAddressSync(this.usdcMint, PLATFORM_TREASURY);
        tx = await this.program.methods
          .payInvoice(invoiceId, paymentSmallestUnit)
          .accounts({
            invoice: invoiceAddress,
            escrow: escrowAddress,
            clientToken: clientToken,
            platformTreasuryToken: treasuryToken,
            usdcMint: this.usdcMint,
            client: this.provider.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
      }

      return { success: true, data: { signature: tx, breakdown } };
    } catch (error: any) {
      this.logError('payInvoice', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Set release schedule — called by client after paying full amount
   */
  async setReleaseSchedule(
    invoiceId: string,
    creatorPubkey: PublicKey,
    scheduleBps: number[]
  ): Promise<SDKResult<{ signature: string }>> {
    if (!this.provider.publicKey) return { success: false, error: 'Wallet not connected' };
    if (!this.initialized || !this.program) return { success: false, error: this.initError || 'SDK not initialized' };
    try {
      if (!(await this.testConnection())) return { success: false, error: 'Network unavailable' };
      const [invoiceAddress] = await this.getInvoicePDA(invoiceId, creatorPubkey);
      const tx = await this.program.methods
        .setReleaseSchedule(invoiceId, scheduleBps)
        .accounts({ invoice: invoiceAddress, client: this.provider.publicKey })
        .rpc();
      return { success: true, data: { signature: tx } };
    } catch (error: any) {
      this.logError('setReleaseSchedule', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Release funds from escrow (supports partial releases)
   */
  async releaseFunds(
    invoiceId: string, 
    releaseAmount: number,
    tokenType: TokenType
  ): Promise<SDKResult<{ signature: string }>> {
    if (!this.provider.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }
    if (!this.initialized || !this.program) {
      return { success: false, error: this.initError || "SDK not initialized" };
    }

    try {
      if (!(await this.testConnection())) {
        return { success: false, error: "Network unavailable" };
      }

      const [invoiceAddress] = await this.getInvoicePDA(invoiceId, this.provider.publicKey);
      const releaseSmallestUnit = this.toSmallestUnit(releaseAmount, tokenType);

      let tx: string;

      if (tokenType === TokenType.SOL) {
        tx = await this.program.methods
          .releaseFundsSol(invoiceId, releaseSmallestUnit)
          .accounts({
            invoice: invoiceAddress,
            creator: this.provider.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else {
        const [escrowAddress] = await this.getEscrowPDA(invoiceId, this.provider.publicKey);
        const creatorToken = getAssociatedTokenAddressSync(this.usdcMint, this.provider.publicKey);
        tx = await this.program.methods
          .releaseFunds(invoiceId, releaseSmallestUnit)
          .accounts({
            invoice: invoiceAddress,
            escrow: escrowAddress,
            creatorToken: creatorToken,
            usdcMint: this.usdcMint,
            creator: this.provider.publicKey,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      return { success: true, data: { signature: tx } };
    } catch (error: any) {
      this.logError('releaseFunds', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Fetch invoice by ID and creator
   */
  async fetchInvoice(invoiceId: string, creator: PublicKey): Promise<SDKResult<InvoiceData>> {
    try {
      if (!this.initialized || !this.program) {
        return { success: false, error: this.initError || "SDK not initialized" };
      }
      if (!(await this.testConnection())) {
        return { success: false, error: "Network unavailable" };
      }

      const [invoiceAddress] = await this.getInvoicePDA(invoiceId, creator);
      
      try {
        const invoiceAccessor = (this.program.account as any).invoice || (this.program.account as any).Invoice;
        if (invoiceAccessor) {
          const invoice = await invoiceAccessor.fetch(invoiceAddress);
          const parsed = this.parseInvoiceData(invoice);
          if (parsed) return { success: true, data: parsed };
        }
      } catch (anchorError) {
        console.log('Anchor fetch failed, trying direct RPC:', anchorError);
      }
      
      const accountInfo = await this.provider.connection.getAccountInfo(invoiceAddress);
      if (!accountInfo || !accountInfo.data) {
        return { success: false, error: "Invoice not found" };
      }
      
      const decoded = this.decodeInvoiceAccount(accountInfo.data);
      const parsed = this.parseInvoiceData(decoded);
      
      if (!parsed) return { success: false, error: "Failed to decode invoice data" };
      
      return { success: true, data: parsed };
    } catch (error: any) {
      this.logError('fetchInvoice', error);
      const message = this.parseError(error);
      if (message.includes('Account does not exist') || message.includes('not found')) {
        return { success: false, error: "Invoice not found" };
      }
      return { success: false, error: message };
    }
  }

  /**
   * Fetch all invoices by creator
   */
  async fetchInvoicesByCreator(creator?: PublicKey): Promise<SDKResult<Array<{ publicKey: PublicKey; account: InvoiceData }>>> {
    const targetCreator = creator || this.provider.publicKey;
    if (!targetCreator) return { success: false, error: "No creator provided" };

    try {
      if (!this.initialized || !this.program) {
        return { success: false, error: this.initError || "SDK not initialized" };
      }
      if (!(await this.testConnection())) {
        return { success: false, error: "Network unavailable" };
      }

      try {
        const invoiceAccessor = (this.program.account as any).invoice || (this.program.account as any).Invoice;
        if (invoiceAccessor) {
          // memcmp at offset 10: discriminator(8) + bump(1) + escrow_bump(1) = 10
          const allInvoices = await invoiceAccessor.all([{
            memcmp: { offset: 10, bytes: targetCreator.toBase58() },
          }]);
          if (Array.isArray(allInvoices)) {
            const filtered = allInvoices.filter((inv: any) => {
              try {
                return inv?.account?.creator?.toString() === targetCreator.toString();
              } catch { return false; }
            });
            const mapped = filtered.map((inv: any) => {
              const parsed = this.parseInvoiceData(inv.account);
              return { publicKey: inv.publicKey, account: parsed as InvoiceData };
            }).filter((inv: any) => inv.account !== null);
            return { success: true, data: mapped };
          }
        }
      } catch (anchorError) {
        console.log('Anchor fetchAll failed, trying direct RPC:', anchorError);
      }

      const accounts = await this.provider.connection.getProgramAccounts(this.programId, {
        filters: [
          { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(INVOICE_DISCRIMINATOR) } },
          { memcmp: { offset: 10, bytes: targetCreator.toBase58() } },
        ],
      });

      if (!accounts?.length) return { success: true, data: [] };

      const mapped = accounts.map((acc) => {
        try {
          const decoded = this.decodeInvoiceAccount(acc.account.data);
          const parsed = this.parseInvoiceData(decoded);
          if (parsed) return { publicKey: acc.pubkey, account: parsed };
        } catch (e) {
          console.error('Failed to decode account:', e);
        }
        return null;
      }).filter((inv): inv is { publicKey: PublicKey; account: InvoiceData } => inv !== null);

      return { success: true, data: mapped };
    } catch (error: any) {
      this.logError('fetchInvoicesByCreator', error);
      return { success: true, data: [] };
    }
  }

  /**
   * Fetch all invoices where the connected wallet is the CLIENT who paid.
   * Uses fetchAll + client-side filter — memcmp is unreliable due to variable-length invoice_id.
   */
  async fetchInvoicesByClient(client?: PublicKey): Promise<SDKResult<Array<{ publicKey: PublicKey; account: InvoiceData }>>> {
    const targetClient = client || this.provider.publicKey;
    if (!targetClient) return { success: false, error: 'No client provided' };
    if (!this.initialized || !this.program) return { success: false, error: this.initError || 'SDK not initialized' };
    try {
      if (!(await this.testConnection())) return { success: false, error: 'Network unavailable' };

      const targetStr = targetClient.toString();

      try {
        const invoiceAccessor = (this.program.account as any).invoice || (this.program.account as any).Invoice;
        if (invoiceAccessor) {
          const allInvoices = await invoiceAccessor.all();
          if (Array.isArray(allInvoices)) {
            if (allInvoices.length > 0) {
              const sample = allInvoices[0]?.account;
              console.log('[fetchInvoicesByClient] sample client field:', JSON.stringify(sample?.client), 'target:', targetStr);
            }
            const filtered = allInvoices.filter((inv: any) => {
              try {
                const clientField = inv?.account?.client;
                if (!clientField) return false;
                let clientKey: string;
                if (typeof clientField === 'string') {
                  clientKey = clientField;
                } else if (clientField.toBase58) {
                  clientKey = clientField.toBase58();
                } else if (clientField.toString) {
                  clientKey = clientField.toString();
                } else if (clientField.key) {
                  clientKey = clientField.key.toString();
                } else {
                  clientKey = String(clientField);
                }
                return clientKey === targetStr;
              } catch { return false; }
            });
            const mapped = filtered.map((inv: any) => {
              const parsed = this.parseInvoiceData(inv.account);
              return { publicKey: inv.publicKey, account: parsed as InvoiceData };
            }).filter((inv: any) => inv.account !== null);
            return { success: true, data: mapped };
          }
        }
      } catch (anchorError) {
        console.log('Anchor fetchAll failed for client invoices, trying RPC fallback:', anchorError);
      }

      const accounts = await this.provider.connection.getProgramAccounts(this.programId, {
        filters: [
          { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(INVOICE_DISCRIMINATOR) } },
        ],
      });
      if (!accounts?.length) return { success: true, data: [] };

      const mapped = accounts.map((acc) => {
        try {
          const decoded = this.decodeInvoiceAccount(acc.account.data);
          const parsed = this.parseInvoiceData(decoded);
          if (!parsed) return null;
          if (!parsed.client) return null;
          if (parsed.client.toString() !== targetStr) return null;
          return { publicKey: acc.pubkey, account: parsed };
        } catch { return null; }
      }).filter(Boolean) as Array<{ publicKey: PublicKey; account: InvoiceData }>;

      return { success: true, data: mapped };
    } catch (error: any) {
      this.logError('fetchInvoicesByClient', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  async getSolPriceUsd(): Promise<number | null> {
    try {
      const res = await fetch(
        `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_SOL_USD_FEED_ID}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const price = data?.parsed?.[0]?.price;
      if (!price) return null;
      const computed = parseFloat(price.price) * Math.pow(10, price.expo);
      // Reject unrealistic or malformed prices (SOL realistically $0.10–$100,000)
      if (!isFinite(computed) || computed < 0.10 || computed > 100_000) return null;
      return computed;
    } catch {
      return null;
    }
  }

  // ============================================================
  // DUAL APPROVAL FLOW
  // ============================================================

  async requestRelease(
    invoiceId: string,
    tokenType: TokenType
  ): Promise<SDKResult<{ signature: string }>> {
    if (!this.provider.publicKey) return { success: false, error: 'Wallet not connected' };
    if (!this.initialized || !this.program) return { success: false, error: this.initError || 'SDK not initialized' };
    try {
      if (!(await this.testConnection())) return { success: false, error: 'Network unavailable' };
      const [invoiceAddress] = await this.getInvoicePDA(invoiceId, this.provider.publicKey);
      const tx = await this.program.methods
        .requestRelease(invoiceId)
        .accounts({ invoice: invoiceAddress, creator: this.provider.publicKey })
        .rpc();
      return { success: true, data: { signature: tx } };
    } catch (error: any) {
      this.logError('requestRelease', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  async approveRelease(
    invoiceId: string,
    creatorPubkey: PublicKey
  ): Promise<SDKResult<{ signature: string }>> {
    if (!this.provider.publicKey) return { success: false, error: 'Wallet not connected' };
    if (!this.initialized || !this.program) return { success: false, error: this.initError || 'SDK not initialized' };
    try {
      if (!(await this.testConnection())) return { success: false, error: 'Network unavailable' };
      const [invoiceAddress] = await this.getInvoicePDA(invoiceId, creatorPubkey);
      const tx = await this.program.methods
        .approveRelease(invoiceId)
        .accounts({ invoice: invoiceAddress, client: this.provider.publicKey })
        .rpc();
      return { success: true, data: { signature: tx } };
    } catch (error: any) {
      this.logError('approveRelease', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  async raiseDispute(
    invoiceId: string,
    creatorPubkey: PublicKey
  ): Promise<SDKResult<{ signature: string }>> {
    if (!this.provider.publicKey) return { success: false, error: 'Wallet not connected' };
    if (!this.initialized || !this.program) return { success: false, error: this.initError || 'SDK not initialized' };
    try {
      if (!(await this.testConnection())) return { success: false, error: 'Network unavailable' };
      const [invoiceAddress] = await this.getInvoicePDA(invoiceId, creatorPubkey);
      const tx = await this.program.methods
        .raiseDispute(invoiceId)
        .accounts({ invoice: invoiceAddress, client: this.provider.publicKey })
        .rpc();
      return { success: true, data: { signature: tx } };
    } catch (error: any) {
      this.logError('raiseDispute', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  isAutoReleaseReady(invoice: InvoiceData): boolean {
    if (!invoice.completionRequestedAt) return false;
    const requestedAt = invoice.completionRequestedAt.toNumber();
    const now = Math.floor(Date.now() / 1000);
    return now - requestedAt > 7 * 24 * 60 * 60;
  }

  autoReleaseSecondsRemaining(invoice: InvoiceData): number {
    if (!invoice.completionRequestedAt) return -1;
    const requestedAt = invoice.completionRequestedAt.toNumber();
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - requestedAt;
    const timeout = 7 * 24 * 60 * 60;
    return Math.max(0, timeout - elapsed);
  }

  formatAmount(amount: BN | number, tokenType: TokenType): string {
    const value = amount instanceof BN ? this.fromSmallestUnit(amount, tokenType) : amount;
    const symbol = tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: tokenType === TokenType.USDC ? 2 : 4,
    }).format(value) + ' ' + symbol;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  getProgramId(): PublicKey {
    return this.program.programId;
  }

  getUSDCMint(): PublicKey {
    return this.usdcMint;
  }
}

export default EscrowPaySDK;
