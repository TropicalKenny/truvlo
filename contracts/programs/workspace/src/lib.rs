use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, CloseAccount};
use anchor_spl::associated_token::AssociatedToken;

// ============================================================
// PROGRAM ID — update after deployment
// ============================================================
declare_id!("12mH9wkUUvyQmhqD9A6gJzLGxEUCTZCCuddK6W9EbG2w");

// ============================================================
// CONSTANTS
// ============================================================

/// Platform treasury wallet
pub const PLATFORM_TREASURY: Pubkey = pubkey!("A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn");

/// Tiered fee: flat $2 in USDC micro-units (6 decimals) for invoices below $200
pub const FLAT_FEE_USDC: u64 = 2_000_000; // $2.00

/// Tiered fee threshold: $200 in USDC micro-units
pub const TIER_THRESHOLD_USDC: u64 = 200_000_000; // $200.00

/// Above threshold: 1% (100 basis points)
pub const PERCENTAGE_FEE_BPS: u64 = 100;

/// Auto-release timeout: 7 days in seconds
pub const AUTO_RELEASE_TIMEOUT: i64 = 7 * 24 * 60 * 60;

/// Max installments in a release schedule
pub const MAX_INSTALLMENTS: usize = 10;

// ============================================================
// PROGRAM
// ============================================================

#[program]
pub mod workspace {
    use super::*;

    // ----------------------------------------------------------
    // CREATE INVOICE — USDC
    // description and client_email removed — stored in Supabase
    // ----------------------------------------------------------
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        invoice_id: String,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(invoice_id.len() <= 32, ErrorCode::InvoiceIdTooLong);

