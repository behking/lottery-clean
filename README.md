# Startale Lotto - Decentralized Lottery Mini App 🎰

Welcome to the **Startale Lotto** repository! This is a Farcaster Mini App built on the **Soneium Minato** testnet, offering a decentralized lottery experience. Users can participate in instant spin-the-wheel games or join scheduled weekly, bi-weekly, and monthly draws.

![Startale Lotto Splash](public/splash.png)

## 🌟 Key Features

* **Instant Lottery (Spin-the-Wheel):**
    * Entry fee: $0.50
    * Win instant cash prizes ($2, $5, $10) or free tickets for other lotteries.
    * 100% of the entry fee goes directly to the prize pool.
    * Immediate payout or ticket credit upon winning.

* **Scheduled Lotteries:**
    * **Weekly:** $1/ticket, 6 winners share the pool.
    * **Bi-weekly:** $5/ticket, 3 winners share the pool.
    * **Monthly:** $20/ticket, 1 winner takes the entire pool.
    * **Fund Distribution:** 80% to the prize pool, 20% to the treasury.
    * **Automated Draws:** Winners are selected automatically at the scheduled time.

* **User-Friendly Interface:**
    * **Live Countdown:** Timers for all scheduled draws.
    * **Real-Time Stats:** View current pool balance, participants, and potential winnings.
    * **Ticket Slider:** Easily purchase multiple tickets with a slider or manual ETH input.
    * **Currency Conversion:** Automatic ETH to USD conversion for transparent pricing.
    * **Payment History:** Track all your spins and ticket purchases.
    * **Winners Dashboard:** See recent winners and claim your prizes with a single click.

## 🛠️ Tech Stack

* **Frontend:** React 18, TypeScript, Vite
* **Styling:** CSS Modules, Modern Glassmorphism UI
* **Web3 Integration:** Wagmi, Viem, TanStack Query
* **Blockchain:** Soneium Minato Testnet (Chain ID: 1946)
* **Farcaster Integration:** `@farcaster/miniapp-sdk`
* **Smart Contract:** Solidity (Foundry/Hardhat compatible)

## 🚀 Getting Started

Follow these steps to run the project locally:

### Prerequisites

* Node.js (v18 or higher)
* npm or yarn

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/startale-lotto.git](https://github.com/your-username/startale-lotto.git)
    cd startale-lotto
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

4.  Open `http://localhost:5173` (or the port shown in your terminal) to view the app.

## 📜 Smart Contract Details

The smart contract powers the logic for ticket purchases, random number generation (pseudo-random for testnet), and prize distribution.

* **Contract Address:** `0x5799fe0F34BAeab3D1c756023E46D3019FDFE6D8` (Soneium Minato)
* **Key Functions:**
    * `spinWheel()`: Executes the instant lottery logic.
    * `buyTicket(type, quantity)`: Purchases tickets for scheduled draws.
    * `claimPrize()`: Allows winners to withdraw their earnings.
    * `drawLottery(type)`: Triggers the draw for a specific lottery type.

## 🤝 Contributing

Contributions are welcome! If you have suggestions or find bugs, please open an issue or submit a pull request.

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Contact

If you have any questions, feel free to reach out via [Your Contact Info/Twitter/Farcaster Handle].

---

*Built with ❤️ for the Startale ecosystem.*