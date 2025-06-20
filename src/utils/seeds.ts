import { Address, address, getAddressEncoder, getProgramDerivedAddress, ProgramDerivedAddress } from '@solana/kit';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { PROGRAM_ID as FARMS_PROGRAM_ID } from '@kamino-finance/farms-sdk/dist/@codegen/farms/programId';
import { METADATA_PROGRAM_ID, METADATA_SEED } from '../classes/vault';
import { Buffer } from 'buffer';

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
 * Short url seed
 */
export const BASE_SEED_GLOBAL_CONFIG_STATE = 'global_config';
/**
 * Farm user state seed
 */
export const BASE_SEED_USER_STATE = 'user';

/**
 * User farm state seed
 */
export const BASE_SEED_FARM_USER_STATE = Buffer.from('user');

const addressEncoder = getAddressEncoder();

/**
 * Encapsulates all the PDAs for a given reserve
 */
export interface ReservePdas {
  liquiditySupplyVault: Address;
  collateralMint: Address;
  collateralSupplyVault: Address;
  feeVault: Address;
}

/**
 * Returns all the PDAs for the given reserve
 * @param programId
 * @param market
 * @param mint
 * @returns ReservePdas
 */
export async function reservePdas(programId: Address, market: Address, mint: Address): Promise<ReservePdas> {
  const [[liquiditySupplyVault], [collateralMint], [collateralSupplyVault], [feeVault]] = await Promise.all([
    reserveLiqSupplyPda(market, mint, programId),
    reserveCollateralMintPda(market, mint, programId),
    reserveCollateralSupplyPda(market, mint, programId),
    reserveFeeVaultPda(market, mint, programId),
  ]);
  return {
    liquiditySupplyVault,
    collateralMint,
    collateralSupplyVault,
    feeVault,
  };
}

/**
 * Returns the PDA and bump for the lending market authority
 * @param lendingMarket
 * @param programId
 * @returns [authority, bump]
 */
export function lendingMarketAuthPda(
  lendingMarket: Address,
  programId: Address = PROGRAM_ID
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(LENDING_MARKET_AUTH_SEED), addressEncoder.encode(lendingMarket)],
    programAddress: programId,
  });
}

/**
 * Returns the PDA and bump for the reserve liquidity supply
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [pda, bump]
 */
export async function reserveLiqSupplyPda(
  lendingMarket: Address,
  mint: Address,
  programId: Address = PROGRAM_ID
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(RESERVE_LIQ_SUPPLY_SEED), addressEncoder.encode(lendingMarket), addressEncoder.encode(mint)],
    programAddress: programId,
  });
}

/**
 * Returns the PDA and bump for the reserve fee vault
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [vaultPda, bump]
 */
export async function reserveFeeVaultPda(
  lendingMarket: Address,
  mint: Address,
  programId: Address = PROGRAM_ID
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(FEE_RECEIVER_SEED), addressEncoder.encode(lendingMarket), addressEncoder.encode(mint)],
    programAddress: programId,
  });
}

/**
 * Returns the PDA and bump for the reserve collateral mint
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [mintPda, bump]
 */
export async function reserveCollateralMintPda(
  lendingMarket: Address,
  mint: Address,
  programId: Address = PROGRAM_ID
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(RESERVE_COLL_MINT_SEED), addressEncoder.encode(lendingMarket), addressEncoder.encode(mint)],
    programAddress: programId,
  });
}

/**
 * Returns the PDA and bump for the reserve collateral supply
 * @param lendingMarket
 * @param mint
 * @param programId
 * @returns [pda, bump]
 */
export function reserveCollateralSupplyPda(
  lendingMarket: Address,
  mint: Address,
  programId: Address = PROGRAM_ID
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(RESERVE_COLL_SUPPLY_SEED), addressEncoder.encode(lendingMarket), addressEncoder.encode(mint)],
    programAddress: programId,
  });
}

/**
 * Returns the PDA and bump for the user metadata state
 * @param user
 * @param programId
 * @returns [pda, bump]
 */
export function userMetadataPda(user: Address, programId: Address = PROGRAM_ID): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(BASE_SEED_USER_METADATA), addressEncoder.encode(user)],
    programAddress: programId,
  });
}

/**
 * Returns the PDA and bump for the referrer account for a mint
 * @param referrer
 * @param reserve
 * @param programId
 * @returns pda
 */
export async function referrerTokenStatePda(
  referrer: Address,
  reserve: Address,
  programId: Address = PROGRAM_ID
): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    seeds: [
      Buffer.from(BASE_SEED_REFERRER_TOKEN_STATE),
      addressEncoder.encode(referrer),
      addressEncoder.encode(reserve),
    ],
    programAddress: programId,
  });
  return address;
}

/**
 * Returns the PDA and bump for the referrer state
 * @param referrer
 * @param programId
 * @returns [pda, bump]
 */
export function referrerStatePda(referrer: Address, programId: Address = PROGRAM_ID): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(BASE_SEED_REFERRER_STATE), addressEncoder.encode(referrer)],
    programAddress: programId,
  });
}

/**
 * Returns the PDA and bump for the short url
 * @param shortUrl
 * @param programId
 * @returns pda
 */
export async function shortUrlPda(shortUrl: string, programId: Address = PROGRAM_ID): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    seeds: [Buffer.from(BASE_SEED_SHORT_URL), Buffer.from(shortUrl)],
    programAddress: programId,
  });
  return address;
}

/**
 * Returns the PDA and bump for the global config state.
 * @param programId
 * @returns pda
 */
export async function globalConfigPda(programId: Address = PROGRAM_ID): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    seeds: [Buffer.from(BASE_SEED_GLOBAL_CONFIG_STATE)],
    programAddress: programId,
  });
  return address;
}

/**
 * Returns the PDA and bump for the program data.
 * @param programId
 * @returns pda
 */
export async function programDataPda(programId: Address = PROGRAM_ID): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    seeds: [addressEncoder.encode(programId)],
    programAddress: address('BPFLoaderUpgradeab1e11111111111111111111111'),
  });
  return pda;
}

/**
 * Returns the PDA for the obligation farm state
 * @param farm
 * @param obligation
 * @returns pda
 */
export async function obligationFarmStatePda(farm: Address, obligation: Address): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    seeds: [Buffer.from(BASE_SEED_USER_STATE), addressEncoder.encode(farm), addressEncoder.encode(obligation)],
    programAddress: FARMS_PROGRAM_ID,
  });
  return address;
}

/**
 * Returns the PDA for the kVault shares metadata
 * @param mint
 * @returns [pda, bump]
 */
export async function getKVaultSharesMetadataPda(mint: Address): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [Buffer.from(METADATA_SEED), addressEncoder.encode(METADATA_PROGRAM_ID), addressEncoder.encode(mint)],
    programAddress: METADATA_PROGRAM_ID,
  });
}