        let invoice = &mut ctx.accounts.invoice;
        invoice.bump = ctx.bumps.invoice;
        invoice.escrow_bump = ctx.bumps.escrow;
        invoice.invoice_id = invoice_id;
        invoice.creator = ctx.accounts.creator.key();
        invoice.client = None;
        invoice.amount = amount;
        invoice.amount_paid = 0;
        invoice.amount_released = 0;
        invoice.token_type = TokenType::USDC;
        invoice.status = InvoiceStatus::Unpaid;
        invoice.created_at = Clock::get()?.unix_timestamp;
        invoice.paid_at = None;
        invoice.released_at = None;
        invoice.release_schedule = Vec::new();
        invoice.current_release_index = 0;
        invoice.completion_requested_at = None;
        invoice.client_approved = false;
        invoice.dispute_raised_at = None;
        invoice.verdict_hash = None;
        Ok(())
    }

    // ----------------------------------------------------------
    // CREATE INVOICE — SOL
    // description and client_email removed — stored in Supabase
    // ----------------------------------------------------------
    pub fn initialize_config_sol(
        ctx: Context<InitializeConfigSol>,
        invoice_id: String,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(invoice_id.len() <= 32, ErrorCode::InvoiceIdTooLong);

        let invoice = &mut ctx.accounts.invoice;
        invoice.bump = ctx.bumps.invoice;
        invoice.escrow_bump = 0;
        invoice.invoice_id = invoice_id;
        invoice.creator = ctx.accounts.creator.key();
        invoice.client = None;
        invoice.amount = amount;
        invoice.amount_paid = 0;
        invoice.amount_released = 0;
        invoice.token_type = TokenType::SOL;
        invoice.status = InvoiceStatus::Unpaid;
        invoice.created_at = Clock::get()?.unix_timestamp;
        invoice.paid_at = None;
        invoice.released_at = None;
        invoice.release_schedule = Vec::new();
        invoice.current_release_index = 0;
        invoice.completion_requested_at = None;
        invoice.client_approved = false;
        invoice.dispute_raised_at = None;
        invoice.verdict_hash = None;
        Ok(())
    }

    // ----------------------------------------------------------
    // PAY INVOICE — USDC
    // Tiered fee: flat $2 below $200 USDC, 1% above
    // Fee is always paid by the client, never the creator
    // ----------------------------------------------------------
    pub fn pay_invoice(
        ctx: Context<PayInvoice>,
        invoice_id: String,
        payment_amount: u64,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(payment_amount > 0, ErrorCode::InvalidPaymentAmount);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::Unpaid || invoice.status == InvoiceStatus::PartiallyPaid,
            ErrorCode::InvoiceNotPayable
        );
        require!(invoice.token_type == TokenType::USDC, ErrorCode::TokenTypeMismatch);
        let remaining = invoice.amount.checked_sub(invoice.amount_paid).ok_or(ErrorCode::MathOverflow)?;
        require!(payment_amount <= remaining, ErrorCode::PaymentExceedsRemaining);

        // Tiered fee for USDC — threshold is exact in micro-units
        let fee = if payment_amount < TIER_THRESHOLD_USDC {
            FLAT_FEE_USDC // $2 flat
        } else {
            payment_amount
                .checked_mul(PERCENTAGE_FEE_BPS)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::MathOverflow)?
        };

        // Transfer payment_amount to escrow
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
                from: ctx.accounts.client_token.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.client.to_account_info(),
            }),
            payment_amount,
        )?;

        // Transfer fee to platform treasury
        if fee > 0 {
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
                    from: ctx.accounts.client_token.to_account_info(),
                    to: ctx.accounts.platform_treasury_token.to_account_info(),
                    authority: ctx.accounts.client.to_account_info(),
                }),
                fee,
            )?;
        }

        let invoice = &mut ctx.accounts.invoice;
        let new_amount_paid = invoice.amount_paid.checked_add(payment_amount).ok_or(ErrorCode::MathOverflow)?;
        invoice.amount_paid = new_amount_paid;
        if invoice.client.is_none() { invoice.client = Some(ctx.accounts.client.key()); }
        if new_amount_paid == invoice.amount {
            invoice.status = InvoiceStatus::FullyPaid;
            invoice.paid_at = Some(Clock::get()?.unix_timestamp);
        } else {
            invoice.status = InvoiceStatus::PartiallyPaid;
        }
        Ok(())
    }

    // ----------------------------------------------------------
    // PAY INVOICE — SOL
    // Fee is calculated on the frontend using Pyth Hermes REST API
    // and passed in as fee_amount (in lamports).
    // Frontend logic: below $200 USD = flat $2 in SOL, above = 1%
    // Contract enforces fee > 0 and transfers it to treasury
    // ----------------------------------------------------------
    pub fn pay_invoice_sol(
        ctx: Context<PayInvoiceSol>,
        invoice_id: String,
        payment_amount: u64,
        fee_amount: u64,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(payment_amount > 0, ErrorCode::InvalidPaymentAmount);
        require!(fee_amount > 0, ErrorCode::InvalidFeeAmount);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::Unpaid || invoice.status == InvoiceStatus::PartiallyPaid,
            ErrorCode::InvoiceNotPayable
        );
        require!(invoice.token_type == TokenType::SOL, ErrorCode::TokenTypeMismatch);
        let remaining = invoice.amount.checked_sub(invoice.amount_paid).ok_or(ErrorCode::MathOverflow)?;
        require!(payment_amount <= remaining, ErrorCode::PaymentExceedsRemaining);

        let fee = fee_amount;

        // Transfer payment to invoice account (SOL escrow)
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), system_program::Transfer {
                from: ctx.accounts.client.to_account_info(),
                to: ctx.accounts.invoice.to_account_info(),
            }),
            payment_amount,
        )?;

        // Transfer fee to platform treasury
        if fee > 0 {
            system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.to_account_info(), system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.platform_treasury.to_account_info(),
                }),
                fee,
            )?;
        }

        let invoice = &mut ctx.accounts.invoice;
        let new_amount_paid = invoice.amount_paid.checked_add(payment_amount).ok_or(ErrorCode::MathOverflow)?;
        invoice.amount_paid = new_amount_paid;
        if invoice.client.is_none() { invoice.client = Some(ctx.accounts.client.key()); }
        if new_amount_paid == invoice.amount {
            invoice.status = InvoiceStatus::FullyPaid;
            invoice.paid_at = Some(Clock::get()?.unix_timestamp);
        } else {
            invoice.status = InvoiceStatus::PartiallyPaid;
        }
        Ok(())
    }

    // ----------------------------------------------------------
    // SET RELEASE SCHEDULE
    // Called by client after paying full amount
    // schedule: basis points per installment, must sum to 10000
    // ----------------------------------------------------------
    pub fn set_release_schedule(
        ctx: Context<SetReleaseSchedule>,
        invoice_id: String,
        schedule: Vec<u16>,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(invoice.status == InvoiceStatus::FullyPaid, ErrorCode::InvoiceNotFullyPaid);
        require!(invoice.client == Some(ctx.accounts.client.key()), ErrorCode::Unauthorized);
        require!(invoice.release_schedule.is_empty(), ErrorCode::ScheduleAlreadySet);
        require!(!schedule.is_empty(), ErrorCode::InvalidSchedule);
        require!(schedule.len() <= MAX_INSTALLMENTS, ErrorCode::TooManyInstallments);
        for &bps in &schedule { require!(bps > 0, ErrorCode::InvalidSchedule); }
        let total: u32 = schedule.iter().map(|&x| x as u32).sum();
        require!(total == 10000, ErrorCode::ScheduleMustSumTo100);

        let invoice = &mut ctx.accounts.invoice;
        invoice.release_schedule = schedule;
        invoice.current_release_index = 0;
        Ok(())
    }

    // ----------------------------------------------------------
    // REQUEST RELEASE (DUAL APPROVAL — STEP 1)
    // Creator signals work is complete for current installment
    // Starts the 7-day client approval window
    // ----------------------------------------------------------
    pub fn request_release(
        ctx: Context<RequestRelease>,
        invoice_id: String,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(invoice.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        require!(
            invoice.status == InvoiceStatus::PartiallyPaid || invoice.status == InvoiceStatus::FullyPaid,
            ErrorCode::InvoiceNotReleasable
        );
        require!(invoice.status != InvoiceStatus::Disputed, ErrorCode::InvoiceDisputed);
        require!(invoice.completion_requested_at.is_none(), ErrorCode::ReleaseAlreadyRequested);

        let invoice = &mut ctx.accounts.invoice;
        invoice.completion_requested_at = Some(Clock::get()?.unix_timestamp);
        invoice.client_approved = false;
        Ok(())
    }

    // ----------------------------------------------------------
    // APPROVE RELEASE (DUAL APPROVAL — STEP 2)
    // Client approves — funds can now be released
    // ----------------------------------------------------------
    pub fn approve_release(
        ctx: Context<ApproveRelease>,
        invoice_id: String,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(invoice.client == Some(ctx.accounts.client.key()), ErrorCode::Unauthorized);
        require!(invoice.completion_requested_at.is_some(), ErrorCode::NoReleaseRequested);
        require!(invoice.status != InvoiceStatus::Disputed, ErrorCode::InvoiceDisputed);

        let invoice = &mut ctx.accounts.invoice;
        invoice.client_approved = true;
        Ok(())
    }

    // ----------------------------------------------------------
    // RAISE DISPUTE
    // Client raises dispute within 7-day window
    // Remaining unreleased installments freeze immediately
    // ----------------------------------------------------------
    pub fn raise_dispute(
        ctx: Context<RaiseDispute>,
        invoice_id: String,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(invoice.client == Some(ctx.accounts.client.key()), ErrorCode::Unauthorized);
        require!(
            invoice.status == InvoiceStatus::PartiallyPaid || invoice.status == InvoiceStatus::FullyPaid,
            ErrorCode::InvoiceNotReleasable
        );
        require!(invoice.status != InvoiceStatus::Disputed, ErrorCode::AlreadyDisputed);

        // Must be within the 7-day window after a release request
        if let Some(requested_at) = invoice.completion_requested_at {
            let now = Clock::get()?.unix_timestamp;
            require!(
                now - requested_at <= AUTO_RELEASE_TIMEOUT,
                ErrorCode::DisputeWindowExpired
            );
        } else {
            // Can also dispute without a pending release request (while funds are in escrow)
        }

        let invoice = &mut ctx.accounts.invoice;
        invoice.status = InvoiceStatus::Disputed;
        invoice.dispute_raised_at = Some(Clock::get()?.unix_timestamp);
        invoice.completion_requested_at = None; // Cancel pending release request
        invoice.client_approved = false;
        Ok(())
    }

    // ----------------------------------------------------------
    // RELEASE FUNDS — USDC
    // Requires either:
    //   (a) client approved, OR
    //   (b) 7-day timeout has passed since request
    // Enforces installment schedule if set
    // ----------------------------------------------------------
    pub fn release_funds(
        ctx: Context<ReleaseFunds>,
        invoice_id: String,
        release_amount: u64,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(release_amount > 0, ErrorCode::InvalidReleaseAmount);
        require!(invoice.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::PartiallyPaid || invoice.status == InvoiceStatus::FullyPaid,
            ErrorCode::InvoiceNotReleasable
        );
        require!(invoice.token_type == TokenType::USDC, ErrorCode::TokenTypeMismatch);
        require!(invoice.status != InvoiceStatus::Disputed, ErrorCode::InvoiceDisputed);

        // Dual approval check: must have request + either approval or timeout
        require!(invoice.completion_requested_at.is_some(), ErrorCode::NoReleaseRequested);
        let requested_at = invoice.completion_requested_at.unwrap();
        let now = Clock::get()?.unix_timestamp;
        let timeout_passed = now - requested_at > AUTO_RELEASE_TIMEOUT;
        require!(
            invoice.client_approved || timeout_passed,
            ErrorCode::AwaitingClientApproval
        );

        // Enforce installment schedule if set
        if !invoice.release_schedule.is_empty() {
            let idx = invoice.current_release_index as usize;
            require!(idx < invoice.release_schedule.len(), ErrorCode::AllInstallmentsReleased);
            let installment_bps = invoice.release_schedule[idx] as u64;
            let installment_amount = invoice.amount_paid
                .checked_mul(installment_bps).ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000).ok_or(ErrorCode::MathOverflow)?;
            require!(release_amount == installment_amount, ErrorCode::InvalidInstallmentAmount);
        }

        let releasable = invoice.amount_paid.checked_sub(invoice.amount_released).ok_or(ErrorCode::MathOverflow)?;
        require!(release_amount <= releasable, ErrorCode::ReleaseExceedsAvailable);

        let creator_key = ctx.accounts.creator.key();
        let invoice_id_bytes = invoice.invoice_id.as_bytes();
        let escrow_bump = invoice.escrow_bump;
        let bump_arr = [escrow_bump];
        let seeds = &[b"escrow", invoice_id_bytes, creator_key.as_ref(), &bump_arr];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.creator_token.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            }, signer_seeds),
            release_amount,
        )?;

        let invoice = &mut ctx.accounts.invoice;
        let new_amount_released = invoice.amount_released.checked_add(release_amount).ok_or(ErrorCode::MathOverflow)?;
        invoice.amount_released = new_amount_released;

        if !invoice.release_schedule.is_empty() {
            invoice.current_release_index = invoice.current_release_index.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        }

        // Reset approval state for next installment
        invoice.completion_requested_at = None;
        invoice.client_approved = false;

        if new_amount_released == invoice.amount_paid && invoice.amount_paid == invoice.amount {
            invoice.status = InvoiceStatus::Released;
            invoice.released_at = Some(Clock::get()?.unix_timestamp);

            // Close escrow account and return rent to creator
            let creator_key = ctx.accounts.creator.key();
            let invoice_id_bytes = ctx.accounts.invoice.invoice_id.as_bytes();
            let escrow_bump = ctx.accounts.invoice.escrow_bump;
            let bump_arr = [escrow_bump];
            let seeds = &[b"escrow", invoice_id_bytes, creator_key.as_ref(), &bump_arr];
            let signer_seeds: &[&[&[u8]]] = &[seeds];
            token::close_account(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), CloseAccount {
                    account: ctx.accounts.escrow.to_account_info(),
                    destination: ctx.accounts.creator.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                }, signer_seeds),
            )?;
        }
        Ok(())
    }

    // ----------------------------------------------------------
    // RELEASE FUNDS — SOL
    // Same dual approval logic as USDC version
    // ----------------------------------------------------------
    pub fn release_funds_sol(
        ctx: Context<ReleaseFundsSol>,
        invoice_id: String,
        release_amount: u64,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(release_amount > 0, ErrorCode::InvalidReleaseAmount);
        require!(invoice.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::PartiallyPaid || invoice.status == InvoiceStatus::FullyPaid,
            ErrorCode::InvoiceNotReleasable
        );
        require!(invoice.token_type == TokenType::SOL, ErrorCode::TokenTypeMismatch);
        require!(invoice.status != InvoiceStatus::Disputed, ErrorCode::InvoiceDisputed);

        // Dual approval check
        require!(invoice.completion_requested_at.is_some(), ErrorCode::NoReleaseRequested);
        let requested_at = invoice.completion_requested_at.unwrap();
        let now = Clock::get()?.unix_timestamp;
        let timeout_passed = now - requested_at > AUTO_RELEASE_TIMEOUT;
        require!(invoice.client_approved || timeout_passed, ErrorCode::AwaitingClientApproval);

        // Enforce installment schedule if set
        if !invoice.release_schedule.is_empty() {
            let idx = invoice.current_release_index as usize;
            require!(idx < invoice.release_schedule.len(), ErrorCode::AllInstallmentsReleased);
            let installment_bps = invoice.release_schedule[idx] as u64;
            let installment_amount = invoice.amount_paid
                .checked_mul(installment_bps).ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000).ok_or(ErrorCode::MathOverflow)?;
            require!(release_amount == installment_amount, ErrorCode::InvalidInstallmentAmount);
        }

        let releasable = invoice.amount_paid.checked_sub(invoice.amount_released).ok_or(ErrorCode::MathOverflow)?;
        require!(release_amount <= releasable, ErrorCode::ReleaseExceedsAvailable);
        let new_amount_released = invoice.amount_released.checked_add(release_amount).ok_or(ErrorCode::MathOverflow)?;
        let is_final_release = new_amount_released == invoice.amount_paid && invoice.amount_paid == invoice.amount;

        let invoice_info = ctx.accounts.invoice.to_account_info();
        let creator_info = ctx.accounts.creator.to_account_info();
        let rent = Rent::get()?;
        let rent_exempt_minimum = rent.minimum_balance(8 + Invoice::LEN);
        let invoice_lamports = invoice_info.lamports();
        let available_lamports = invoice_lamports.checked_sub(rent_exempt_minimum).ok_or(ErrorCode::MathOverflow)?;

        if is_final_release {
            **invoice_info.try_borrow_mut_lamports()? = rent_exempt_minimum;
            **creator_info.try_borrow_mut_lamports()? = creator_info.lamports()
                .checked_add(available_lamports).ok_or(ErrorCode::MathOverflow)?;
        } else {
            require!(release_amount <= available_lamports, ErrorCode::ReleaseExceedsAvailable);
            **invoice_info.try_borrow_mut_lamports()? = invoice_lamports
                .checked_sub(release_amount).ok_or(ErrorCode::MathOverflow)?;
            **creator_info.try_borrow_mut_lamports()? = creator_info.lamports()
                .checked_add(release_amount).ok_or(ErrorCode::MathOverflow)?;
        }

        let invoice = &mut ctx.accounts.invoice;
        invoice.amount_released = new_amount_released;
        if !invoice.release_schedule.is_empty() {
            invoice.current_release_index = invoice.current_release_index.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        }
        invoice.completion_requested_at = None;
        invoice.client_approved = false;

        if is_final_release {
            invoice.status = InvoiceStatus::Released;
            invoice.released_at = Some(Clock::get()?.unix_timestamp);
        }
        Ok(())
    }

    // ----------------------------------------------------------
    // RESOLVE DISPUTE (KENNY ONLY)
    // Kenny splits funds manually after reviewing evidence
    // creator_bps + client_bps must equal 10000
    // Only remaining unreleased installments are split
    // ----------------------------------------------------------
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        invoice_id: String,
        creator_bps: u16,
        client_bps: u16,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(invoice.status == InvoiceStatus::Disputed, ErrorCode::NotDisputed);
        require!(ctx.accounts.kenny.key() == PLATFORM_TREASURY, ErrorCode::Unauthorized);
        if let Some(client_key) = invoice.client {
            require!(ctx.accounts.client_token.owner == client_key, ErrorCode::InvalidOwner);
        }
        require!(creator_bps as u32 + client_bps as u32 == 10000, ErrorCode::InvalidSplit);
        require!(invoice.token_type == TokenType::USDC, ErrorCode::TokenTypeMismatch);

        let splittable = invoice.amount_paid
            .checked_sub(invoice.amount_released)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(splittable > 0, ErrorCode::NoFundsToSplit);

        let creator_share = splittable
            .checked_mul(creator_bps as u64).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)?;
        let client_share = splittable
            .checked_sub(creator_share).ok_or(ErrorCode::MathOverflow)?;

        let creator_key = ctx.accounts.creator.key();
        let invoice_id_bytes = invoice.invoice_id.as_bytes();
        let escrow_bump = invoice.escrow_bump;
        let bump_arr = [escrow_bump];
        let seeds = &[b"escrow", invoice_id_bytes, creator_key.as_ref(), &bump_arr];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        if creator_share > 0 {
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.creator_token.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                }, signer_seeds),
                creator_share,
            )?;
        }

        if client_share > 0 {
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.client_token.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                }, signer_seeds),
                client_share,
            )?;
        }

        let invoice = &mut ctx.accounts.invoice;
        invoice.amount_released = invoice.amount_released.checked_add(creator_share).ok_or(ErrorCode::MathOverflow)?;
        invoice.status = InvoiceStatus::Released;
        invoice.released_at = Some(Clock::get()?.unix_timestamp);

        // Close escrow
        let creator_key = ctx.accounts.creator.key();
        let invoice_id_bytes = ctx.accounts.invoice.invoice_id.as_bytes();
        let escrow_bump = ctx.accounts.invoice.escrow_bump;
        let bump_arr = [escrow_bump];
        let seeds = &[b"escrow", invoice_id_bytes, creator_key.as_ref(), &bump_arr];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        token::close_account(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.creator.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            }, signer_seeds),
        )?;

        Ok(())
    }

    // ----------------------------------------------------------
    // RESOLVE DISPUTE - SOL (KENNY ONLY)
    // SOL escrow is held as lamports on the invoice PDA.
    // Keep the invoice rent-exempt and split only unreleased funds.
    // ----------------------------------------------------------
    pub fn resolve_dispute_sol(
        ctx: Context<ResolveDisputeSol>,
        invoice_id: String,
        creator_bps: u16,
        client_bps: u16,
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(invoice.status == InvoiceStatus::Disputed, ErrorCode::NotDisputed);
        require!(ctx.accounts.kenny.key() == PLATFORM_TREASURY, ErrorCode::Unauthorized);
        require!(invoice.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        if let Some(client_key) = invoice.client {
            require!(ctx.accounts.client.key() == client_key, ErrorCode::InvalidOwner);
        } else {
            return err!(ErrorCode::InvalidOwner);
        }
        require!(creator_bps as u32 + client_bps as u32 == 10000, ErrorCode::InvalidSplit);
        require!(invoice.token_type == TokenType::SOL, ErrorCode::TokenTypeMismatch);

        let splittable = invoice.amount_paid
            .checked_sub(invoice.amount_released)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(splittable > 0, ErrorCode::NoFundsToSplit);

        let creator_share = splittable
            .checked_mul(creator_bps as u64).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)?;
        let client_share = splittable
            .checked_sub(creator_share).ok_or(ErrorCode::MathOverflow)?;

        let invoice_info = ctx.accounts.invoice.to_account_info();
        let creator_info = ctx.accounts.creator.to_account_info();
        let client_info = ctx.accounts.client.to_account_info();
        let rent = Rent::get()?;
        let rent_exempt_minimum = rent.minimum_balance(8 + Invoice::LEN);
        let invoice_lamports = invoice_info.lamports();
        let available_lamports = invoice_lamports.checked_sub(rent_exempt_minimum).ok_or(ErrorCode::MathOverflow)?;
        require!(splittable <= available_lamports, ErrorCode::ReleaseExceedsAvailable);

        let total_split = creator_share.checked_add(client_share).ok_or(ErrorCode::MathOverflow)?;
        **invoice_info.try_borrow_mut_lamports()? = invoice_lamports
            .checked_sub(total_split).ok_or(ErrorCode::MathOverflow)?;
        if creator_share > 0 {
            **creator_info.try_borrow_mut_lamports()? = creator_info.lamports()
                .checked_add(creator_share).ok_or(ErrorCode::MathOverflow)?;
        }
        if client_share > 0 {
            **client_info.try_borrow_mut_lamports()? = client_info.lamports()
                .checked_add(client_share).ok_or(ErrorCode::MathOverflow)?;
        }

        let invoice = &mut ctx.accounts.invoice;
        invoice.amount_released = invoice.amount_released.checked_add(creator_share).ok_or(ErrorCode::MathOverflow)?;
        invoice.status = InvoiceStatus::Released;
        invoice.released_at = Some(Clock::get()?.unix_timestamp);

        Ok(())
    }

    // ----------------------------------------------------------
    // STORE VERDICT HASH (KENNY ONLY)
    // SHA-512 hash of the dispute verdict produced off-chain.
    // Written on-chain after Claude reviews evidence in Supabase.
    // Provides cryptographic proof of verdict — not just "trust me".
    // ----------------------------------------------------------
    pub fn store_verdict_hash(
        ctx: Context<StoreVerdictHash>,
        invoice_id: String,
        hash: [u8; 64],
    ) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(invoice.status == InvoiceStatus::Disputed, ErrorCode::NotDisputed);
        require!(ctx.accounts.kenny.key() == PLATFORM_TREASURY, ErrorCode::Unauthorized);

        let invoice = &mut ctx.accounts.invoice;
        invoice.verdict_hash = Some(hash);
        Ok(())
    }
}

