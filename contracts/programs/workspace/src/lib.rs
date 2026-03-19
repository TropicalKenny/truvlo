use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, CloseAccount};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("12mH9wkUUvyQmhqD9A6gJzLGxEUCTZCCuddK6W9EbG2w");

// Platform fee: 1% (100 basis points)
pub const PLATFORM_FEE_BPS: u16 = 100;

// Platform treasury for fee collection (devnet)
pub const PLATFORM_TREASURY: Pubkey = pubkey!("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

#[program]
pub mod workspace {
    use super::*;

    // invoice_id: String, Unique invoice identifier, INV-001
    // amount: u64, USDC amount in smallest units (6 decimals), 1000000 = 1 USDC
    // description: String, Invoice description (max 256 chars), Payment for services
    // client_email: String, Client email address (max 128 chars), client@example.com
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

        Ok(())
    }

    // invoice_id: String, Unique invoice identifier, INV-SOL-001
    // amount: u64, SOL amount in lamports (9 decimals), 1000000000 = 1 SOL
    // description: String, Invoice description (max 256 chars), Payment for services
    // client_email: String, Client email address (max 128 chars), client@example.com
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
        invoice.escrow_bump = 0; // Not used for SOL - we store SOL in invoice account
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

        Ok(())
    }

    // invoice_id: String, Invoice ID to pay, INV-001
    // payment_amount: u64, Amount to pay (partial or full), 500000 = 0.5 USDC
    pub fn pay_invoice(ctx: Context<PayInvoice>, invoice_id: String, payment_amount: u64) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        
        require!(payment_amount > 0, ErrorCode::InvalidPaymentAmount);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::Unpaid || invoice.status == InvoiceStatus::PartiallyPaid,
            ErrorCode::InvoiceNotPayable
        );
        require!(invoice.token_type == TokenType::USDC, ErrorCode::TokenTypeMismatch);
        
        // Calculate remaining amount to pay
        let remaining = invoice.amount.checked_sub(invoice.amount_paid).ok_or(ErrorCode::MathOverflow)?;
        require!(payment_amount <= remaining, ErrorCode::PaymentExceedsRemaining);

        // Calculate platform fee (1% of payment_amount)
        let fee = payment_amount
            .checked_mul(PLATFORM_FEE_BPS as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer payment to escrow
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.client_token.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.client.to_account_info(),
                },
            ),
            payment_amount,
        )?;

        // Transfer fee to platform treasury
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.client_token.to_account_info(),
                        to: ctx.accounts.platform_treasury_token.to_account_info(),
                        authority: ctx.accounts.client.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        // Update invoice state
        let invoice = &mut ctx.accounts.invoice;
        let new_amount_paid = invoice.amount_paid.checked_add(payment_amount).ok_or(ErrorCode::MathOverflow)?;
        invoice.amount_paid = new_amount_paid;
        
        if invoice.client.is_none() {
            invoice.client = Some(ctx.accounts.client.key());
        }

        // Update status based on payment progress
        if new_amount_paid == invoice.amount {
            invoice.status = InvoiceStatus::FullyPaid;
            invoice.paid_at = Some(Clock::get()?.unix_timestamp);
        } else {
            invoice.status = InvoiceStatus::PartiallyPaid;
        }

        Ok(())
    }

    // invoice_id: String, Invoice ID to pay, INV-SOL-001
    // payment_amount: u64, Amount to pay in lamports, 1000000000 = 1 SOL
    pub fn pay_invoice_sol(ctx: Context<PayInvoiceSol>, invoice_id: String, payment_amount: u64) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        
        require!(payment_amount > 0, ErrorCode::InvalidPaymentAmount);
        require!(invoice.invoice_id == invoice_id, ErrorCode::InvalidInvoiceId);
        require!(
            invoice.status == InvoiceStatus::Unpaid || invoice.status == InvoiceStatus::PartiallyPaid,
            ErrorCode::InvoiceNotPayable
        );
        require!(invoice.token_type == TokenType::SOL, ErrorCode::TokenTypeMismatch);
        
        // Calculate remaining amount to pay
        let remaining = invoice.amount.checked_sub(invoice.amount_paid).ok_or(ErrorCode::MathOverflow)?;
        require!(payment_amount <= remaining, ErrorCode::PaymentExceedsRemaining);

        // Calculate platform fee (1% of payment_amount)
        let fee = payment_amount
            .checked_mul(PLATFORM_FEE_BPS as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer payment to invoice account (which acts as SOL escrow)
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.invoice.to_account_info(),
                },
            ),
            payment_amount,
        )?;

        // Transfer fee to platform treasury
        if fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.client.to_account_info(),
                        to: ctx.accounts.platform_treasury.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        // Update invoice state
        let invoice = &mut ctx.accounts.invoice;
        let new_amount_paid = invoice.amount_paid.checked_add(payment_amount).ok_or(ErrorCode::MathOverflow)?;
        invoice.amount_paid = new_amount_paid;
        
        if invoice.client.is_none() {
            invoice.client = Some(ctx.accounts.client.key());
        }

        // Update status based on payment progress
        if new_amount_paid == invoice.amount {
            invoice.status = InvoiceStatus::FullyPaid;
            invoice.paid_at = Some(Clock::get()?.unix_timestamp);
        } else {
            invoice.status = InvoiceStatus::PartiallyPaid;
        }

        Ok(())
    }

    // invoice_id: String, Invoice ID to release funds, INV-001
    // release_amount: u64, Amount to release (partial or full), 500000 = 0.5 USDC
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

        // Calculate releasable amount
        let releasable = invoice.amount_paid.checked_sub(invoice.amount_released).ok_or(ErrorCode::MathOverflow)?;
        require!(release_amount <= releasable, ErrorCode::ReleaseExceedsAvailable);

        // Extract keys before seeds construction
        let creator_key = ctx.accounts.creator.key();
        let invoice_id_bytes = invoice.invoice_id.as_bytes();
        let escrow_bump = invoice.escrow_bump;
        let bump_arr = [escrow_bump];

        let seeds = &[
            b"escrow",
            invoice_id_bytes,
            creator_key.as_ref(),
            &bump_arr,
        ];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        // Transfer tokens from escrow to creator
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.creator_token.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            release_amount,
        )?;

        // Update invoice state
        let invoice = &mut ctx.accounts.invoice;
        let new_amount_released = invoice.amount_released.checked_add(release_amount).ok_or(ErrorCode::MathOverflow)?;
        invoice.amount_released = new_amount_released;

        // Update status if fully released and close escrow
        if new_amount_released == invoice.amount_paid && invoice.amount_paid == invoice.amount {
            invoice.status = InvoiceStatus::Released;
            invoice.released_at = Some(Clock::get()?.unix_timestamp);

            // Close escrow account
            let creator_key = ctx.accounts.creator.key();
            let invoice_id_bytes = ctx.accounts.invoice.invoice_id.as_bytes();
            let escrow_bump = ctx.accounts.invoice.escrow_bump;
            let bump_arr = [escrow_bump];

            let seeds = &[
                b"escrow",
                invoice_id_bytes,
                creator_key.as_ref(),
                &bump_arr,
            ];
            let signer_seeds: &[&[&[u8]]] = &[seeds];

            token::close_account(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    CloseAccount {
                        account: ctx.accounts.escrow.to_account_info(),
                        destination: ctx.accounts.creator.to_account_info(),
                        authority: ctx.accounts.escrow.to_account_info(),
                    },
                    signer_seeds,
                ),
            )?;
        }

        Ok(())
    }

    // invoice_id: String, Invoice ID to release funds, INV-SOL-001
    // release_amount: u64, Amount to release in lamports, 1000000000 = 1 SOL
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

        // Calculate releasable amount
        let releasable = invoice.amount_paid.checked_sub(invoice.amount_released).ok_or(ErrorCode::MathOverflow)?;
        require!(release_amount <= releasable, ErrorCode::ReleaseExceedsAvailable);

        // Calculate new released amount
        let new_amount_released = invoice.amount_released.checked_add(release_amount).ok_or(ErrorCode::MathOverflow)?;
        let is_final_release = new_amount_released == invoice.amount_paid && invoice.amount_paid == invoice.amount;

        // Get account infos for lamport manipulation
        // Invoice account is owned by our program, so we can manipulate its lamports
        let invoice_info = ctx.accounts.invoice.to_account_info();
        let creator_info = ctx.accounts.creator.to_account_info();
        
        // Calculate rent-exempt minimum for invoice account
        let rent = Rent::get()?;
        let rent_exempt_minimum = rent.minimum_balance(8 + Invoice::LEN);
        
        // Current lamports in invoice (includes rent + escrowed SOL)
        let invoice_lamports = invoice_info.lamports();
        
        // Available for release = total lamports - rent exempt minimum
        let available_lamports = invoice_lamports.checked_sub(rent_exempt_minimum).ok_or(ErrorCode::MathOverflow)?;
        
        if is_final_release {
            // Transfer all available lamports to creator (keep rent exempt minimum)
            let transfer_amount = available_lamports;
            **invoice_info.try_borrow_mut_lamports()? = rent_exempt_minimum;
            **creator_info.try_borrow_mut_lamports()? = creator_info
                .lamports()
                .checked_add(transfer_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        } else {
            // Partial release
            require!(release_amount <= available_lamports, ErrorCode::ReleaseExceedsAvailable);
            **invoice_info.try_borrow_mut_lamports()? = invoice_lamports
                .checked_sub(release_amount)
                .ok_or(ErrorCode::MathOverflow)?;
            **creator_info.try_borrow_mut_lamports()? = creator_info
                .lamports()
                .checked_add(release_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        // Update invoice state
        let invoice = &mut ctx.accounts.invoice;
        invoice.amount_released = new_amount_released;

        // Update status if fully released
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
    #[account(
        init,
        seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()],
        bump,
        payer = creator,
        space = 8 + Invoice::LEN
    )]
    pub invoice: Account<'info, Invoice>,

    #[account(
        init,
        seeds = [b"escrow", invoice_id.as_bytes(), creator.key().as_ref()],
        bump,
        payer = creator,
        token::mint = usdc_mint,
        token::authority = escrow,
    )]
    pub escrow: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct InitializeConfigSol<'info> {
    #[account(
        init,
        seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()],
        bump,
        payer = creator,
        space = 8 + Invoice::LEN
    )]
    pub invoice: Account<'info, Invoice>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct PayInvoice<'info> {
    #[account(
        mut,
        seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()],
        bump = invoice.bump,
    )]
    pub invoice: Account<'info, Invoice>,

    #[account(
        mut,
        seeds = [b"escrow", invoice_id.as_bytes(), invoice.creator.as_ref()],
        bump = invoice.escrow_bump,
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = client_token.mint == usdc_mint.key() @ ErrorCode::InvalidMint,
        constraint = client_token.owner == client.key() @ ErrorCode::InvalidOwner
    )]
    pub client_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = platform_treasury_token.mint == usdc_mint.key() @ ErrorCode::InvalidMint,
        constraint = platform_treasury_token.owner == PLATFORM_TREASURY @ ErrorCode::InvalidTreasury
    )]
    pub platform_treasury_token: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub client: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct PayInvoiceSol<'info> {
    #[account(
        mut,
        seeds = [b"invoice", invoice_id.as_bytes(), invoice.creator.as_ref()],
        bump = invoice.bump,
    )]
    pub invoice: Account<'info, Invoice>,

    /// CHECK: Platform treasury for SOL fees - validated by constraint
    #[account(
        mut,
        constraint = platform_treasury.key() == PLATFORM_TREASURY @ ErrorCode::InvalidTreasury
    )]
    pub platform_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub client: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct ReleaseFunds<'info> {
    #[account(
        mut,
        seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()],
        bump = invoice.bump,
        constraint = invoice.creator == creator.key() @ ErrorCode::Unauthorized
    )]
    pub invoice: Account<'info, Invoice>,

    #[account(
        mut,
        seeds = [b"escrow", invoice_id.as_bytes(), creator.key().as_ref()],
        bump = invoice.escrow_bump,
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = usdc_mint,
        associated_token::authority = creator,
    )]
    pub creator_token: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct ReleaseFundsSol<'info> {
    #[account(
        mut,
        seeds = [b"invoice", invoice_id.as_bytes(), creator.key().as_ref()],
        bump = invoice.bump,
        constraint = invoice.creator == creator.key() @ ErrorCode::Unauthorized
    )]
    pub invoice: Account<'info, Invoice>,

    #[account(mut)]
    pub creator: Signer<'info>,

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
}

