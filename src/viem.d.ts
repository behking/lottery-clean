declare module 'viem' {
  export function parseEther(value: string): bigint;
  export function formatEther(value: bigint): string;
  export function parseAbi<T extends readonly string[]>(abi: T): T;
}