// ============================================================
// ACCOUNT CONTEXTS
// ============================================================

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct InitializeConfig<'info> {
    #[account(init, seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()], bump, payer = creator, space = 8 + Invoice::LEN)]
    pub invoice: Account<'info, Invoice>,
    #[account(init, seeds = [b"escrow", invoice_id.as_bytes(), creator.key().as_ref()], bump, payer = creator, token::mint = usdc_mint, token::authority = escrow)]
    pub escrow: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)] pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct InitializeConfigSol<'info> {
    #[account(init, seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()], bump, payer = creator, space = 8 + Invoice::LEN)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)] pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct PayInvoice<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut, seeds = [b"escrow", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.escrow_bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, constraint = client_token.mint == usdc_mint.key() @ ErrorCode::InvalidMint, constraint = client_token.owner == client.key() @ ErrorCode::InvalidOwner)]
    pub client_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = platform_treasury_token.mint == usdc_mint.key() @ ErrorCode::InvalidMint, constraint = platform_treasury_token.owner == PLATFORM_TREASURY @ ErrorCode::InvalidTreasury)]
    pub platform_treasury_token: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)] pub client: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct PayInvoiceSol<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    /// CHECK: Platform treasury — validated by constraint
    #[account(mut, constraint = platform_treasury.key() == PLATFORM_TREASURY @ ErrorCode::InvalidTreasury)]
    pub platform_treasury: AccountInfo<'info>,
    #[account(mut)] pub client: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct SetReleaseSchedule<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)] pub client: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct RequestRelease<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()], bump = invoice.bump, constraint = invoice.creator == creator.key() @ ErrorCode::Unauthorized)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)] pub creator: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct ApproveRelease<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)] pub client: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct RaiseDispute<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)] pub client: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct ReleaseFunds<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()], bump = invoice.bump, constraint = invoice.creator == creator.key() @ ErrorCode::Unauthorized)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut, seeds = [b"escrow", invoice_id.as_bytes(), creator.key().as_ref()], bump = invoice.escrow_bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = creator, associated_token::mint = usdc_mint, associated_token::authority = creator)]
    pub creator_token: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)] pub creator: Signer<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct ReleaseFundsSol<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()], bump = invoice.bump, constraint = invoice.creator == creator.key() @ ErrorCode::Unauthorized)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)] pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct ResolveDispute<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut, seeds = [b"escrow", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.escrow_bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = kenny, associated_token::mint = usdc_mint, associated_token::authority = creator)]
    pub creator_token: Account<'info, TokenAccount>,
    /// Client token account — validated in instruction body
    #[account(mut)]
    pub client_token: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: Creator account for token association
    pub creator: AccountInfo<'info>,
    /// Kenny's wallet — must match PLATFORM_TREASURY
    #[account(mut, constraint = kenny.key() == PLATFORM_TREASURY @ ErrorCode::Unauthorized)]
    pub kenny: Signer<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct ResolveDisputeSol<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    /// CHECK: Creator account - validated in instruction body
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    /// CHECK: Client account - validated in instruction body
    #[account(mut)]
    pub client: AccountInfo<'info>,
    /// Kenny's wallet - must match PLATFORM_TREASURY
    #[account(mut, constraint = kenny.key() == PLATFORM_TREASURY @ ErrorCode::Unauthorized)]
    pub kenny: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct StoreVerdictHash<'info> {
    #[account(mut, seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()], bump = invoice.bump)]
    pub invoice: Account<'info, Invoice>,
    /// Kenny's wallet — must match PLATFORM_TREASURY
    #[account(mut, constraint = kenny.key() == PLATFORM_TREASURY @ ErrorCode::Unauthorized)]
    pub kenny: Signer<'info>,
}

