/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  address,
  Address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UserStateFields {
  userId: BN
  farmState: Address
  owner: Address
  /** Indicate if this user state is part of a delegated farm */
  isFarmDelegated: number
  padding0: Array<number>
  /**
   * Rewards tally used for computation of gained rewards
   * (scaled from `Decimal` representation).
   */
  rewardsTallyScaled: Array<BN>
  /** Number of reward tokens ready for claim */
  rewardsIssuedUnclaimed: Array<BN>
  lastClaimTs: Array<BN>
  /**
   * User stake deposited and usable, generating rewards and fees.
   * (scaled from `Decimal` representation).
   */
  activeStakeScaled: BN
  /**
   * User stake deposited but not usable and not generating rewards yet.
   * (scaled from `Decimal` representation).
   */
  pendingDepositStakeScaled: BN
  /**
   * After this timestamp, pending user stake can be moved to user stake
   * Initialized to now() + delayed user stake period
   */
  pendingDepositStakeTs: BN
  /**
   * User deposits unstaked, pending for withdrawal, not usable and not generating rewards.
   * (scaled from `Decimal` representation).
   */
  pendingWithdrawalUnstakeScaled: BN
  /** After this timestamp, user can withdraw their deposit. */
  pendingWithdrawalUnstakeTs: BN
  /** User bump used for account address validation */
  bump: BN
  /** Delegatee used for initialisation - useful to check against */
  delegatee: Address
  lastStakeTs: BN
  padding1: Array<BN>
}

export interface UserStateJSON {
  userId: string
  farmState: string
  owner: string
  /** Indicate if this user state is part of a delegated farm */
  isFarmDelegated: number
  padding0: Array<number>
  /**
   * Rewards tally used for computation of gained rewards
   * (scaled from `Decimal` representation).
   */
  rewardsTallyScaled: Array<string>
  /** Number of reward tokens ready for claim */
  rewardsIssuedUnclaimed: Array<string>
  lastClaimTs: Array<string>
  /**
   * User stake deposited and usable, generating rewards and fees.
   * (scaled from `Decimal` representation).
   */
  activeStakeScaled: string
  /**
   * User stake deposited but not usable and not generating rewards yet.
   * (scaled from `Decimal` representation).
   */
  pendingDepositStakeScaled: string
  /**
   * After this timestamp, pending user stake can be moved to user stake
   * Initialized to now() + delayed user stake period
   */
  pendingDepositStakeTs: string
  /**
   * User deposits unstaked, pending for withdrawal, not usable and not generating rewards.
   * (scaled from `Decimal` representation).
   */
  pendingWithdrawalUnstakeScaled: string
  /** After this timestamp, user can withdraw their deposit. */
  pendingWithdrawalUnstakeTs: string
  /** User bump used for account address validation */
  bump: string
  /** Delegatee used for initialisation - useful to check against */
  delegatee: string
  lastStakeTs: string
  padding1: Array<string>
}

export class UserState {
  readonly userId: BN
  readonly farmState: Address
  readonly owner: Address
  /** Indicate if this user state is part of a delegated farm */
  readonly isFarmDelegated: number
  readonly padding0: Array<number>
  /**
   * Rewards tally used for computation of gained rewards
   * (scaled from `Decimal` representation).
   */
  readonly rewardsTallyScaled: Array<BN>
  /** Number of reward tokens ready for claim */
  readonly rewardsIssuedUnclaimed: Array<BN>
  readonly lastClaimTs: Array<BN>
  /**
   * User stake deposited and usable, generating rewards and fees.
   * (scaled from `Decimal` representation).
   */
  readonly activeStakeScaled: BN
  /**
   * User stake deposited but not usable and not generating rewards yet.
   * (scaled from `Decimal` representation).
   */
  readonly pendingDepositStakeScaled: BN
  /**
   * After this timestamp, pending user stake can be moved to user stake
   * Initialized to now() + delayed user stake period
   */
  readonly pendingDepositStakeTs: BN
  /**
   * User deposits unstaked, pending for withdrawal, not usable and not generating rewards.
   * (scaled from `Decimal` representation).
   */
  readonly pendingWithdrawalUnstakeScaled: BN
  /** After this timestamp, user can withdraw their deposit. */
  readonly pendingWithdrawalUnstakeTs: BN
  /** User bump used for account address validation */
  readonly bump: BN
  /** Delegatee used for initialisation - useful to check against */
  readonly delegatee: Address
  readonly lastStakeTs: BN
  readonly padding1: Array<BN>

  static readonly discriminator = Buffer.from([
    72, 177, 85, 249, 76, 167, 186, 126,
  ])

  static readonly layout = borsh.struct<UserState>([
    borsh.u64("userId"),
    borshAddress("farmState"),
    borshAddress("owner"),
    borsh.u8("isFarmDelegated"),
    borsh.array(borsh.u8(), 7, "padding0"),
    borsh.array(borsh.u128(), 10, "rewardsTallyScaled"),
    borsh.array(borsh.u64(), 10, "rewardsIssuedUnclaimed"),
    borsh.array(borsh.u64(), 10, "lastClaimTs"),
    borsh.u128("activeStakeScaled"),
    borsh.u128("pendingDepositStakeScaled"),
    borsh.u64("pendingDepositStakeTs"),
    borsh.u128("pendingWithdrawalUnstakeScaled"),
    borsh.u64("pendingWithdrawalUnstakeTs"),
    borsh.u64("bump"),
    borshAddress("delegatee"),
    borsh.u64("lastStakeTs"),
    borsh.array(borsh.u64(), 50, "padding1"),
  ])

