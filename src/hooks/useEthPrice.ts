import { useState, useEffect, useCallback } from 'react';

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';
const FALLBACK_PRICE = 3000;
const REFRESH_INTERVAL = 60000;

export function useEthPrice() {
  const [price, setPrice] = useState<number>(FALLBACK_PRICE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      const response = await fetch(COINGECKO_API);
      if (!response.ok) {
        throw new Error('Failed to fetch ETH price');
      }
      const data = await response.json();
      if (data?.ethereum?.usd) {
        setPrice(data.ethereum.usd);
        setLastUpdated(new Date());
        setError(null);
      } else {
        throw new Error('Invalid price data');
      }
    } catch (err) {
      console.error('Error fetching ETH price:', err);
      setError('Failed to fetch live price');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return {
    price,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchPrice
  };
}
