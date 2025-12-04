import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useWatchContractEvent, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useLotteryContract, useRoundDetails, usePendingWinnings, lotteryAbi, CONTRACT_ADDRESS } from './hooks/useTaskContract';
import { useEthPrice } from './hooks/useEthPrice';
import { parseEther, formatEther } from 'viem';
import sdk from '@farcaster/miniapp-sdk';

const PRICES = { INSTANT: 0.5, WEEKLY: 1, BIWEEKLY: 5, MONTHLY: 20 };
const TARGET_CHAIN_ID = 1946;

type TabType = 'instant' | 'weekly' | 'biweekly' | 'monthly' | 'history';
type HistoryItem = { type: string; amount: string; date: string; hash: string };
type WinnerRecord = { address: string; prize: string; lotteryType: string; date: string };

const LOTTERY_TYPE_MAP: Record<string, number> = {
  weekly: 1,
  biweekly: 2,
  monthly: 3
};

const WINNER_COUNTS: Record<string, number> = {
  weekly: 6,
  biweekly: 3,
  monthly: 1
};

function App() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const { writeContract, isPending, isConfirming, isConfirmed, hash } = useLotteryContract();
  const { price: ethPriceUsd, isLoading: priceLoading } = useEthPrice();

  const [activeTab, setActiveTab] = useState<TabType>('instant');
  const [ticketCount, setTicketCount] = useState<number>(1);
  const [manualEthInput, setManualEthInput] = useState<string>("");
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  
  const [wheelRotation, setWheelRotation] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winDetails, setWinDetails] = useState<{amount: string, type: string} | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<HistoryItem[]>([]);
  const [recentWinners, setRecentWinners] = useState<WinnerRecord[]>([]);

  const processedHash = useRef<string | null>(null);

  const { data: claimableAmount, refetch: refetchClaim } = usePendingWinnings(address);
  
  const { data: weeklyDetails } = useRoundDetails(1, true);
  const { data: biweeklyDetails } = useRoundDetails(2, true);
  const { data: monthlyDetails } = useRoundDetails(3, true);

  const getRoundData = useCallback(() => {
    if (activeTab === 'weekly' && weeklyDetails) {
      // Fix: Cast to any or tuple type to allow numerical indexing
      const details = weeklyDetails as any;
      return {
        endTime: Number(details[0]),
        pool: details[1],
        participants: Number(details[2]),
        ticketPrice: details[3]
      };
    }
    if (activeTab === 'biweekly' && biweeklyDetails) {
      const details = biweeklyDetails as any;
      return {
        endTime: Number(details[0]),
        pool: details[1],
        participants: Number(details[2]),
        ticketPrice: details[3]
      };
    }
    if (activeTab === 'monthly' && monthlyDetails) {
      const details = monthlyDetails as any;
      return {
        endTime: Number(details[0]),
        pool: details[1],
        participants: Number(details[2]),
        ticketPrice: details[3]
      };
    }
    return null;
  }, [activeTab, weeklyDetails, biweeklyDetails, monthlyDetails]);

  const roundData = getRoundData();

  useEffect(() => {
    const load = async () => {
      try { await sdk.actions.ready(); setIsSdkLoaded(true); } 
      catch { setIsSdkLoaded(true); }
    };
    if (sdk?.actions) load(); else setIsSdkLoaded(true);
  }, []);

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: lotteryAbi,
    eventName: 'SpinResult',
    onLogs(logs: any[]) {
      const event = logs[0] as any;
      if (event.args.player === address) {
        setWinDetails({
          amount: formatEther(event.args.prizeAmount || 0n),
          type: event.args.prizeType
        });
      }
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: lotteryAbi,
    eventName: 'TicketPurchased',
    onLogs(logs: any[]) {
      const event = logs[0] as any;
      if (event.args.buyer === address) {
        const types = ['', 'Weekly', 'Biweekly', 'Monthly'];
        const newItem: HistoryItem = {
          type: types[event.args.lotteryType] || 'Unknown',
          amount: formatEther(event.args.costETH || 0n),
          date: new Date().toLocaleDateString(),
          hash: logs[0].transactionHash || ''
        };
        setPaymentHistory(prev => [newItem, ...prev].slice(0, 50));
      }
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: lotteryAbi,
    eventName: 'LotteryDrawn',
    onLogs(logs: any[]) {
      const event = logs[0] as any;
      const types = ['Instant', 'Weekly', 'Biweekly', 'Monthly'];
      const lotteryTypeName = types[event.args.lotteryType] || 'Unknown';
      const prizePerWinner = formatEther(event.args.prizePerWinner || 0n);
      
      if (event.args.winners && event.args.winners.length > 0) {
        const newWinners: WinnerRecord[] = event.args.winners.map((winner: string) => ({
          address: winner,
          prize: prizePerWinner,
          lotteryType: lotteryTypeName,
          date: new Date().toLocaleDateString()
        }));
        setRecentWinners(prev => [...newWinners, ...prev].slice(0, 20));
        refetchClaim();
      }
    },
  });

  useEffect(() => {
    if (isConfirmed && hash && hash !== processedHash.current && activeTab === 'instant') {
      processedHash.current = hash; 
      setIsSpinning(true);
      
      const randomDeg = Math.floor(3600 + Math.random() * 360); 
      setWheelRotation(prev => prev + randomDeg);

      setTimeout(() => {
        setIsSpinning(false);
        setShowResultModal(true);
        refetchClaim();
      }, 4500);

      const newItem: HistoryItem = {
        type: 'Spin',
        amount: (PRICES.INSTANT / ethPriceUsd).toFixed(18),
        date: new Date().toLocaleDateString(),
        hash: hash
      };
      setPaymentHistory(prev => [newItem, ...prev].slice(0, 50));
    }
  }, [isConfirmed, hash, activeTab, refetchClaim]);

  const getEthAmount = useCallback(() => {
    if (manualEthInput && parseFloat(manualEthInput) > 0) {
      return manualEthInput;
    }
    const priceUSD = activeTab === 'weekly' ? PRICES.WEEKLY : 
                     activeTab === 'biweekly' ? PRICES.BIWEEKLY : 
                     activeTab === 'monthly' ? PRICES.MONTHLY : 0;
    if (priceUSD > 0) {
      return ((priceUSD * ticketCount) / ethPriceUsd).toFixed(18);
    }
    return "0";
  }, [ticketCount, activeTab, manualEthInput]);

  const ethAmount = getEthAmount();

  const ensureNetwork = async () => {
    if (chainId !== TARGET_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
        return true;
      } catch (error) {
        console.error("Failed to switch network:", error);
        return false;
      }
    }
    return true;
  };

  const handleSpin = async () => {
    if (!await ensureNetwork()) return; 
    if (!writeContract || !address) return; // Fix: Check for address

    setShowResultModal(false);
    setWinDetails(null);
    
    const cost = (PRICES.INSTANT / ethPriceUsd).toFixed(18);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: lotteryAbi,
      functionName: 'spinWheel',
      args: [],
      value: parseEther(cost.toString()), 
      account: address, // Fix: Added account property
    });
  };

  const handleClaim = async () => {
    if (!await ensureNetwork()) return;
    if (!writeContract || !address) return; // Fix: Check for address
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: lotteryAbi,
      functionName: 'claimPrize',
      args: [],
      account: address, // Fix: Added account property
    });
    setShowResultModal(false);
  };

  const handleBuyTicket = async () => {
    if (!await ensureNetwork()) return;
    if (!writeContract || !address) return; // Fix: Check for address
    
    const typeId = LOTTERY_TYPE_MAP[activeTab] || 1;

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: lotteryAbi,
      functionName: 'buyTicket',
      args: [typeId, BigInt(ticketCount)], 
      value: parseEther(ethAmount),
      account: address, // Fix: Added account property
    });
  };

  const handleManualEthChange = (value: string) => {
    setManualEthInput(value);
    if (value && parseFloat(value) > 0) {
      const priceUSD = activeTab === 'weekly' ? PRICES.WEEKLY : 
                       activeTab === 'biweekly' ? PRICES.BIWEEKLY : 
                       activeTab === 'monthly' ? PRICES.MONTHLY : 1;
      const ethPerTicket = priceUSD / ethPriceUsd;
      const calculatedTickets = Math.floor(parseFloat(value) / ethPerTicket);
      if (calculatedTickets > 0 && calculatedTickets <= 100) {
        setTicketCount(calculatedTickets);
      }
    }
  };

  const formatCountdown = (endTime: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = endTime - now;
    if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0 };
    
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const secs = diff % 60;
    return { days, hours, mins, secs };
  };

  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  
  useEffect(() => {
    if (roundData?.endTime) {
      const interval = setInterval(() => {
        setCountdown(formatCountdown(roundData.endTime));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [roundData?.endTime]);

  const getPotentialWinnings = () => {
    if (!roundData?.pool) return "0";
    const winnerCount = WINNER_COUNTS[activeTab] || 1;
    const prizePerWinner = Number(formatEther(roundData.pool)) / winnerCount;
    return prizePerWinner.toFixed(4);
  };

  if (!isSdkLoaded) {
    return (
      <div className="loading-screen">
        <div className="loader-content">
          <div className="spinner"></div>
          <p>Loading Startale Lotto...</p>
        </div>
      </div>
    );
  }

  // Fix: Cast claimableAmount to bigint for safe comparison and formatting
  const safeClaimableAmount = claimableAmount as unknown as bigint;

  return (
    <div className="app-container">
      <div className="glass-panel">
        
        <header className="header">
          <div className="logo-section">
            <span className="logo-icon">🎰</span>
            <h1>Startale Lotto</h1>
          </div>
          {isConnected ? (
            <button onClick={() => disconnect()} className="wallet-btn disconnect">
              <span className="wallet-icon">💳</span>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
          ) : (
            <button onClick={() => connect({ connector: injected() })} className="wallet-btn connect">
              <span className="connect-icon">🔗</span>
              Connect
            </button>
          )}
        </header>

        {isConnected && chainId !== TARGET_CHAIN_ID && (
          <div className="wrong-network-banner">
            <span className="warning-icon">⚠️</span>
            <p>Wrong Network</p>
            <button onClick={ensureNetwork} className="switch-btn">Switch to Soneium</button>
          </div>
        )}

        {safeClaimableAmount > 0n && (
  <div className="claim-banner">
    <div className="claim-info">
      <span className="money-icon">💰</span>
      <div>
        <p className="claim-title">Pending Winnings</p>
        <p className="claim-amount">
          {Number(formatEther(safeClaimableAmount)).toFixed(18)} ETH
        </p>
        <p className="claim-usd">
          ≈ ${(Number(formatEther(safeClaimableAmount)) * ethPriceUsd).toFixed(2)}
        </p>
      </div>
    </div>
    <button onClick={handleClaim} className="claim-btn-inline pulse-anim" disabled={isPending}>
      CLAIM NOW
    </button>
  </div>
)}


        <nav className="nav-tabs">
          {(['instant', 'weekly', 'biweekly', 'monthly', 'history'] as TabType[]).map((tab) => (
            <button 
              key={tab}
              className={`nav-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              <span className="tab-icon">
                {tab === 'instant' ? '🎡' : tab === 'history' ? '📜' : '🎟️'}
              </span>
              <span className="tab-text">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </button>
          ))}
        </nav>

        <main className="main-content">
          {activeTab === 'instant' && (
            <div className="tab-content fade-in">
              <div className="instant-header">
                <h2>Spin & Win!</h2>
                <p className="subtitle">
                  Entry: $0.50 (≈{(PRICES.INSTANT / ethPriceUsd).toFixed(18)} ETH)
                  {priceLoading && <span className="price-loading"> (updating...)</span>}
                </p>
              </div>
              
              <div className="wheel-wrapper">
                <div className="wheel-glow"></div>
                <div className="wheel-pointer">▼</div>
                <div className="wheel" style={{ transform: `rotate(${wheelRotation}deg)` }}>
                  <div className="segment" style={{ '--i': 1 } as React.CSSProperties}><span>😢</span></div>
                  <div className="segment" style={{ '--i': 2 } as React.CSSProperties}><span>$2</span></div>
                  <div className="segment" style={{ '--i': 3 } as React.CSSProperties}><span>😢</span></div>
                  <div className="segment" style={{ '--i': 4 } as React.CSSProperties}><span>🎟️</span></div>
                  <div className="segment" style={{ '--i': 5 } as React.CSSProperties}><span>😢</span></div>
                  <div className="segment" style={{ '--i': 6 } as React.CSSProperties}><span>$5</span></div>
                  <div className="segment" style={{ '--i': 7 } as React.CSSProperties}><span>😢</span></div>
                  <div className="segment" style={{ '--i': 8 } as React.CSSProperties}><span>🎫</span></div>
                  <div className="segment" style={{ '--i': 9 } as React.CSSProperties}><span>😢</span></div>
                  <div className="segment" style={{ '--i': 10 } as React.CSSProperties}><span>$10</span></div>
                </div>
                <div className="wheel-center">
                  <span>🎰</span>
                </div>
              </div>

              <div className="prize-legend">
                <div className="legend-item"><span className="dot green"></span> $2-$10 Cash</div>
                <div className="legend-item"><span className="dot blue"></span> Free Tickets</div>
                <div className="legend-item"><span className="dot gray"></span> Try Again</div>
              </div>
              
              <div className="action-group">
                <button 
                  className={`action-btn spin-btn ${isSpinning ? 'spinning' : ''}`}
                  disabled={!isConnected || isPending || isConfirming || isSpinning}
                  onClick={handleSpin}
                >
                  {isSpinning ? (
                    <>
                      <span className="btn-spinner"></span>
                      Spinning...
                    </>
                  ) : isPending ? (
                    'Check Wallet...'
                  ) : isConfirming ? (
                    'Confirming...'
                  ) : (
                    <>
                      <span className="btn-icon">🎡</span>
                      SPIN NOW
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {(activeTab === 'weekly' || activeTab === 'biweekly' || activeTab === 'monthly') && (
            <div className="tab-content fade-in">
              <div className="lottery-header">
                <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Lottery</h2>
                <div className="winner-badge">
                  <span className="trophy">🏆</span>
                  {WINNER_COUNTS[activeTab]} Winner{WINNER_COUNTS[activeTab] > 1 ? 's' : ''}
                </div>
              </div>

              <div className="countdown-section">
                <p className="countdown-label">Draw In</p>
                <div className="countdown-grid">
                  <div className="time-block">
                    <span className="time-value">{String(countdown.days).padStart(2, '0')}</span>
                    <span className="time-label">Days</span>
                  </div>
                  <span className="time-separator">:</span>
                  <div className="time-block">
                    <span className="time-value">{String(countdown.hours).padStart(2, '0')}</span>
                    <span className="time-label">Hours</span>
                  </div>
                  <span className="time-separator">:</span>
                  <div className="time-block">
                    <span className="time-value">{String(countdown.mins).padStart(2, '0')}</span>
                    <span className="time-label">Mins</span>
                  </div>
                  <span className="time-separator">:</span>
                  <div className="time-block">
                    <span className="time-value">{String(countdown.secs).padStart(2, '0')}</span>
                    <span className="time-label">Secs</span>
                  </div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card pool">
                  <span className="stat-icon">💎</span>
                  <div className="stat-info">
                    <p className="stat-label">Prize Pool</p>
                    <p className="stat-value">{roundData ? Number(formatEther(roundData.pool)).toFixed(4) : '0'} ETH</p>
                    <p className="stat-usd">≈ ${roundData ? (Number(formatEther(roundData.pool)) * ethPriceUsd).toFixed(2) : '0'}</p>
                  </div>
                </div>
                <div className="stat-card participants">
                  <span className="stat-icon">👥</span>
                  <div className="stat-info">
                    <p className="stat-label">Tickets Sold</p>
                    <p className="stat-value">{roundData?.participants || 0}</p>
                  </div>
                </div>
                <div className="stat-card potential">
                  <span className="stat-icon">🎯</span>
                  <div className="stat-info">
                    <p className="stat-label">Prize Per Winner</p>
                    <p className="stat-value">{getPotentialWinnings()} ETH</p>
                    <p className="stat-usd">≈ ${(parseFloat(getPotentialWinnings()) * ethPriceUsd).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="distribution-section">
                <p className="dist-label">Fund Distribution</p>
                <div className="dist-bar-container">
                  <div className="dist-bar pool" style={{width: '80%'}}>
                    <span>80% Pool</span>
                  </div>
                  <div className="dist-bar treasury" style={{width: '20%'}}>
                    <span>20%</span>
                  </div>
                </div>
              </div>

              <div className="ticket-purchase-section">
                <div className="price-info">
                  <span className="ticket-icon">🎟️</span>
                  <span>${PRICES[activeTab.toUpperCase() as keyof typeof PRICES]} per ticket</span>
                  <span className="eth-price">(≈{(PRICES[activeTab.toUpperCase() as keyof typeof PRICES] / ethPriceUsd).toFixed(18)} ETH)</span>
                </div>

                <div className="ticket-slider-section">
                  <div className="slider-header">
                    <label>Number of Tickets: <strong>{ticketCount}</strong></label>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={ticketCount} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setTicketCount(parseInt(e.target.value));
                      setManualEthInput("");
                    }} 
                    className="ticket-slider"
                  />
                  <div className="slider-labels">
                    <span>1</span>
                    <span>25</span>
                    <span>50</span>
                  </div>
                </div>

                <div className="manual-input-section">
                  <label>Or enter ETH amount:</label>
                  <div className="eth-input-wrapper">
                    <input 
                      type="number"
                      step="0.0001"
                      placeholder="0.00"
                      value={manualEthInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleManualEthChange(e.target.value)}
                      className="eth-input"
                    />
                    <span className="eth-suffix">ETH</span>
                  </div>
                </div>

                <div className="total-section">
                  <div className="total-row">
                    <span>Total Cost:</span>
                    <div className="total-amount">
                      <span className="eth-total">{ethAmount} ETH</span>
                      <span className="usd-total">≈ ${(parseFloat(ethAmount) * ethPriceUsd).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <button 
                  className="action-btn buy-btn" 
                  disabled={!isConnected || isPending || isConfirming}
                  onClick={handleBuyTicket}
                >
                  {isPending ? 'Check Wallet...' : isConfirming ? 'Confirming...' : (
                    <>
                      <span className="btn-icon">🎟️</span>
                      Buy {ticketCount} Ticket{ticketCount > 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>

              <div className="winners-section">
                <div className="winners-header">
                  <span className="trophy-icon">🏆</span>
                  <h3>Recent Winners</h3>
                </div>
                {recentWinners.filter(w => w.lotteryType.toLowerCase() === activeTab).length === 0 ? (
                  <div className="no-winners">
                    <p>No winners yet for this lottery</p>
                    <p className="small-text">Winners will be displayed after the draw</p>
                  </div>
                ) : (
                  <div className="winners-list">
                    {recentWinners
                      .filter(w => w.lotteryType.toLowerCase() === activeTab)
                      .slice(0, 6)
                      .map((winner, idx) => (
                        <div key={idx} className={`winner-item ${winner.address === address ? 'is-you' : ''}`}>
                          <div className="winner-left">
                            <span className="winner-rank">#{idx + 1}</span>
                            <span className="winner-address">
                              {winner.address === address ? '🎉 You!' : `${winner.address.slice(0, 6)}...${winner.address.slice(-4)}`}
                            </span>
                          </div>
                          <div className="winner-right">
                            <span className="winner-prize">{parseFloat(winner.prize).toFixed(4)} ETH</span>
                            {winner.address === address && (
                              <button onClick={handleClaim} className="mini-claim-btn">Claim</button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="tab-content fade-in">
              <div className="history-header">
                <h2>Payment History</h2>
                <p className="subtitle">Your recent transactions</p>
              </div>
              
              {paymentHistory.length === 0 ? (
                <div className="empty-history">
                  <span className="empty-icon">📭</span>
                  <p>No transactions yet</p>
                  <p className="subtitle">Your payments will appear here</p>
                </div>
              ) : (
                <div className="history-list">
                  {paymentHistory.map((item, index) => (
                    <div key={index} className="history-item">
                      <div className="history-left">
                        <span className="history-type-icon">
                          {item.type === 'Spin' ? '🎡' : '🎟️'}
                        </span>
                        <div className="history-details">
                          <p className="history-type">{item.type}</p>
                          <p className="history-date">{item.date}</p>
                        </div>
                      </div>
                      <div className="history-right">
                        <p className="history-amount">-{item.amount} ETH</p>
                        <p className="history-usd">≈ ${(parseFloat(item.amount) * ethPriceUsd).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {showResultModal && (
          <div className="modal-overlay" onClick={() => setShowResultModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>🎲 Spin Result</h2>
              </div>
              {winDetails && winDetails.type !== 'LOSE' ? (
                <div className="win-result">
                  <div className="confetti-effect">🎉</div>
                  <div className="result-emoji">🎁</div>
                  <p className="win-title">Congratulations!</p>
                  <p className="win-text">You Won: <span className="highlight">{winDetails.type}</span></p>
                  {parseFloat(winDetails.amount) > 0 && (
                    <p className="win-amount">{parseFloat(winDetails.amount).toFixed(6)} ETH</p>
                  )}
                  <button onClick={handleClaim} className="action-btn claim-btn mt-2">
                    💰 CLAIM NOW
                  </button>
                </div>
              ) : (
                <div className="lose-result">
                  <div className="result-emoji">💨</div>
                  <p className="lose-title">No luck this time!</p>
                  <p className="small-text">Your entry helps grow the prize pool</p>
                  <button onClick={handleSpin} className="action-btn spin-btn mt-2" disabled={isPending}>
                    🔄 Try Again
                  </button>
                </div>
              )}
              <button onClick={() => setShowResultModal(false)} className="close-btn mt-4">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;