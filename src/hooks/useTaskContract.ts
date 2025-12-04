import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseAbi } from 'viem';

export const CONTRACT_ADDRESS = '0x5799fe0F34BAeab3D1c756023E46D3019FDFE6D8' as `0x${string}`;

export const lotteryAbi = parseAbi([
  'function spinWheel() external payable',
  'function buyTicket(uint8 _type, uint256 _quantity) external payable',
  'function claimPrize() external',
  'function getRoundDetails(uint8 _type) external view returns (uint256 endTime, uint256 pool, uint256 participantsCount, uint256 ticketPriceWei)',
  'function pendingWinnings(address user) external view returns (uint256)',
  'function ticketCredits(address user, uint8 lotteryType) external view returns (uint256)',
  'function getEthCost(uint256 usdAmount) external view returns (uint256)',
  'event SpinResult(address indexed player, bool isWin, uint256 prizeAmount, string prizeType)',
  'event TicketPurchased(address indexed buyer, uint8 indexed lotteryType, uint256 quantity, uint256 costETH, uint256 timestamp)',
  'event LotteryDrawn(uint8 indexed lotteryType, uint256 roundId, address[] winners, uint256 prizePerWinner)',
  'event WinningsClaimed(address indexed user, uint256 amount)'
]);

export function useLotteryContract() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = 
    useWaitForTransactionReceipt({ hash });

  return {
    lotteryAbi,
    CONTRACT_ADDRESS,
    writeContract,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error
  };
}

export function useRoundDetails(lotteryType: number, enabled: boolean = true) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: lotteryAbi,
    functionName: 'getRoundDetails',
    args: [lotteryType],
    query: { enabled, refetchInterval: 10000 }
  });
}

export function usePendingWinnings(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: lotteryAbi,
    functionName: 'pendingWinnings',
    args: [address as `0x${string}`],
    query: { enabled: !!address, refetchInterval: 5000 }
  });
}

export function useTicketCredits(address: `0x${string}` | undefined, lotteryType: number) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: lotteryAbi,
    functionName: 'ticketCredits',
    args: [address as `0x${string}`, lotteryType],
    query: { enabled: !!address, refetchInterval: 10000 }
  });
}
