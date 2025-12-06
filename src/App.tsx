import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useWatchContractEvent, useSwitchChain, useBalance, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useRoundDetails, usePendingWinnings, lotteryAbi, CONTRACT_ADDRESS } from './hooks/useTaskContract';
import { useEthPrice } from './hooks/useEthPrice';
import { parseEther, formatEther } from 'viem';
// @ts-ignore - viem exports these but types may not recognize them
import { decodeAbiParameters, keccak256, toHex } from 'viem';
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

const WHEEL_SEGMENTS = [
  { label: '😢', prizeType: 'LOSE', color: '#374151' },
  { label: '$2', prizeType: '$2', color: '#10b981' },
  { label: '😢', prizeType: 'LOSE', color: '#4b5563' },
  { label: '🎟️', prizeType: 'Weekly Ticket', color: '#3b82f6' },
  { label: '😢', prizeType: 'LOSE', color: '#374151' },
  { label: '$5', prizeType: '$5', color: '#f59e0b' },
  { label: '😢', prizeType: 'LOSE', color: '#4b5563' },
  { label: '🎟️', prizeType: 'Weekly Ticket', color: '#3b82f6' },
  { label: '😢', prizeType: 'LOSE', color: '#374151' },
  { label: '$10', prizeType: '$10', color: '#ef4444' },
];

const getWheelAngleForPrize = (prizeType: string): number => {
  const segmentAngle = 360 / WHEEL_SEGMENTS.length;
  const matchingIndices = WHEEL_SEGMENTS
    .map((seg, i) => seg.prizeType === prizeType ? i : -1)
    .filter(i => i !== -1);
  
  if (matchingIndices.length === 0) {
    return Math.floor(Math.random() * 360);
  }
  
  const randomMatchIndex = matchingIndices[Math.floor(Math.random() * matchingIndices.length)];
  const targetAngle = randomMatchIndex * segmentAngle + segmentAngle / 2;
  const pointerOffset = 90;
  return 360 - targetAngle + pointerOffset;
};