// ============================================================
// INVOICE ACCOUNT
// ============================================================

#[account]
pub struct Invoice {
    pub bump: u8,
    pub escrow_bump: u8,
    pub invoice_id: String,                  // max 32
    pub creator: Pubkey,
    pub client: Option<Pubkey>,
    pub amount: u64,
    pub amount_paid: u64,
    pub amount_released: u64,
    pub token_type: TokenType,
    pub status: InvoiceStatus,
    pub created_at: i64,
    pub paid_at: Option<i64>,
    pub released_at: Option<i64>,
    // Release schedule
    pub release_schedule: Vec<u16>,          // basis points, sums to 10000
    pub current_release_index: u8,
    // Dual approval
    pub completion_requested_at: Option<i64>,
    pub client_approved: bool,
    // Dispute
    pub dispute_raised_at: Option<i64>,
    pub verdict_hash: Option<[u8; 64]>,      // SHA-512 of off-chain verdict
}

impl Invoice {
    pub const LEN: usize =
        1 +                         // bump
        1 +                         // escrow_bump
        (4 + 32) +                  // invoice_id String (max 32 bytes)
        32 +                        // creator Pubkey
        (1 + 32) +                  // client Option<Pubkey>
        8 +                         // amount
        8 +                         // amount_paid
        8 +                         // amount_released
        1 +                         // token_type
        1 +                         // status
        8 +                         // created_at
        (1 + 8) +                   // paid_at Option<i64>
        (1 + 8) +                   // released_at Option<i64>
        (4 + MAX_INSTALLMENTS * 2) + // release_schedule Vec<u16>
        1 +                         // current_release_index
        (1 + 8) +                   // completion_requested_at Option<i64>
        1 +                         // client_approved bool
        (1 + 8) +                   // dispute_raised_at Option<i64>
        (1 + 64);                   // verdict_hash Option<[u8; 64]>
}

