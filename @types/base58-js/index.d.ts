declare module 'base58-js' {
  export function binary_to_base58(data: Uint8Array): string;
  export function base58_to_binary(data: string): Uint8Array;
}