impl Invoice {
    pub const LEN: usize = 1 + // bump
        1 + // escrow_bump
        (4 + 32) + // invoice_id (String: 4 bytes length + max 32 chars)
        32 + // creator
        (1 + 32) + // client (Option<Pubkey>)
        8 + // amount
        8 + // amount_paid
        8 + // amount_released
        1 + // token_type
        (4 + 256) + // description (String: 4 bytes length + max 256 chars)
        (4 + 128) + // client_email (String: 4 bytes length + max 128 chars)
        1 + // status
        8 + // created_at
        (1 + 8) + // paid_at (Option<i64>)
        (1 + 8); // released_at (Option<i64>)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TokenType {
    USDC = 0,
    SOL = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum InvoiceStatus {
    Unpaid = 0,
    PartiallyPaid = 1,
    FullyPaid = 2,
    Released = 3,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount - must be greater than 0")]
    InvalidAmount,
    #[msg("Description too long - max 256 characters")]
    DescriptionTooLong,
    #[msg("Email too long - max 128 characters")]
    EmailTooLong,
    #[msg("Invoice ID too long - max 32 characters")]
    InvoiceIdTooLong,
    #[msg("Invoice is not payable - must be Unpaid or PartiallyPaid")]
    InvoiceNotPayable,
    #[msg("Invoice is not releasable - must be PartiallyPaid or FullyPaid")]
    InvoiceNotReleasable,
    #[msg("Invalid invoice ID")]
    InvalidInvoiceId,
    #[msg("Unauthorized - only creator can perform this action")]
    Unauthorized,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Invalid treasury")]
    InvalidTreasury,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid payment amount - must be greater than 0")]
    InvalidPaymentAmount,
    #[msg("Payment exceeds remaining invoice amount")]
    PaymentExceedsRemaining,
    #[msg("Invalid release amount - must be greater than 0")]
    InvalidReleaseAmount,
    #[msg("Release amount exceeds available funds")]
    ReleaseExceedsAvailable,
    #[msg("Token type mismatch")]
    TokenTypeMismatch,
}
