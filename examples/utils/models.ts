import { Connection, PublicKey } from '@solana/web3.js';

export interface ReserveArgs {
  /**
   * web3 connection to your RPC
   */
  connection: Connection;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: PublicKey;
  /**
   * Public Key of the Kamino Reserve (e.g. SOL reserve pubkey: d4A2prbA2whesmvHaL88BH6Ewn5N4bTSU2Ze8P6Bc4Q)
   */
  reservePubkey: PublicKey;
}

export interface MarketArgs {
  /**
   * web3 connection to your RPC
   */
  connection: Connection;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: PublicKey;
}

export interface UserLoansArgs {
  /**
   * web3 connection to your RPC
   */
  connection: Connection;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: PublicKey;
  /**
   * User's wallet public key
   */
  wallet: PublicKey;
}

export interface LoanArgs {
  /**
   * web3 connection to your RPC
   */
  connection: Connection;
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: PublicKey;
  /**
   * Loan public key
   */
  obligationPubkey: PublicKey;
}

export interface ReserveHistoryArgs {
  /**
   * Public Key of the Kamino Market (e.g. main market pubkey: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF)
   */
  marketPubkey: PublicKey;
  /**
   * Public Key of the Kamino Reserve (e.g. SOL reserve pubkey: d4A2prbA2whesmvHaL88BH6Ewn5N4bTSU2Ze8P6Bc4Q)
   */
  reservePubkey: PublicKey;
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