function App() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const { writeContract: writeSpinContract, data: spinHash, isPending: spinPending } = useWriteContract();
  const { isLoading: spinConfirming, isSuccess: spinConfirmed, data: spinReceipt } = useWaitForTransactionReceipt({ hash: spinHash });

  const { writeContract: writeClaimContract, data: claimHash, isPending: claimPending } = useWriteContract();
  const { isLoading: claimConfirming, isSuccess: claimConfirmed } = useWaitForTransactionReceipt({ hash: claimHash });

  const { writeContract: writeBuyContract, data: buyHash, isPending: buyPending } = useWriteContract();
  const { isLoading: buyConfirming, isSuccess: buyConfirmed } = useWaitForTransactionReceipt({ hash: buyHash });

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
  const [pendingPrizeType, setPendingPrizeType] = useState<string | null>(null);
  const [isClaimInProgress, setIsClaimInProgress] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);

  const processedSpinHash = useRef<string | null>(null);
  const processedClaimHash = useRef<string | null>(null);
  const spinAnimationTriggered = useRef(false);
  const spinStartRotation = useRef(0);

  const { data: claimableAmount, refetch: refetchClaim } = usePendingWinnings(address);
  
  const { data: contractBalance, refetch: refetchBalance } = useBalance({
    address: CONTRACT_ADDRESS,
  });
  
  const { data: weeklyDetails, refetch: refetchWeekly } = useRoundDetails(1, true);
  const { data: biweeklyDetails, refetch: refetchBiweekly } = useRoundDetails(2, true);
  const { data: monthlyDetails, refetch: refetchMonthly } = useRoundDetails(3, true);

  const refetchAllBalances = useCallback(() => {
    refetchBalance();
    refetchClaim();
    refetchWeekly();
    refetchBiweekly();
    refetchMonthly();
  }, [refetchBalance, refetchClaim, refetchWeekly, refetchBiweekly, refetchMonthly]);

  const getRoundData = useCallback(() => {
    if (activeTab === 'weekly' && weeklyDetails) {
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
        const prizeType = event.args.prizeType;
        setPendingPrizeType(prizeType);
        setWinDetails({
          amount: formatEther(event.args.prizeAmount || 0n),
          type: prizeType
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
        refetchAllBalances();
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
        refetchAllBalances();
      }
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: lotteryAbi,
    eventName: 'WinningsClaimed',
    onLogs(logs: any[]) {
      const event = logs[0] as any;
      if (event.args.user === address) {
        refetchAllBalances();
        setIsClaimInProgress(false);
      }
    },
  });

  useEffect(() => {
    if (claimConfirmed && claimHash && claimHash !== processedClaimHash.current) {
      processedClaimHash.current = claimHash;
      setIsClaimInProgress(false);
      refetchAllBalances();
    }
  }, [claimConfirmed, claimHash, refetchAllBalances]);

  useEffect(() => {
    if (isSpinning && pendingPrizeType !== null && !spinAnimationTriggered.current) {
      spinAnimationTriggered.current = true;
      
      const targetAngle = getWheelAngleForPrize(pendingPrizeType);
      const fullSpins = 3600;
      const finalAngle = spinStartRotation.current + fullSpins + targetAngle;
      setWheelRotation(finalAngle);

      setTimeout(() => {
        setIsSpinning(false);
        setShowResultModal(true);
        refetchAllBalances();
        spinAnimationTriggered.current = false;
        setPendingPrizeType(null);
      }, 4500);
    }
  }, [isSpinning, pendingPrizeType, refetchAllBalances]);

  // Timeout fallback - if no result after 30s, reset spinning state and show error
  useEffect(() => {
    if (isSpinning && pendingPrizeType === null) {
      const timeout = setTimeout(() => {
        if (isSpinning && pendingPrizeType === null) {
          setIsSpinning(false);
          spinAnimationTriggered.current = false;
          setWheelRotation(spinStartRotation.current); // Reset wheel to previous position
          setSpinError('Transaction timed out. Please try again.');
        }
      }, 30000);
      return () => clearTimeout(timeout);
    }
  }, [isSpinning, pendingPrizeType]);

  useEffect(() => {
    if (spinConfirmed && spinHash && spinReceipt && spinHash !== processedSpinHash.current) {
      processedSpinHash.current = spinHash;
      
      const newItem: HistoryItem = {
        type: 'Spin',
        amount: (PRICES.INSTANT / ethPriceUsd).toFixed(18),
        date: new Date().toLocaleDateString(),
        hash: spinHash
      };
      setPaymentHistory(prev => [newItem, ...prev].slice(0, 50));
      refetchAllBalances();

      const spinResultTopic = keccak256(toHex('SpinResult(address,bool,uint256,string)'));
      for (const log of spinReceipt.logs) {
        try {
          if (log.topics[0] === spinResultTopic) {
            const playerFromTopic = log.topics[1] ? ('0x' + log.topics[1].slice(26)) as `0x${string}` : null;
            if (playerFromTopic?.toLowerCase() === address?.toLowerCase()) {
              const decoded = decodeAbiParameters(
                [
                  { name: 'isWin', type: 'bool' },
                  { name: 'prizeAmount', type: 'uint256' },
                  { name: 'prizeType', type: 'string' }
                ],
                log.data
              );
              const [, prizeAmount, prizeType] = decoded;
              setPendingPrizeType(prizeType);
              setWinDetails({
                amount: formatEther(prizeAmount || 0n),
                type: prizeType
              });
              break;
            }
          }
        } catch {
        }
      }
    }
  }, [spinConfirmed, spinHash, spinReceipt, ethPriceUsd, refetchAllBalances, address]);

  useEffect(() => {
    if (buyConfirmed && buyHash) {
      refetchAllBalances();
    }
  }, [buyConfirmed, buyHash, refetchAllBalances]);

  const getEthAmount = useCallback(() => {
    if (manualEthInput && parseFloat(manualEthInput) > 0) {
      return manualEthInput;
    }
    const priceUSD = activeTab === 'weekly' ? PRICES.WEEKLY : 
                     activeTab === 'biweekly' ? PRICES.BIWEEKLY : 
                     activeTab === 'monthly' ? PRICES.MONTHLY : 0;
    if (priceUSD > 0) {
      const rawAmount = (priceUSD * ticketCount) / ethPriceUsd;
      const bufferedAmount = rawAmount * 1.01;
      return bufferedAmount.toFixed(18);
    }
    return "0";
  }, [ticketCount, activeTab, manualEthInput, ethPriceUsd]);

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
    if (!writeSpinContract || !address) return;

    setShowResultModal(false);
    setWinDetails(null);
    setPendingPrizeType(null);
    setSpinError(null);
    spinAnimationTriggered.current = false;
    processedSpinHash.current = null;
    
    spinStartRotation.current = wheelRotation;
    setIsSpinning(true);
    
    const rawCost = PRICES.INSTANT / ethPriceUsd;
    const bufferedCost = rawCost * 1.01;
    const cost = bufferedCost.toFixed(18);
    
    writeSpinContract({
      address: CONTRACT_ADDRESS,
      abi: lotteryAbi,
      functionName: 'spinWheel',
      args: [],
      value: parseEther(cost.toString()), 
      account: address,
    });
  };

  const handleClaim = async () => {
    if (!await ensureNetwork()) return;
    if (!writeClaimContract || !address) return;
    if (isClaimInProgress || claimPending || claimConfirming) return;
    
    setIsClaimInProgress(true);
    processedClaimHash.current = null;
    
    writeClaimContract({
      address: CONTRACT_ADDRESS,
      abi: lotteryAbi,
      functionName: 'claimPrize',
      args: [],
      account: address,
    });
  };

  const handleBuyTicket = async () => {
    if (!await ensureNetwork()) return;
    if (!writeBuyContract || !address) return;
    
    const typeId = LOTTERY_TYPE_MAP[activeTab] || 1;

    writeBuyContract({
      address: CONTRACT_ADDRESS,
      abi: lotteryAbi,
      functionName: 'buyTicket',
      args: [typeId, BigInt(ticketCount)], 
      value: parseEther(ethAmount),
      account: address,
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
    return prizePerWinner.toFixed(6);
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

  const safeClaimableAmount = (claimableAmount as unknown as bigint) || 0n;
  const hasClaimable = safeClaimableAmount > 0n;
  const prizePoolEth = contractBalance ? Number(formatEther(contractBalance.value)).toFixed(6) : '0';
  const prizePoolUsd = contractBalance ? (Number(formatEther(contractBalance.value)) * ethPriceUsd).toFixed(2) : '0';

  const isClaimButtonDisabled = claimPending || claimConfirming || isClaimInProgress;
  const claimButtonText = claimPending ? 'Check Wallet...' : 
                          claimConfirming ? 'Confirming...' : 
                          isClaimInProgress ? 'Processing...' : 'CLAIM NOW';

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

        {hasClaimable && (
          <div className="claim-banner">
            <div className="claim-info">
              <span className="money-icon">💰</span>
              <div>
                <p className="claim-title">Pending Winnings</p>
                <p className="claim-amount">{Number(formatEther(safeClaimableAmount)).toFixed(6)} ETH</p>
                <p className="claim-usd">
                  ≈ ${(Number(formatEther(safeClaimableAmount)) * ethPriceUsd).toFixed(2)}
                </p>
              </div>
            </div>
            <button 
              onClick={handleClaim} 
              className={`claim-btn-inline ${!isClaimButtonDisabled ? 'pulse-anim' : ''}`} 
              disabled={isClaimButtonDisabled}
            >
              {claimButtonText}
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
                  Entry: $0.50 (≈{(PRICES.INSTANT / ethPriceUsd).toFixed(6)} ETH)
                  {priceLoading && <span className="price-loading"> (updating...)</span>}
                </p>
              </div>

              <div className="prize-pool-display">
                <span className="pool-icon">💎</span>
                <div className="pool-info">
                  <span className="pool-label">Prize Pool</span>
                  <span className="pool-value">{prizePoolEth} ETH</span>
                  <span className="pool-usd">≈ ${prizePoolUsd}</span>
                </div>
              </div>
              
              <div className="wheel-container">
                <div className="wheel-stage">
                  <div className="wheel-glow-effect"></div>
                  <div className="wheel-frame">
                    <div className="wheel-bulbs">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`bulb ${isSpinning ? 'chase' : 'idle'}`} 
                          style={{ '--bulb-index': i } as React.CSSProperties} 
                        />
                      ))}
                    </div>
                    <div className="wheel-pointer-arrow">
                      <svg viewBox="0 0 40 50" className="pointer-svg">
                        <defs>
                          <linearGradient id="pointerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#f59e0b" />
                          </linearGradient>
                          <filter id="pointerShadow">
                            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.5"/>
                          </filter>
                        </defs>
                        <polygon points="20,50 0,0 40,0" fill="url(#pointerGrad)" filter="url(#pointerShadow)"/>
                        <polygon points="20,45 5,5 35,5" fill="#fcd34d"/>
                      </svg>
                    </div>
                    <div className="wheel-inner">
                      <div className={`wheel-disc ${isSpinning && pendingPrizeType === null ? 'spinning-waiting' : ''} ${isSpinning && pendingPrizeType !== null ? 'spinning-active' : ''}`} style={pendingPrizeType !== null || !isSpinning ? { transform: `rotate(${wheelRotation}deg)` } : undefined}>
                        {WHEEL_SEGMENTS.map((segment, i) => (
                          <div 
                            key={i} 
                            className="wheel-segment" 
                            style={{ 
                              '--segment-index': i,
                              '--segment-color': segment.color,
                            } as React.CSSProperties}
                          >
                            <span className="segment-text">{segment.label}</span>
                          </div>
                        ))}
                        <div className="wheel-dividers">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="divider" style={{ '--div-index': i } as React.CSSProperties} />
                          ))}
                        </div>
                      </div>
                      <div className="wheel-hub">
                        <div className="hub-inner">
                          <span className="hub-icon">⭐</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="prize-legend">
                <div className="legend-item"><span className="dot green"></span> $2-$10 Cash</div>
                <div className="legend-item"><span className="dot blue"></span> Weekly Ticket</div>
                <div className="legend-item"><span className="dot gray"></span> Try Again</div>
              </div>
              
              <div className="action-group">
                <button 
                  className={`action-btn spin-btn ${isSpinning ? 'spinning' : ''}`}
                  disabled={!isConnected || spinPending || spinConfirming || isSpinning}
                  onClick={handleSpin}
                >
                  {isSpinning ? (
                    <>
                      <span className="btn-spinner"></span>
                      Spinning...
                    </>
                  ) : spinPending ? (
                    'Check Wallet...'
                  ) : spinConfirming ? (
                    'Confirming...'
                  ) : (
                    <>
                      <span className="btn-icon">🎡</span>
                      SPIN NOW
                    </>
                  )}
                </button>
                {spinError && (
                  <div className="spin-error">
                    <span className="error-icon">⚠️</span>
                    {spinError}
                  </div>
                )}
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
                    <p className="stat-value">{roundData ? Number(formatEther(roundData.pool)).toFixed(6) : '0'} ETH</p>
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
                  <span>${activeTab === 'weekly' ? PRICES.WEEKLY : activeTab === 'biweekly' ? PRICES.BIWEEKLY : PRICES.MONTHLY} per ticket</span>
                  <span className="eth-price">(≈{((activeTab === 'weekly' ? PRICES.WEEKLY : activeTab === 'biweekly' ? PRICES.BIWEEKLY : PRICES.MONTHLY) / ethPriceUsd).toFixed(6)} ETH)</span>
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
                    onChange={(e) => {
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
                      placeholder="0.0"
                      value={manualEthInput}
                      onChange={(e) => handleManualEthChange(e.target.value)}
                      className="eth-input"
                    />
                    <span className="eth-suffix">ETH</span>
                  </div>
                </div>
                <div className="total-section">
                  <div className="total-row">
                    <span>Total Cost:</span>
                    <div className="total-amount">
                      <span className="eth-total">{parseFloat(ethAmount).toFixed(6)} ETH</span>
                      <span className="usd-total">≈ ${(parseFloat(ethAmount) * ethPriceUsd).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="action-group">
                <button 
                  className="action-btn buy-btn"
                  disabled={!isConnected || buyPending || buyConfirming}
                  onClick={handleBuyTicket}
                >
                  {buyPending ? (
                    'Check Wallet...'
                  ) : buyConfirming ? (
                    'Confirming...'
                  ) : (
                    <>
                      <span className="btn-icon">🎟️</span>
                      BUY {ticketCount} TICKET{ticketCount > 1 ? 'S' : ''}
                    </>
                  )}
                </button>
              </div>

              {recentWinners.filter(w => w.lotteryType.toLowerCase() === activeTab).length > 0 && (
                <div className="winners-section">
                  <h3>Recent Winners</h3>
                  <div className="winners-list">
                    {recentWinners
                      .filter(w => w.lotteryType.toLowerCase() === activeTab)
                      .slice(0, 5)
                      .map((winner, i) => (
                        <div key={i} className={`winner-item ${winner.address === address ? 'is-you' : ''}`}>
                          <span className="winner-address">
                            {winner.address === address ? '🎉 You!' : `${winner.address.slice(0, 6)}...${winner.address.slice(-4)}`}
                          </span>
                          <span className="winner-prize">{parseFloat(winner.prize).toFixed(6)} ETH</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="tab-content fade-in">
              <div className="history-header">
                <h2>Payment History</h2>
              </div>
              
              {paymentHistory.length === 0 ? (
                <div className="empty-history">
                  <span className="empty-icon">📭</span>
                  <p>No transactions yet</p>
                  <p className="small-text">Your lottery purchases will appear here</p>
                </div>
              ) : (
                <div className="history-list">
                  {paymentHistory.map((item, i) => (
                    <div key={i} className="history-item">
                      <div className="history-left">
                        <span className="history-type-icon">
                          {item.type === 'Spin' ? '🎡' : '🎟️'}
                        </span>
                        <div>
                          <p className="history-type">{item.type}</p>
                          <p className="history-date">{item.date}</p>
                        </div>
                      </div>
                      <div className="history-right">
                        <p className="history-amount">-{parseFloat(item.amount).toFixed(6)} ETH</p>
                        <p className="history-usd">≈ ${(parseFloat(item.amount) * ethPriceUsd).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {showResultModal && winDetails && (
          <div className="modal-overlay" onClick={() => setShowResultModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              {winDetails.type !== 'LOSE' ? (
                <div className="win-result">
                  <span className="confetti-effect">🎊</span>
                  <span className="result-emoji">🎉</span>
                  <h3 className="win-title">Congratulations!</h3>
                  <p className="win-text">You won <span className="highlight">{winDetails.type}</span>!</p>
                  {parseFloat(winDetails.amount) > 0 && (
                    <p className="win-amount">{parseFloat(winDetails.amount).toFixed(6)} ETH</p>
                  )}
                  {hasClaimable && (
                    <button onClick={handleClaim} className="action-btn claim-btn" disabled={isClaimButtonDisabled}>
                      {claimButtonText}
                    </button>
                  )}
                </div>
              ) : (
                <div className="lose-result">
                  <span className="result-emoji">😢</span>
                  <h3 className="lose-title">Better luck next time!</h3>
                  <p className="small-text">Try again for a chance to win!</p>
                </div>
              )}
              <button onClick={() => setShowResultModal(false)} className="close-btn">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
