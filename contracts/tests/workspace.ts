import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Workspace } from "../target/types/workspace";
import { expect } from "chai";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";

describe("EscrowPay Invoice Payment Program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Workspace as Program<Workspace>;

  // Platform treasury (must match the constant in the program)
  const PLATFORM_TREASURY = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  const PLATFORM_FEE_BPS = 100; // 1%

  let creator: Keypair;
  let client: Keypair;
  let usdcMint: PublicKey;
  let creatorTokenAccount: PublicKey;
  let clientTokenAccount: PublicKey;
  let platformTreasuryTokenAccount: PublicKey;

  const invoiceId = "INV-001";
  const amount = new anchor.BN(1000000); // 1 USDC (6 decimals)
  const description = "Payment for web development services";
  const clientEmail = "client@example.com";

  before(async () => {
    // Generate keypairs
    creator = Keypair.generate();
    client = Keypair.generate();

    // Fund accounts with 100 SOL each
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        creator.publicKey,
        100 * LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        client.publicKey,
        100 * LAMPORTS_PER_SOL
      )
    );
    // Fund platform treasury for rent
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        PLATFORM_TREASURY,
        10 * LAMPORTS_PER_SOL
      )
    );

    // Create USDC mock mint
    usdcMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6 // USDC has 6 decimals
    );

    // Create token accounts
    creatorTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      usdcMint,
      creator.publicKey
    );

    clientTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      client,
      usdcMint,
      client.publicKey
    );

    // Create platform treasury token account
    platformTreasuryTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      usdcMint,
      PLATFORM_TREASURY
    );

    // Mint USDC to client for testing payments (100 USDC)
    await mintTo(
      provider.connection,
      creator,
      usdcMint,
      clientTokenAccount,
      creator,
      100000000 // 100 USDC
    );
  });

  const getInvoicePDA = (invoiceId: string, creatorPubkey: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        Buffer.from(invoiceId),
        creatorPubkey.toBuffer(),
      ],
      program.programId
    );
  };

  const getEscrowPDA = (invoiceId: string, creatorPubkey: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        Buffer.from(invoiceId),
        creatorPubkey.toBuffer(),
      ],
      program.programId
    );
  };



  describe("initialize_config (USDC Invoice)", () => {
    it("should create a USDC invoice successfully", async () => {
      const [invoicePDA] = getInvoicePDA(invoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(invoiceId, creator.publicKey);

      await program.methods
        .initializeConfig(invoiceId, amount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      // Fetch and verify invoice
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.invoiceId).to.equal(invoiceId);
      expect(invoice.creator.toString()).to.equal(creator.publicKey.toString());
      expect(invoice.client).to.be.null;
      expect(invoice.amount.toString()).to.equal(amount.toString());
      expect(invoice.amountPaid.toString()).to.equal("0");
      expect(invoice.amountReleased.toString()).to.equal("0");
      expect(invoice.tokenType).to.deep.equal({ usdc: {} });
      expect(invoice.description).to.equal(description);
      expect(invoice.clientEmail).to.equal(clientEmail);
      expect(invoice.status).to.deep.equal({ unpaid: {} });
      expect(Number(invoice.createdAt)).to.be.greaterThan(0);
      expect(invoice.paidAt).to.be.null;
      expect(invoice.releasedAt).to.be.null;
    });

    it("should fail with zero amount", async () => {
      const testInvoiceId = "INV-ZERO";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      try {
        await program.methods
          .initializeConfig(testInvoiceId, new anchor.BN(0), description, clientEmail)
          .accounts({
            invoice: invoicePDA,
            escrow: escrowPDA,
            usdcMint: usdcMint,
            creator: creator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error.message).to.include("InvalidAmount");
      }
    });

    it("should fail with description too long", async () => {
      const testInvoiceId = "INV-LONG-DESC";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);
      const longDescription = "a".repeat(257);

      try {
        await program.methods
          .initializeConfig(testInvoiceId, amount, longDescription, clientEmail)
          .accounts({
            invoice: invoicePDA,
            escrow: escrowPDA,
            usdcMint: usdcMint,
            creator: creator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error.message).to.include("DescriptionTooLong");
      }
    });
  });

  describe("initialize_config_sol (SOL Invoice)", () => {
    const solInvoiceId = "INV-SOL-001";
    const solAmount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL

    it("should create a SOL invoice successfully", async () => {
      const [invoicePDA] = getInvoicePDA(solInvoiceId, creator.publicKey);

      await program.methods
        .initializeConfigSol(solInvoiceId, solAmount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Fetch and verify invoice
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.invoiceId).to.equal(solInvoiceId);
      expect(invoice.tokenType).to.deep.equal({ sol: {} });
      expect(invoice.amount.toString()).to.equal(solAmount.toString());
      expect(invoice.amountPaid.toString()).to.equal("0");
      expect(invoice.status).to.deep.equal({ unpaid: {} });
    });
  });

  describe("pay_invoice (USDC - Partial Payments)", () => {
    const payInvoiceId = "INV-PAY-001";
    const invoiceAmount = new anchor.BN(2000000); // 2 USDC

    before(async () => {
      // Create invoice for payment tests
      const [invoicePDA] = getInvoicePDA(payInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(payInvoiceId, creator.publicKey);

      await program.methods
        .initializeConfig(payInvoiceId, invoiceAmount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();
    });

    it("should make partial payment successfully", async () => {
      const [invoicePDA] = getInvoicePDA(payInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(payInvoiceId, creator.publicKey);

      const partialPayment = new anchor.BN(1000000); // 1 USDC
      const expectedFee = partialPayment.toNumber() * PLATFORM_FEE_BPS / 10000; // 1% fee

      // Get balances before
      const clientBalanceBefore = await getAccount(provider.connection, clientTokenAccount);
      const treasuryBalanceBefore = await getAccount(provider.connection, platformTreasuryTokenAccount);

      await program.methods
        .payInvoice(payInvoiceId, partialPayment)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      // Verify invoice status is PartiallyPaid
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.status).to.deep.equal({ partiallyPaid: {} });
      expect(invoice.amountPaid.toString()).to.equal(partialPayment.toString());
      expect(invoice.client.toString()).to.equal(client.publicKey.toString());

      // Verify escrow received payment
      const escrowAccount = await getAccount(provider.connection, escrowPDA);
      expect(Number(escrowAccount.amount)).to.equal(partialPayment.toNumber());

      // Verify platform treasury received fee
      const treasuryBalanceAfter = await getAccount(provider.connection, platformTreasuryTokenAccount);
      expect(Number(treasuryBalanceAfter.amount) - Number(treasuryBalanceBefore.amount)).to.equal(expectedFee);

      // Verify client paid payment + fee
      const clientBalanceAfter = await getAccount(provider.connection, clientTokenAccount);
      const clientPaid = Number(clientBalanceBefore.amount) - Number(clientBalanceAfter.amount);
      expect(clientPaid).to.equal(partialPayment.toNumber() + expectedFee);
    });

    it("should complete payment with second partial payment", async () => {
      const [invoicePDA] = getInvoicePDA(payInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(payInvoiceId, creator.publicKey);

      const remainingPayment = new anchor.BN(1000000); // 1 USDC (remaining)

      await program.methods
        .payInvoice(payInvoiceId, remainingPayment)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      // Verify invoice status is FullyPaid
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.status).to.deep.equal({ fullyPaid: {} });
      expect(invoice.amountPaid.toString()).to.equal(invoiceAmount.toString());
      expect(Number(invoice.paidAt)).to.be.greaterThan(0);
    });

    it("should fail when payment exceeds remaining amount", async () => {
      const [invoicePDA] = getInvoicePDA(payInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(payInvoiceId, creator.publicKey);

      try {
        await program.methods
          .payInvoice(payInvoiceId, new anchor.BN(1000000))
          .accounts({
            invoice: invoicePDA,
            escrow: escrowPDA,
            clientToken: clientTokenAccount,
            platformTreasuryToken: platformTreasuryTokenAccount,
            usdcMint: usdcMint,
            client: client.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([client])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error.message).to.include("InvoiceNotPayable");
      }
    });

    it("should fail with zero payment amount", async () => {
      const testInvoiceId = "INV-ZERO-PAY";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      // Create invoice first
      await program.methods
        .initializeConfig(testInvoiceId, amount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      try {
        await program.methods
          .payInvoice(testInvoiceId, new anchor.BN(0))
          .accounts({
            invoice: invoicePDA,
            escrow: escrowPDA,
            clientToken: clientTokenAccount,
            platformTreasuryToken: platformTreasuryTokenAccount,
            usdcMint: usdcMint,
            client: client.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([client])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error.message).to.include("InvalidPaymentAmount");
      }
    });
  });

  describe("pay_invoice_sol (SOL - Partial Payments)", () => {
    const solPayInvoiceId = "INV-SOL-PAY-001";
    const solInvoiceAmount = new anchor.BN(2 * LAMPORTS_PER_SOL); // 2 SOL

    before(async () => {
      const [invoicePDA] = getInvoicePDA(solPayInvoiceId, creator.publicKey);

      await program.methods
        .initializeConfigSol(solPayInvoiceId, solInvoiceAmount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
    });

    it("should make partial SOL payment successfully", async () => {
      const [invoicePDA] = getInvoicePDA(solPayInvoiceId, creator.publicKey);

      const partialPayment = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL
      const expectedFee = partialPayment.toNumber() * PLATFORM_FEE_BPS / 10000;

      const clientBalanceBefore = await provider.connection.getBalance(client.publicKey);
      const treasuryBalanceBefore = await provider.connection.getBalance(PLATFORM_TREASURY);
      const invoiceBalanceBefore = await provider.connection.getBalance(invoicePDA);

      await program.methods
        .payInvoiceSol(solPayInvoiceId, partialPayment)
        .accounts({
          invoice: invoicePDA,
          platformTreasury: PLATFORM_TREASURY,
          client: client.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc();

      // Verify invoice status
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.status).to.deep.equal({ partiallyPaid: {} });
      expect(invoice.amountPaid.toString()).to.equal(partialPayment.toString());

      // Verify invoice account received payment (SOL stored in invoice account)
      const invoiceBalanceAfter = await provider.connection.getBalance(invoicePDA);
      expect(invoiceBalanceAfter - invoiceBalanceBefore).to.equal(partialPayment.toNumber());

      // Verify platform treasury received fee
      const treasuryBalanceAfter = await provider.connection.getBalance(PLATFORM_TREASURY);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(expectedFee);
    });

    it("should complete SOL payment with second partial payment", async () => {
      const [invoicePDA] = getInvoicePDA(solPayInvoiceId, creator.publicKey);

      const remainingPayment = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL

      await program.methods
        .payInvoiceSol(solPayInvoiceId, remainingPayment)
        .accounts({
          invoice: invoicePDA,
          platformTreasury: PLATFORM_TREASURY,
          client: client.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc();

      // Verify invoice status is FullyPaid
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.status).to.deep.equal({ fullyPaid: {} });
      expect(invoice.amountPaid.toString()).to.equal(solInvoiceAmount.toString());
    });
  });

  describe("release_funds (USDC - Partial Releases)", () => {
    const releaseInvoiceId = "INV-RELEASE-001";
    const invoiceAmount = new anchor.BN(2000000); // 2 USDC

    before(async () => {
      const [invoicePDA] = getInvoicePDA(releaseInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(releaseInvoiceId, creator.publicKey);

      // Create invoice
      await program.methods
        .initializeConfig(releaseInvoiceId, invoiceAmount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      // Pay invoice fully
      await program.methods
        .payInvoice(releaseInvoiceId, invoiceAmount)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();
    });

    it("should release partial funds successfully", async () => {
      const [invoicePDA] = getInvoicePDA(releaseInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(releaseInvoiceId, creator.publicKey);

      const partialRelease = new anchor.BN(1000000); // 1 USDC

      const creatorBalanceBefore = await getAccount(provider.connection, creatorTokenAccount);

      await program.methods
        .releaseFunds(releaseInvoiceId, partialRelease)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          creatorToken: creatorTokenAccount,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Verify invoice state
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.amountReleased.toString()).to.equal(partialRelease.toString());
      expect(invoice.status).to.deep.equal({ fullyPaid: {} }); // Still FullyPaid, not Released yet

      // Verify creator received funds
      const creatorBalanceAfter = await getAccount(provider.connection, creatorTokenAccount);
      expect(Number(creatorBalanceAfter.amount) - Number(creatorBalanceBefore.amount)).to.equal(partialRelease.toNumber());
    });

    it("should release remaining funds and update status to Released", async () => {
      const [invoicePDA] = getInvoicePDA(releaseInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(releaseInvoiceId, creator.publicKey);

      const remainingRelease = new anchor.BN(1000000); // 1 USDC

      await program.methods
        .releaseFunds(releaseInvoiceId, remainingRelease)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          creatorToken: creatorTokenAccount,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Verify invoice status is Released
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.status).to.deep.equal({ released: {} });
      expect(invoice.amountReleased.toString()).to.equal(invoiceAmount.toString());
      expect(Number(invoice.releasedAt)).to.be.greaterThan(0);
    });

    it("should fail when release exceeds available funds", async () => {
      const testInvoiceId = "INV-RELEASE-EXCEED";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      // Create and pay invoice
      await program.methods
        .initializeConfig(testInvoiceId, amount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      await program.methods
        .payInvoice(testInvoiceId, amount)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      try {
        await program.methods
          .releaseFunds(testInvoiceId, new anchor.BN(2000000)) // Try to release more than paid
          .accounts({
            invoice: invoicePDA,
            escrow: escrowPDA,
            creatorToken: creatorTokenAccount,
            usdcMint: usdcMint,
            creator: creator.publicKey,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error.message).to.include("ReleaseExceedsAvailable");
      }
    });

    it("should fail when unauthorized user tries to release", async () => {
      const testInvoiceId = "INV-RELEASE-UNAUTH";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);
      const [clientInvoicePDA] = getInvoicePDA(testInvoiceId, client.publicKey);
      const [clientEscrowPDA] = getEscrowPDA(testInvoiceId, client.publicKey);

      // Create and pay invoice
      await program.methods
        .initializeConfig(testInvoiceId, amount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      await program.methods
        .payInvoice(testInvoiceId, amount)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      try {
        // Try to release using client's derived PDAs (wrong creator)
        await program.methods
          .releaseFunds(testInvoiceId, amount)
          .accounts({
            invoice: clientInvoicePDA, // This PDA doesn't exist
            escrow: clientEscrowPDA,
            creatorToken: clientTokenAccount,
            usdcMint: usdcMint,
            creator: client.publicKey, // Wrong creator
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([client])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        // The error will be about account not existing since PDAs are derived from creator
        expect(error.message).to.include("AccountNotInitialized");
      }
    });
  });

  describe("release_funds_sol (SOL - Partial Releases)", () => {
    const solReleaseInvoiceId = "INV-SOL-RELEASE-001";
    const solInvoiceAmount = new anchor.BN(2 * LAMPORTS_PER_SOL); // 2 SOL

    before(async () => {
      const [invoicePDA] = getInvoicePDA(solReleaseInvoiceId, creator.publicKey);

      // Create SOL invoice
      await program.methods
        .initializeConfigSol(solReleaseInvoiceId, solInvoiceAmount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Pay invoice fully
      await program.methods
        .payInvoiceSol(solReleaseInvoiceId, solInvoiceAmount)
        .accounts({
          invoice: invoicePDA,
          platformTreasury: PLATFORM_TREASURY,
          client: client.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc();
    });

    it("should release partial SOL funds successfully", async () => {
      const [invoicePDA] = getInvoicePDA(solReleaseInvoiceId, creator.publicKey);

      const partialRelease = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL

      const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);

      await program.methods
        .releaseFundsSol(solReleaseInvoiceId, partialRelease)
        .accounts({
          invoice: invoicePDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Verify invoice state
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.amountReleased.toString()).to.equal(partialRelease.toString());

      // Verify creator received funds (accounting for tx fees)
      const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.be.greaterThanOrEqual(partialRelease.toNumber() - 10000);
    });

    it("should release remaining SOL funds and update status to Released", async () => {
      const [invoicePDA] = getInvoicePDA(solReleaseInvoiceId, creator.publicKey);

      const remainingRelease = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL

      await program.methods
        .releaseFundsSol(solReleaseInvoiceId, remainingRelease)
        .accounts({
          invoice: invoicePDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Verify invoice status is Released
      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.status).to.deep.equal({ released: {} });
      expect(Number(invoice.releasedAt)).to.be.greaterThan(0);
    });
  });

  describe("Token Type Mismatch Validation", () => {
    it("should fail when paying USDC invoice with SOL method", async () => {
      const testInvoiceId = "INV-MISMATCH-USDC";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      // Create USDC invoice
      await program.methods
        .initializeConfig(testInvoiceId, amount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      try {
        await program.methods
          .payInvoiceSol(testInvoiceId, new anchor.BN(LAMPORTS_PER_SOL))
          .accounts({
            invoice: invoicePDA,
            platformTreasury: PLATFORM_TREASURY,
            client: client.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([client])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error.message).to.include("TokenTypeMismatch");
      }
    });

    it("should fail when paying SOL invoice with USDC method", async () => {
      const testInvoiceId = "INV-MISMATCH-SOL";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      // Create SOL invoice
      await program.methods
        .initializeConfigSol(testInvoiceId, new anchor.BN(LAMPORTS_PER_SOL), description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      try {
        await program.methods
          .payInvoice(testInvoiceId, amount)
          .accounts({
            invoice: invoicePDA,
            escrow: escrowPDA,
            clientToken: clientTokenAccount,
            platformTreasuryToken: platformTreasuryTokenAccount,
            usdcMint: usdcMint,
            client: client.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([client])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        // The error will be about escrow account not existing (different seeds)
        // since USDC escrow uses "escrow" seed and SOL invoice doesn't create one
        expect(error.message).to.include("AccountNotInitialized");
      }
    });
  });

  describe("Platform Fee Calculation", () => {
    it("should calculate 1% fee correctly on various amounts", async () => {
      const testInvoiceId = "INV-FEE-CALC";
      const testAmount = new anchor.BN(10000000); // 10 USDC
      const expectedFee = testAmount.toNumber() * PLATFORM_FEE_BPS / 10000; // 100000 (0.1 USDC)

      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      await program.methods
        .initializeConfig(testInvoiceId, testAmount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      const treasuryBalanceBefore = await getAccount(provider.connection, platformTreasuryTokenAccount);

      await program.methods
        .payInvoice(testInvoiceId, testAmount)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      const treasuryBalanceAfter = await getAccount(provider.connection, platformTreasuryTokenAccount);
      const feeReceived = Number(treasuryBalanceAfter.amount) - Number(treasuryBalanceBefore.amount);

      expect(feeReceived).to.equal(expectedFee);
    });
  });

  describe("Edge Cases", () => {
    it("should handle minimum payment amount (1 unit)", async () => {
      const testInvoiceId = "INV-MIN-PAY";
      const minAmount = new anchor.BN(100); // 0.0001 USDC

      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      await program.methods
        .initializeConfig(testInvoiceId, minAmount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      await program.methods
        .payInvoice(testInvoiceId, minAmount)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      const invoice = await program.account.invoice.fetch(invoicePDA);
      expect(invoice.status).to.deep.equal({ fullyPaid: {} });
    });

    it("should fail with zero release amount", async () => {
      const testInvoiceId = "INV-ZERO-RELEASE";
      const [invoicePDA] = getInvoicePDA(testInvoiceId, creator.publicKey);
      const [escrowPDA] = getEscrowPDA(testInvoiceId, creator.publicKey);

      await program.methods
        .initializeConfig(testInvoiceId, amount, description, clientEmail)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          usdcMint: usdcMint,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      await program.methods
        .payInvoice(testInvoiceId, amount)
        .accounts({
          invoice: invoicePDA,
          escrow: escrowPDA,
          clientToken: clientTokenAccount,
          platformTreasuryToken: platformTreasuryTokenAccount,
          usdcMint: usdcMint,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      try {
        await program.methods
          .releaseFunds(testInvoiceId, new anchor.BN(0))
          .accounts({
            invoice: invoicePDA,
            escrow: escrowPDA,
            creatorToken: creatorTokenAccount,
            usdcMint: usdcMint,
            creator: creator.publicKey,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error.message).to.include("InvalidReleaseAmount");
      }
    });
  });
});