// ============================================================
// ENUMS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TokenType { USDC = 0, SOL = 1 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum InvoiceStatus {
    Unpaid = 0,
    PartiallyPaid = 1,
    FullyPaid = 2,
    Released = 3,
    Disputed = 4,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")] InvalidAmount,
    #[msg("Invoice ID too long — max 32 chars")] InvoiceIdTooLong,
    #[msg("Invoice is not payable")] InvoiceNotPayable,
    #[msg("Invoice is not releasable")] InvoiceNotReleasable,
    #[msg("Invoice must be fully paid before setting release schedule")] InvoiceNotFullyPaid,
    #[msg("Invalid invoice ID")] InvalidInvoiceId,
    #[msg("Unauthorized")] Unauthorized,
    #[msg("Invalid mint")] InvalidMint,
    #[msg("Invalid owner")] InvalidOwner,
    #[msg("Invalid treasury")] InvalidTreasury,
    #[msg("Math overflow")] MathOverflow,
    #[msg("Invalid payment amount")] InvalidPaymentAmount,
    #[msg("Invalid fee amount — must be greater than 0")] InvalidFeeAmount,
    #[msg("Payment exceeds remaining invoice amount")] PaymentExceedsRemaining,
    #[msg("Invalid release amount")] InvalidReleaseAmount,
    #[msg("Release amount exceeds available funds")] ReleaseExceedsAvailable,
    #[msg("Token type mismatch")] TokenTypeMismatch,
    #[msg("Invalid release schedule")] InvalidSchedule,
    #[msg("Release schedule must sum to exactly 100%")] ScheduleMustSumTo100,
    #[msg("Release schedule already set")] ScheduleAlreadySet,
    #[msg("Too many installments — max 10")] TooManyInstallments,
    #[msg("All installments have already been released")] AllInstallmentsReleased,
    #[msg("Release amount must match the current installment amount")] InvalidInstallmentAmount,
    #[msg("No release request pending — creator must request release first")] NoReleaseRequested,
    #[msg("Release request already pending")] ReleaseAlreadyRequested,
    #[msg("Awaiting client approval or 7-day timeout")] AwaitingClientApproval,
    #[msg("Invoice is disputed — funds are frozen")] InvoiceDisputed,
    #[msg("Invoice is not in disputed state")] NotDisputed,
    #[msg("Already disputed")] AlreadyDisputed,
    #[msg("Dispute window has expired")] DisputeWindowExpired,
    #[msg("creator_bps + client_bps must equal 10000")] InvalidSplit,
    #[msg("No funds available to split")] NoFundsToSplit,
}
