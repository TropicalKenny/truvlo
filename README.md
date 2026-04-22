# Truvlo

Enterprise fintech escrow payment platform built on Solana blockchain. Create invoices, accept USDC or SOL payments, and release funds securely with non-custodial smart contract escrow.

## 🚀 Features

- **Escrow-Protected Invoicing** - Smart contract-based payment security
- **Multi-Token Support** - Accept payments in USDC or SOL
- **Milestone Payments** - Partial payment support for phased projects
- **Non-Custodial** - Funds secured by smart contracts, not intermediaries
- **1% Platform Fee** - Transparent, low-cost fee structure
- **Enterprise Design** - Clean, professional fintech UI (Ramp/Stripe aesthetic)

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Blockchain**: Solana + Anchor Framework
- **Wallet**: Solana Wallet Adapter (Phantom support)
- **Smart Contracts**: Rust (Anchor)

## 🔗 Smart Contract

- **Program ID**: `6Xw5T6ffJWiErJ4EQMN6wxno6rBxdhXfFYExnsJy8ia2`
- **Network**: Localhost/Devnet
- **Framework**: Anchor 0.30.0

## 📦 Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 🌐 Deployment

### Netlify Deployment

1. **Build Command**: `npm run build`
2. **Publish Directory**: `dist`
3. **Node Version**: 18.x or higher

### Environment Variables

For production deployment, configure:
- Solana RPC endpoint (devnet/mainnet)
- Update `src/App.tsx` with production RPC URL

## 🔐 Smart Contract Features

### Invoice Management
- Create USDC invoices
- Create SOL invoices
- View invoice status

### Payment Processing
- Full payment support
- Partial/milestone payments
- Automatic status tracking (Unpaid → PartiallyPaid → FullyPaid → Released)

### Fund Release
- Creator-controlled fund release
- Secure escrow withdrawal
- Platform fee collection (1%)

## 📄 License

All rights reserved.

## 🤝 Contributing

This is a private project. For questions or collaborations, please contact the repository owner.

## ⚠️ Security

- Never commit private keys or wallet files
- All sensitive files are listed in `.gitignore`
- Smart contracts are audited for common vulnerabilities
- Platform uses PDA-based security and authorization checks

## 📞 Support

For issues or questions, please open an issue on GitHub.

---

**Built with ❤️ on Solana**
