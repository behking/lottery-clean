# Startale Lotto Mini App

## Overview
This is a Farcaster Mini App for a lottery system called "Startale Lotto" built as part of the Startale Superstars Incubation program. The application allows users to participate in various lottery games including instant spin-the-wheel, weekly, biweekly, and monthly lotteries on the Soneium Minato testnet.

## Tech Stack
- **Frontend Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Web3 Integration**: Wagmi (latest) + Viem
- **Blockchain Network**: Soneium Minato (Chain ID: 1946)
- **Farcaster SDK**: @farcaster/miniapp-sdk
- **State Management**: @tanstack/react-query
- **Code Quality**: Biome for linting

## Project Structure
```
├── public/               # Static assets (icons, manifest, splash screens)
├── src/
│   ├── hooks/           # Custom React hooks
│   │   └── useTaskContract.ts  # Lottery contract interaction hooks
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Application entry point
│   ├── wagmi.ts         # Wagmi configuration for Soneium Minato
│   ├── viem.d.ts        # TypeScript declarations for viem
│   └── index.css        # Global styles
├── vite.config.ts       # Vite configuration (port 5000, 0.0.0.0)
└── package.json         # Project dependencies
```

## Key Features

### Instant Lottery (Spin-the-Wheel)
- Entry fee: $0.50
- Prizes: $2, $5, $10 cash or free tickets for other lotteries
- Animated spinning wheel with result modal
- 100% of entry goes to prize pool

### Scheduled Lotteries
- **Weekly**: $1/ticket, 6 winners split the pool
- **Biweekly**: $5/ticket, 3 winners split the pool
- **Monthly**: $20/ticket, 1 grand prize winner
- 80% to prize pool, 20% to treasury
- Live countdown timer to next draw
- Pool balance and participant count display
- Potential winnings calculator

### Ticket Purchase System
- Interactive slider for 1-50 tickets
- Manual ETH input option
- Real-time ETH/USD conversion display
- Visual 80/20 fund distribution bar

### Winners Display
- Recent winners shown in lottery tabs
- Highlights when connected wallet is a winner
- Quick claim button for winners

### Payment History
- Transaction records with date and amount
- ETH and USD value display
- Spin and ticket purchase tracking

### Wallet Features
- Connect/disconnect wallet
- Network switching to Soneium Minato
- Pending winnings banner with claim button

## Smart Contract Integration
- **Contract Address**: `0x5799fe0F34BAeab3D1c756023E46D3019FDFE6D8`
- **Network**: Soneium Minato (testnet)
- **Chain ID**: 1946
- **RPC URL**: https://rpc.minato.soneium.org
- **Block Explorer**: https://soneium-minato.blockscout.com

### Contract Functions
- `spinWheel()` - Instant lottery spin
- `buyTicket(uint8 _type, uint256 _quantity)` - Purchase lottery tickets
- `claimPrize()` - Claim pending winnings
- `getRoundDetails(uint8 _type)` - Get lottery round info
- `pendingWinnings(address user)` - Check claimable amount
- `ticketCredits(address user, uint8 type)` - Check free ticket credits

### Contract Events
- `SpinResult` - Instant lottery results
- `TicketPurchased` - Ticket purchases
- `LotteryDrawn` - Lottery draw results
- `WinningsClaimed` - Prize claims

## Development Setup

### Prerequisites
- Node.js (v20+ recommended)
- npm

### Installation
```bash
npm install
```

### Running the App
```bash
npm run dev
```
Access at `http://localhost:5000` or through Replit webview.

### Building for Production
```bash
npm run build
```

### Linting
```bash
npm run lint
```

## Configuration

### Vite Configuration
- **Host**: 0.0.0.0 (accessible from Replit proxy)
- **Port**: 5000 (Replit's default exposed port)
- **Allowed Hosts**: true (enables proxy access)

### Deployment
- **Type**: Static deployment
- **Build Command**: `npm run build`
- **Public Directory**: `dist`

## Recent Changes
- **2024-12-04**: Major UI/UX redesign
  - Modern gradient styling with glass morphism effects
  - Improved wheel design with glow effects and center hub
  - Added countdown timer for scheduled lotteries
  - Added pool balance, participant count, and potential winnings display
  - **Live ETH/USD pricing** via CoinGecko API with 1-minute refresh interval
  - Added ticket slider with manual ETH input
  - Added visual 80/20 distribution bar
  - Added payment history tab
  - Added winners display section with claim functionality
  - Updated to @farcaster/miniapp-sdk (from deprecated frame-sdk)
  - Fixed TypeScript declarations for viem

## User Preferences
None specified yet.

## Design Notes
- Dark theme with purple/amber accent colors
- Responsive mobile-first design (max-width: 420px)
- Smooth animations and transitions
- Accessibility-friendly contrast ratios