  constructor(fields: UserStateFields) {
    this.userId = fields.userId
    this.farmState = fields.farmState
    this.owner = fields.owner
    this.isFarmDelegated = fields.isFarmDelegated
    this.padding0 = fields.padding0
    this.rewardsTallyScaled = fields.rewardsTallyScaled
    this.rewardsIssuedUnclaimed = fields.rewardsIssuedUnclaimed
    this.lastClaimTs = fields.lastClaimTs
    this.activeStakeScaled = fields.activeStakeScaled
    this.pendingDepositStakeScaled = fields.pendingDepositStakeScaled
    this.pendingDepositStakeTs = fields.pendingDepositStakeTs
    this.pendingWithdrawalUnstakeScaled = fields.pendingWithdrawalUnstakeScaled
    this.pendingWithdrawalUnstakeTs = fields.pendingWithdrawalUnstakeTs
    this.bump = fields.bump
    this.delegatee = fields.delegatee
    this.lastStakeTs = fields.lastStakeTs
    this.padding1 = fields.padding1
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<UserState | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `UserStateFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<UserState | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `UserStateFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): UserState {
    if (!data.slice(0, 8).equals(UserState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = UserState.layout.decode(data.slice(8))

    return new UserState({
      userId: dec.userId,
      farmState: dec.farmState,
      owner: dec.owner,
      isFarmDelegated: dec.isFarmDelegated,
      padding0: dec.padding0,
      rewardsTallyScaled: dec.rewardsTallyScaled,
      rewardsIssuedUnclaimed: dec.rewardsIssuedUnclaimed,
      lastClaimTs: dec.lastClaimTs,
      activeStakeScaled: dec.activeStakeScaled,
      pendingDepositStakeScaled: dec.pendingDepositStakeScaled,
      pendingDepositStakeTs: dec.pendingDepositStakeTs,
      pendingWithdrawalUnstakeScaled: dec.pendingWithdrawalUnstakeScaled,
      pendingWithdrawalUnstakeTs: dec.pendingWithdrawalUnstakeTs,
      bump: dec.bump,
      delegatee: dec.delegatee,
      lastStakeTs: dec.lastStakeTs,
      padding1: dec.padding1,
    })
  }

  toJSON(): UserStateJSON {
    return {
      userId: this.userId.toString(),
      farmState: this.farmState,
      owner: this.owner,
      isFarmDelegated: this.isFarmDelegated,
      padding0: this.padding0,
      rewardsTallyScaled: this.rewardsTallyScaled.map((item) =>
        item.toString()
      ),
      rewardsIssuedUnclaimed: this.rewardsIssuedUnclaimed.map((item) =>
        item.toString()
      ),
      lastClaimTs: this.lastClaimTs.map((item) => item.toString()),
      activeStakeScaled: this.activeStakeScaled.toString(),
      pendingDepositStakeScaled: this.pendingDepositStakeScaled.toString(),
      pendingDepositStakeTs: this.pendingDepositStakeTs.toString(),
      pendingWithdrawalUnstakeScaled:
        this.pendingWithdrawalUnstakeScaled.toString(),
      pendingWithdrawalUnstakeTs: this.pendingWithdrawalUnstakeTs.toString(),
      bump: this.bump.toString(),
      delegatee: this.delegatee,
      lastStakeTs: this.lastStakeTs.toString(),
      padding1: this.padding1.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: UserStateJSON): UserState {
    return new UserState({
      userId: new BN(obj.userId),
      farmState: address(obj.farmState),
      owner: address(obj.owner),
      isFarmDelegated: obj.isFarmDelegated,
      padding0: obj.padding0,
      rewardsTallyScaled: obj.rewardsTallyScaled.map((item) => new BN(item)),
      rewardsIssuedUnclaimed: obj.rewardsIssuedUnclaimed.map(
        (item) => new BN(item)
      ),
      lastClaimTs: obj.lastClaimTs.map((item) => new BN(item)),
      activeStakeScaled: new BN(obj.activeStakeScaled),
      pendingDepositStakeScaled: new BN(obj.pendingDepositStakeScaled),
      pendingDepositStakeTs: new BN(obj.pendingDepositStakeTs),
      pendingWithdrawalUnstakeScaled: new BN(
        obj.pendingWithdrawalUnstakeScaled
      ),
      pendingWithdrawalUnstakeTs: new BN(obj.pendingWithdrawalUnstakeTs),
      bump: new BN(obj.bump),
      delegatee: address(obj.delegatee),
      lastStakeTs: new BN(obj.lastStakeTs),
      padding1: obj.padding1.map((item) => new BN(item)),
    })
  }
}
