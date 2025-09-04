import {
  initializePool,
  InitializePoolAccounts,
  updatePoolConfig,
  UpdatePoolConfigAccounts,
  UpdatePoolConfigArgs,
  collect,
  CollectAccounts,
  burn,
  BurnAccounts,
  BurnArgs,
  mint,
  MintAccounts,
  MintArgs,
} from '../@codegen/unstaking_pool/instructions';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { getAssociatedTokenAddress } from '../lib';
import { PoolState, UnstakeTicket } from '../@codegen/unstaking_pool/accounts';
import {
  createLookupTableIx,
  DEFAULT_PUBLIC_KEY,
  extendLookupTableIxs,
  insertIntoLookupTableIxs,
  WRAPPED_SOL_MINT,
} from '../utils';
import bs58 from 'bs58';
import { getProgramAccounts } from '../utils/rpc';
import { InitPoolIxs, MintIxs } from './unstakingPoolTypes';
import { PoolConfigField, PoolConfigFieldKind } from '../@codegen/unstaking_pool/types';
import BN from 'bn.js';
import { mapStakedSolMintToPool, StakePoolType } from './stakePool';
import { getStandardPoolMintRemainingAccounts, STAKE_POOL_PROGRAM_ID, StakeAccount } from './standardStakePool';
import {
  Address,
  address,
  Base58EncodedBytes,
  generateKeyPairSigner,
  GetAccountInfoApi,
  getAddressEncoder,
  GetProgramAccountsApi,
  GetProgramAccountsDatasizeFilter,
  GetProgramAccountsMemcmpFilter,
  getProgramDerivedAddress,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  KeyPairSigner,
  ProgramDerivedAddress,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
} from '@solana/kit';
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { SYSVAR_CLOCK_ADDRESS, SYSVAR_INSTRUCTIONS_ADDRESS, SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { fromLegacyPublicKey } from '@solana/compat';
import { PROGRAM_ID as UNSTAKING_POOL_ID } from '../@codegen/unstaking_pool/programId';
export const UNSTAKING_POOL_STAGING_ID: Address = address('SUPFzSvjWnK9AbQ5bQksKaDKeAZBx56Gtjx1AjJsUdj');
export const STAKE_PROGRAM_ID: Address = address('Stake11111111111111111111111111111111111111');
export const CLOCK_PROGRAM_ID: Address = address('SysvarC1ock11111111111111111111111111111111');
const STAKE_HISTORY_PROGRAM_ID: Address = address('SysvarStakeHistory1111111111111111111111111');
const STAKE_ACCOUNT_SIZE: number = 200;
export const STAKE_POOL_SIZE: number = 611;
const addressEncoder = getAddressEncoder();

/**
 * Unstaking sol mint seed
 */
export const UNSTAKING_SOL_MINT_SEED = Buffer.from('unstaking_sol_mint');

/**
 * Unstaking sol pool base authority seed
 */
export const BASE_POOL_AUTHORITY_SEED = Buffer.from('authority');

/**
 * KaminoPoolClient is a class that provides a high-level interface to interact with the Kamino Pool program.
 */
export class UnstakingPoolClient {
  private readonly _rpc: Rpc<SolanaRpcApi>;
  private readonly _unstakingPoolProgramId: Address;

  constructor(rpc: Rpc<SolanaRpcApi>, unstakingPoolprogramId?: Address) {
    this._rpc = rpc;
    this._unstakingPoolProgramId = unstakingPoolprogramId ? unstakingPoolprogramId : UNSTAKING_POOL_ID;
  }

  getConnection() {
    return this._rpc;
  }

  getProgramID() {
    return this._unstakingPoolProgramId;
  }

  /**
   * This method will create a pool with a given config. The config can be changed later on, but it is recommended to set it up correctly from the start
   * @param poolConfig - the config object used to create a pool
   * @returns pool - keypair, should be used to sign the transaction which creates the pool account
   * @returns pool: the keypair of the pool, used to sign the initialization transaction; initPoolIxs: a struct with ixs to initialize the pool and its lookup table + populateLUTIxs, a list to populate the lookup table which has to be executed in a separate transaction
   */
  async createPoolIxs(poolConfig: UnstakingPoolConfig): Promise<{ pool: KeyPairSigner; initPoolIxs: InitPoolIxs }> {
    const poolState = await generateKeyPairSigner();
    const size = PoolState.layout.span + 8;

    const createPoolIx = getCreateAccountInstruction({
      payer: poolConfig.admin,
      newAccount: poolState,
      lamports: await this.getConnection().getMinimumBalanceForRentExemption(BigInt(size)).send(),
      space: size,
      programAddress: this._unstakingPoolProgramId,
    });

    const unstakingSolMint = (await unstakingPoolMintPda(poolState.address))[0];
    const basePoolAuthority = (await unstakingPoolAuthorityPda(poolState.address))[0];
    const wsolVault = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, basePoolAuthority);

    const initPoolAccounts: InitializePoolAccounts = {
      admin: poolConfig.admin,
      poolState: poolState.address,
      basePoolAuthority,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      rent: SYSVAR_RENT_ADDRESS,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      unstakingSolMint,
      wsolMint: WRAPPED_SOL_MINT,
      wsolVault,
    };
    const initPoolIx = initializePool(initPoolAccounts, this._unstakingPoolProgramId);

    // create and set up the pool lookup table
    const [createLUTIx, lut] = await createLookupTableIx(this.getConnection(), poolConfig.admin);

    const allAccountsToBeInserted = [
      poolState.address,
      basePoolAuthority,
      wsolVault,
      unstakingSolMint,
      poolConfig.admin.address,
      WRAPPED_SOL_MINT,
      this._unstakingPoolProgramId,
      SYSTEM_PROGRAM_ADDRESS,
      SYSVAR_RENT_ADDRESS,
      TOKEN_PROGRAM_ADDRESS,
      TOKEN_2022_PROGRAM_ADDRESS,
      SYSVAR_INSTRUCTIONS_ADDRESS,
      SYSVAR_CLOCK_ADDRESS,
      STAKE_PROGRAM_ID,
      STAKE_POOL_PROGRAM_ID,
    ];
    const insertIntoLUTIxs = extendLookupTableIxs(poolConfig.admin, lut, allAccountsToBeInserted, poolConfig.admin);
    const updateLUTIx = await this.updatePoolConfigIxs(
      poolState.address,
      poolConfig.admin,
      new PoolConfigField.LookupTable(),
      lut.toString()
    );
    const ixns = [createPoolIx, initPoolIx, createLUTIx, ...insertIntoLUTIxs, updateLUTIx];

    if (poolConfig.actionAuthority) {
      const updateActionAuthorityIx = await this.updatePoolConfigIxs(
        poolState.address,
        poolConfig.admin,
        new PoolConfigField.ActionAuthority(),
        poolConfig.actionAuthority.toString()
      );
      ixns.push(updateActionAuthorityIx);
    }

    return { pool: poolState, initPoolIxs: { initPoolIxs: ixns, populateLUTIxs: [] } };
  }

  /**
   * Update pool configuration such as admin authority (or fees/minimum depositable in the future)
   * @param poolState - the pool to update and set the LUT for if needed or only the pool pubkey if updating LUT is not needed
   * @param admin - admin of the specified pool
   * @param mode - what field to update for pool
   * @param value - new value that is converted .toString()
   * @returns a struct that contains a list of ix to update the pool config
   */
  async updatePoolConfigIxs(
    poolState: UnstakingPool | Address,
    admin: TransactionSigner,
    mode: PoolConfigFieldKind,
    value: string
  ): Promise<Instruction> {
    const updatePoolConfigAccounts: UpdatePoolConfigAccounts = {
      admin,
      poolState: poolState instanceof UnstakingPool ? poolState.address : poolState,
    };
    const args: UpdatePoolConfigArgs = {
      entry: mode,
      data: Buffer.from([0]),
    };

    if (isNaN(+value)) {
      const data = address(value);
      args.data = Buffer.from(addressEncoder.encode(data));
    } else {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(value.toString()));
      args.data = buffer;
    }

    const updatePoolConfigIx = updatePoolConfig(args, updatePoolConfigAccounts, this._unstakingPoolProgramId);

    return updatePoolConfigIx;
  }

  /**
   * Collect a stake account SOL if the needed epoch was reached
   * @param poolState - the pool to collect SOL into
   * @param payer - payer for the operation (ix is permissionless)
   * @param stakeAccount - stake account that was deactivated this epoch and has base pool authority as owner
   * @returns collect instruction
   */
  async collectIx(poolState: UnstakingPool, payer: TransactionSigner, stakeAccount: Address): Promise<Instruction> {
    const pool = await poolState.getState(this.getConnection());
    const accounts: CollectAccounts = {
      poolState: poolState.address,
      payer,
      stakeAccount,
      basePoolAuthority: pool.basePoolAuthority,
      wsolVault: pool.wsolVault,
      wsolMint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      clockProgramId: SYSVAR_CLOCK_ADDRESS,
      stakeProgramId: STAKE_PROGRAM_ID,
      stakeHistoryProgramId: STAKE_HISTORY_PROGRAM_ID,
    };
    return collect(accounts, this._unstakingPoolProgramId);
  }

  /**
   * Burn a number of shares (USOL) in exchange for SOL
   * @param poolState - the pool to burn USOL from
   * @param user - user that burns (ix is not gated by action authority)
   * @param unstakeTicket - ticket where to burn the shares from
   * @param sharesToBurn - number of shares that are equivalent 1:1 with SOL
   * @returns burn instruction
   */
  async burnIx(
    poolState: UnstakingPool,
    user: TransactionSigner,
    unstakeTicket: Address,
    sharesToBurn: BN
  ): Promise<Instruction> {
    const pool = await poolState.getState(this.getConnection());
    const accounts: BurnAccounts = {
      poolState: poolState.address,
      basePoolAuthority: pool.basePoolAuthority,
      wsolVault: pool.wsolVault,
      wsolMint: WRAPPED_SOL_MINT,
      user,
      userWsolToken: await getAssociatedTokenAddress(WRAPPED_SOL_MINT, user.address),
      userUnstakingSolToken: await getAssociatedTokenAddress(pool.unstakingSolMint, user.address),
      unstakingSolMint: pool.unstakingSolMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      unstakeTicket,
    };
    const args: BurnArgs = {
      sharesToBurn,
      minWsolToReceive: sharesToBurn,
    };
    return burn(args, accounts, this._unstakingPoolProgramId);
  }

  /**
   * Mints a number of unstaking sol (USOL) in exchange for staked SOL
   * NOTE: this ix is permissioned by action authority
   * @param poolState - the pool to mint USOL from
   * @param user - user that mints
   * @param actionAuthority - user that has authority to mint in that pool (== poolState.actionAuthority)
   * @param unstakeTicket - empty keypair where unstake ticket will be stored
   * @param stakedSolMint - staked sol mint
   * @param stakedSolToDeposit - staked sol to convert to USOL (at the pool ratio)
   * @param minSharesToReceive - parameter to control slippage
   * @returns burn instruction
   */
  async mintIx(
    poolState: UnstakingPool,
    user: TransactionSigner,
    actionAuthority: TransactionSigner,
    unstakeTicket: TransactionSigner,
    stakedSolMint: Address,
    stakedSolToDeposit: BN,
    minSharesToReceive: BN
  ): Promise<MintIxs> {
    const pool = await poolState.getState(this.getConnection());
    // Create unstake ticket ix
    const size = UnstakeTicket.layout.span + 8;
    const createUnstakeTicketIx = getCreateAccountInstruction({
      payer: user,
      newAccount: unstakeTicket,
      lamports: await this.getConnection().getMinimumBalanceForRentExemption(BigInt(size)).send(),
      space: size,
      programAddress: this._unstakingPoolProgramId,
    });

    // Actual mint ix
    const [stakedSolPool, stakedSolPoolPk, stakePoolType] = await mapStakedSolMintToPool(
      this.getConnection(),
      stakedSolMint
    );
    const accounts: MintAccounts = {
      poolState: poolState.address,
      basePoolAuthority: pool.basePoolAuthority,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      unstakingSolMint: pool.unstakingSolMint,
      unstakingSolTokenProgram: TOKEN_PROGRAM_ADDRESS,
      user,
      actionAuthority,
      userStakedSolToken: await getAssociatedTokenAddress(stakedSolMint, user.address),
      userUnstakingSolToken: await getAssociatedTokenAddress(pool.unstakingSolMint, user.address),
      stakedSolMint,
      stakedSolTokenProgram: fromLegacyPublicKey(stakedSolPool.tokenProgramId),
      unstakingTicketAuthority: user.address,
      unstakeTicket: unstakeTicket.address,
    };
    const args: MintArgs = {
      stakedSolToDeposit,
      minSharesToReceive,
    };
    const ix = mint(args, accounts, this._unstakingPoolProgramId);
    let remainingAccounts: (AccountMeta | AccountSignerMeta)[] = [];
    let remainingSigners: KeyPairSigner[] = [];
    switch (stakePoolType) {
      case StakePoolType.Standard:
        [remainingAccounts, remainingSigners] = await getStandardPoolMintRemainingAccounts(
          this.getConnection(),
          stakedSolPool,
          stakedSolPoolPk,
          stakedSolToDeposit
        );
    }
    const ixAccounts = ix.accounts || [];
    const mintIx: Instruction = {
      programAddress: ix.programAddress,
      accounts: ixAccounts.concat(remainingAccounts),
      data: ix.data,
    };
    return { mintIxs: [createUnstakeTicketIx, mintIx], additionalSigners: remainingSigners };
  }

  /**
   * Sync a pool for lookup table;
   * @param pool the pool to sync the LUT for
   * @param owner the pool lut owner
   * @returns a struct that contains a list of ix to create the LUT and assign it to the pool if needed + a list of ixs to insert all the accounts in the LUT
   */
  async syncPoolLookupTable(pool: UnstakingPool, owner: TransactionSigner): Promise<Instruction[]> {
    const poolState = await pool.getState(this.getConnection());
    if (poolState.poolLookupTable == DEFAULT_PUBLIC_KEY) {
      throw new Error(`Pool ${pool.address} has no lut set`);
    }
    const allAccountsToBeInserted = [
      pool.address,
      poolState.basePoolAuthority,
      poolState.wsolVault,
      poolState.unstakingSolMint,
      poolState.actionAuthority,
      poolState.admin,
      this._unstakingPoolProgramId,
      SYSTEM_PROGRAM_ADDRESS,
      SYSVAR_RENT_ADDRESS,
      TOKEN_PROGRAM_ADDRESS,
      TOKEN_2022_PROGRAM_ADDRESS,
      SYSVAR_INSTRUCTIONS_ADDRESS,
      SYSVAR_CLOCK_ADDRESS,
      STAKE_PROGRAM_ID,
      STAKE_POOL_PROGRAM_ID,
    ];

    // Passing [] as accountsInLut will not fetch anything
    const syncIxs = insertIntoLookupTableIxs(
      this.getConnection(),
      owner,
      poolState.poolLookupTable,
      allAccountsToBeInserted,
      []
    );
    return syncIxs;
  }

  /**
   * Get all pools
   * @returns an array of all pools
   */
  async getAllPools(): Promise<UnstakingPool[]> {
    const filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[] = [
      {
        dataSize: BigInt(PoolState.layout.span + 8),
      },
      {
        memcmp: {
          offset: 0n,
          bytes: bs58.encode(PoolState.discriminator) as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
    ];

    const unstakingPools = await getProgramAccounts(
      this.getConnection(),
      this._unstakingPoolProgramId,
      PoolState.layout.span + 8,
      filters
    );

    return unstakingPools.map((unstakingPool) => {
      const unstakingPoolAccount = PoolState.decode(unstakingPool.data);
      if (!unstakingPoolAccount) {
        throw Error(`unstakingPool with pubkey ${unstakingPool.address.toString()} could not be decoded`);
      }

      return new UnstakingPool(unstakingPool.address, unstakingPoolAccount, this._unstakingPoolProgramId);
    });
  }
} // UnstakingPoolClient

export class UnstakingPool {
  readonly address: Address;
  state: PoolState | undefined | null;
  programId: Address;

  constructor(poolAddress: Address, state?: PoolState, programId: Address = UNSTAKING_POOL_ID) {
    this.address = poolAddress;
    this.state = state;
    this.programId = programId;
  }

  async getState(rpc: Rpc<GetAccountInfoApi>): Promise<PoolState> {
    if (!this.state) {
      this.state = await this.reloadState(rpc);
    }
    return this.state;
  }

  async reloadState(rpc: Rpc<GetAccountInfoApi>): Promise<PoolState> {
    this.state = await PoolState.fetch(rpc, this.address, this.programId);
    if (!this.state) {
      throw new Error(`Could not fetch pool ${this.address.toString()}`);
    }
    return this.state;
  }

  async getStakeAccountsForPool(rpc: Rpc<GetProgramAccountsApi>): Promise<Array<StakeAccountInfo>> {
    if (!this.state) {
      throw new Error('Need to have pool state to fetch stake accounts');
    }
    // Filter only accounts that have withdraw authority the base pool authority
    //                           and are delegating
    const results = await getProgramAccounts(rpc, STAKE_PROGRAM_ID, STAKE_ACCOUNT_SIZE, [
      { memcmp: { offset: 0n, bytes: bs58.encode([2]) as Base58EncodedBytes, encoding: 'base58' } },
      {
        memcmp: {
          offset: 44n,
          bytes: this.state.basePoolAuthority.toString() as Base58EncodedBytes,
          encoding: 'base58',
        },
      },
    ]);
    return results.map((result) => {
      return { stakeAccount: StakeAccount.decode(result.data), pk: result.address, lamports: new BN(result.lamports) };
    });
  }
}

export type StakeAccountInfo = {
  pk: Address;
  stakeAccount: StakeAccount;
  lamports: BN;
};

/**
 * Used to initialize a Kamino Pool
 */
export type UnstakingPoolConfig = {
  /** The admin of the pool */
  admin: TransactionSigner;
  /** Pubkey that can mint new tokens */
  actionAuthority: Address | null;
};

export function unstakingPoolMintPda(
  pool: Address,
  programId: Address = UNSTAKING_POOL_ID
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [UNSTAKING_SOL_MINT_SEED, addressEncoder.encode(pool)],
    programAddress: programId,
  });
}

export function unstakingPoolAuthorityPda(
  pool: Address,
  programId: Address = UNSTAKING_POOL_ID
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds: [BASE_POOL_AUTHORITY_SEED, addressEncoder.encode(pool)],
    programAddress: programId,
  });
}
