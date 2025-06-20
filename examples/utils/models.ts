import { Address, Rpc, SolanaRpcApi } from '@solana/kit';

export interface ReserveArgs {
  /**
   * web3 connection to your RPC
   */
  rpc: Rpc<SolanaRpcApi>;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: Address;
  /**
   * Public Key of the reserve's token mint (e.g. For SOL reserve, SOL mint pubkey: So11111111111111111111111111111111111111112)
   */
  mintPubkey: Address;
}

export interface MarketArgs {
  /**
   * web3 connection to your RPC
   */
  rpc: Rpc<SolanaRpcApi>;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: Address;
}

export interface UserLoansArgs {
  /**
   * web3 connection to your RPC
   */
  rpc: Rpc<SolanaRpcApi>;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: Address;
  /**
   * User's wallet public key
   */
  wallet: Address;
}

export interface LoanArgs {
  /**
   * web3 connection to your RPC
   */
  rpc: Rpc<SolanaRpcApi>;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: Address;
  /**
   * Loan public key
   */
  obligationPubkey: Address;
}

export interface ReserveHistoryArgs {
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: Address;
  /**
   * Public Key of the Kamino Reserve (e.g. SOL reserve pubkey: d4A2prbA2whesmvHaL88BH6Ewn5N4bTSU2Ze8P6Bc4Q)
   */
  reservePubkey: Address;
  /**
   * History date range start, e.g. new Date('2024-01-01T00:00Z')
   */
  start: Date;
  /**
   * History date range end,  e.g. new Date('2024-02-01T00:00Z')
   */
  end: Date;
}

export interface ReserveHistoryResponse {
  history: { timestamp: string; metrics: { borrowInterestAPY: number; supplyInterestAPY: number } }[];
}
