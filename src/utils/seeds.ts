import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '../idl_codegen/programId';

/**
 * Lending market authority seed
 */
export const LENDING_MARKET_AUTH_SEED = 'lma';
/**
 * Reserve liquidity supply seed
 */
export const RESERVE_LIQ_SUPPLY_SEED = 'reserve_liq_supply';
/**
 * Reserve fee vault seed
 */
export const FEE_RECEIVER_SEED = 'fee_receiver';
/**
 * Reserve collateral mint seed
 */
export const RESERVE_COLL_MINT_SEED = 'reserve_coll_mint';
/**
 * Reserve collateral supply seed
 */
export const RESERVE_COLL_SUPPLY_SEED = 'reserve_coll_supply';
/**
 * User metadata seed
 */
export const BASE_SEED_USER_METADATA = 'user_meta';
/**
 * Referrer token state seed
 */
export const BASE_SEED_REFERRER_TOKEN_STATE = 'referrer_acc';
/**
 * Referrer state seed
 */
export const BASE_SEED_REFERRER_STATE = 'ref_state';
/**
 * Short url seed
 */
export const BASE_SEED_SHORT_URL = 'short_url';

/**
 * Encapsulates all the PDAs for a given reserve
 */
export interface ReservePdas {
  liquiditySupplyVault: PublicKey;
  collateralMint: PublicKey;
  collateralSupplyVault: PublicKey;
  feeVault: PublicKey;
}

/**
 * Returns all the PDAs for the given reserve
 * @param programId
 * @param market
 * @param mint
 * @returns ReservePdas
 */
export function reservePdas(programId: PublicKey, market: PublicKey, mint: PublicKey): ReservePdas {
  return {
    liquiditySupplyVault: reserveLiqSupplyPda(market, mint, programId)[0],
    collateralMint: reserveCollateralMintPda(market, mint, programId)[0],
    collateralSupplyVault: reserveCollateralSupplyPda(market, mint, programId)[0],
    feeVault: reserveFeeVaultPda(market, mint, programId)[0],
  };
}

/**
 * Returns the PDA and bump for the lending market authority
 * @param lendingMarket
 * @param programId
 * @returns [authority, bump]
 */
export function lendingMarketAuthPda(lendingMarket: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([Buffer.from(LENDING_MARKET_AUTH_SEED), lendingMarket.toBuffer()], programId);
}

/**
 * Returns the PDA and bump for the reserve liquidity supply
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [pda, bump]
 */
export function reserveLiqSupplyPda(lendingMarket: PublicKey, mint: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(RESERVE_LIQ_SUPPLY_SEED), lendingMarket.toBuffer(), mint.toBuffer()],
    programId
  );
}

/**
 * Returns the PDA and bump for the reserve fee vault
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [vaultPda, bump]
 */
export function reserveFeeVaultPda(lendingMarket: PublicKey, mint: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(FEE_RECEIVER_SEED), lendingMarket.toBuffer(), mint.toBuffer()],
    programId
  );
}

/**
 * Returns the PDA and bump for the reserve collateral mint
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [mintPda, bump]
 */
export function reserveCollateralMintPda(lendingMarket: PublicKey, mint: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(RESERVE_COLL_MINT_SEED), lendingMarket.toBuffer(), mint.toBuffer()],
    programId
  );
}

/**
 * Returns the PDA and bump for the reserve collateral supply
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [pda, bump]
 */
export function reserveCollateralSupplyPda(
  lendingMarket: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(RESERVE_COLL_SUPPLY_SEED), lendingMarket.toBuffer(), mint.toBuffer()],
    programId
  );
}

/**
 * Returns the PDA and bump for the user metadata state
 * @param user
 * @param programId
 * @returns [pda, bump]
 */
export function userMetadataPda(user: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([Buffer.from(BASE_SEED_USER_METADATA), user.toBuffer()], programId);
}

/**
 * Returns the PDA and bump for the referrer account for a mint
 * @param referrer
 * @param mint
 * @param programId
 * @returns [pda, bump]
 */
export function referrerTokenStatePda(referrer: PublicKey, reserve: PublicKey, programId: PublicKey = PROGRAM_ID) {
  if (referrer.equals(PublicKey.default)) {
    return [programId];
  }

  return PublicKey.findProgramAddressSync(
    [Buffer.from(BASE_SEED_REFERRER_TOKEN_STATE), referrer.toBuffer(), reserve.toBuffer()],
    programId
  );
}

/**
 * Returns the PDA and bump for the referrer state
 * @param referrer
 * @param programId
 * @returns [pda, bump]
 */
export function referrerStatePda(referrer: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([Buffer.from(BASE_SEED_REFERRER_STATE), referrer.toBuffer()], programId);
}

/**
 * Returns the PDA and bump for the short url
 * @param shortUrl
 * @param programId
 * @returns [pda, bump]
 */
export function shortUrlPda(shortUrl: string, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([Buffer.from(BASE_SEED_SHORT_URL), Buffer.from(shortUrl)], programId);
}
