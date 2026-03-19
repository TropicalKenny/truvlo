use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, CloseAccount};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("12mH9wkUUvyQmhqD9A6gJzLGxEUCTZCCuddK6W9EbG2w");

pub const PLATFORM_FEE_BPS: u16 = 100;
pub const PLATFORM_TREASURY: Pubkey = pubkey!("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
pub const MAX_INSTALLMENTS: usize = 10;

#[program]
pub mod workspace {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        invoice_id: String,
        amount: u64,
        description: String,
        client_email: String,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(description.len() <= 256, ErrorCode::DescriptionTooLong);
        require!(client_email.len() <= 128, ErrorCode::EmailTooLong);
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
        invoice.description = description;
        invoice.client_email = client_email;
        invoice.status = InvoiceStatus::Unpaid;
        invoice.created_at = Clock::get()?.unix_timestamp;
        invoice.paid_at = None;
        invoice.released_at = None;
        invoice.release_schedule = Vec::new();
        invoice.current_release_index = 0;
        Ok(())
    }

    pub fn initialize_config_sol(
        ctx: Context<InitializeConfigSol>,
        invoice_id: String,
        amount: u64,
        description: String,
        client_email: String,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(description.len() <= 256, ErrorCode::DescriptionTooLong);
        require!(client_email.len() <= 128, ErrorCode::EmailTooLong);
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
        invoice.description = description;
        invoice.client_email = client_email;
        invoice.status = InvoiceStatus::Unpaid;
        invoice.created_at = Clock::get()?.unix_timestamp;
        invoice.paid_at = None;
        invoice.released_at = None;
        invoice.release_schedule = Vec::new();
        invoice.current_release_index = 0;
        Ok(())
    }

    pub fn pay_invoice(ctx: Context<PayInvoice>, invoice_id: String, payment_amount: u64) -> Result<()> {
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
        let fee = payment_amount
            .checked_mul(PLATFORM_FEE_BPS as u64).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)?;
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
                from: ctx.accounts.client_token.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.client.to_account_info(),
            }),
            payment_amount,
        )?;
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

    pub fn pay_invoice_sol(ctx: Context<PayInvoiceSol>, invoice_id: String, payment_amount: u64) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(payment_amount > 0, ErrorCode::InvalidPaymentAmount);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::Unpaid || invoice.status == InvoiceStatus::PartiallyPaid,
            ErrorCode::InvoiceNotPayable
        );
        require!(invoice.token_type == TokenType::SOL, ErrorCode::TokenTypeMismatch);
        let remaining = invoice.amount.checked_sub(invoice.amount_paid).ok_or(ErrorCode::MathOverflow)?;
        require!(payment_amount <= remaining, ErrorCode::PaymentExceedsRemaining);
        let fee = payment_amount
            .checked_mul(PLATFORM_FEE_BPS as u64).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)?;
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), system_program::Transfer {
                from: ctx.accounts.client.to_account_info(),
                to: ctx.accounts.invoice.to_account_info(),
            }),
            payment_amount,
        )?;
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

    // Set release schedule — called by client after paying full amount
    // schedule: Vec of basis points per installment (must sum to 10000 = 100%)
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

    pub fn release_funds(ctx: Context<ReleaseFunds>, invoice_id: String, release_amount: u64) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(release_amount > 0, ErrorCode::InvalidReleaseAmount);
        require!(invoice.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::PartiallyPaid || invoice.status == InvoiceStatus::FullyPaid,
            ErrorCode::InvoiceNotReleasable
        );
        require!(invoice.token_type == TokenType::USDC, ErrorCode::TokenTypeMismatch);

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

        if new_amount_released == invoice.amount_paid && invoice.amount_paid == invoice.amount {
            invoice.status = InvoiceStatus::Released;
            invoice.released_at = Some(Clock::get()?.unix_timestamp);
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

    pub fn release_funds_sol(ctx: Context<ReleaseFundsSol>, invoice_id: String, release_amount: u64) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(release_amount > 0, ErrorCode::InvalidReleaseAmount);
        require!(invoice.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::PartiallyPaid || invoice.status == InvoiceStatus::FullyPaid,
            ErrorCode::InvoiceNotReleasable
        );
        require!(invoice.token_type == TokenType::SOL, ErrorCode::TokenTypeMismatch);

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
        if is_final_release {
            invoice.status = InvoiceStatus::Released;
            invoice.released_at = Some(Clock::get()?.unix_timestamp);
        }
        Ok(())
    }
}

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
    /// CHECK: Platform treasury for SOL fees
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

#[account]
pub struct Invoice {
    pub bump: u8,
    pub escrow_bump: u8,
    pub invoice_id: String,
    pub creator: Pubkey,
    pub client: Option<Pubkey>,
    pub amount: u64,
    pub amount_paid: u64,
    pub amount_released: u64,
    pub token_type: TokenType,
    pub description: String,
    pub client_email: String,
    pub status: InvoiceStatus,
    pub created_at: i64,
    pub paid_at: Option<i64>,
    pub released_at: Option<i64>,
    pub release_schedule: Vec<u16>,
    pub current_release_index: u8,
}

impl Invoice {
    pub const LEN: usize =
        1 + 1 + (4 + 32) + 32 + (1 + 32) + 8 + 8 + 8 + 1 +
        (4 + 256) + (4 + 128) + 1 + 8 + (1 + 8) + (1 + 8) +
        (4 + MAX_INSTALLMENTS * 2) + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TokenType { USDC = 0, SOL = 1 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum InvoiceStatus { Unpaid = 0, PartiallyPaid = 1, FullyPaid = 2, Released = 3 }

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")] InvalidAmount,
    #[msg("Description too long")] DescriptionTooLong,
    #[msg("Email too long")] EmailTooLong,
    #[msg("Invoice ID too long")] InvoiceIdTooLong,
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
    #[msg("Payment exceeds remaining invoice amount")] PaymentExceedsRemaining,
    #[msg("Invalid release amount")] InvalidReleaseAmount,
    #[msg("Release amount exceeds available funds")] ReleaseExceedsAvailable,
    #[msg("Token type mismatch")] TokenTypeMismatch,
    #[msg("Invalid schedule")] InvalidSchedule,
    #[msg("Release schedule must sum to exactly 100%")] ScheduleMustSumTo100,
    #[msg("Release schedule already set")] ScheduleAlreadySet,
    #[msg("Too many installments - max 10")] TooManyInstallments,
    #[msg("All installments have been released")] AllInstallmentsReleased,
    #[msg("Release amount must match current installment")] InvalidInstallmentAmount,
}
