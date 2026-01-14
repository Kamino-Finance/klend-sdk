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
  isFarmDelegated: number
  padding0: Array<number>
  rewardsTallyScaled: Array<BN>
  rewardsIssuedUnclaimed: Array<BN>
  lastClaimTs: Array<BN>
  activeStakeScaled: BN
  pendingDepositStakeScaled: BN
  pendingDepositStakeTs: BN
  pendingWithdrawalUnstakeScaled: BN
  pendingWithdrawalUnstakeTs: BN
  bump: BN
  delegatee: Address
  lastStakeTs: BN
  padding1: Array<BN>
}

export interface UserStateJSON {
  userId: string
  farmState: string
  owner: string
  isFarmDelegated: number
  padding0: Array<number>
  rewardsTallyScaled: Array<string>
  rewardsIssuedUnclaimed: Array<string>
  lastClaimTs: Array<string>
  activeStakeScaled: string
  pendingDepositStakeScaled: string
  pendingDepositStakeTs: string
  pendingWithdrawalUnstakeScaled: string
  pendingWithdrawalUnstakeTs: string
  bump: string
  delegatee: string
  lastStakeTs: string
  padding1: Array<string>
}

export class UserState {
  readonly userId: BN
  readonly farmState: Address
  readonly owner: Address
  readonly isFarmDelegated: number
  readonly padding0: Array<number>
  readonly rewardsTallyScaled: Array<BN>
  readonly rewardsIssuedUnclaimed: Array<BN>
  readonly lastClaimTs: Array<BN>
  readonly activeStakeScaled: BN
  readonly pendingDepositStakeScaled: BN
  readonly pendingDepositStakeTs: BN
  readonly pendingWithdrawalUnstakeScaled: BN
  readonly pendingWithdrawalUnstakeTs: BN
  readonly bump: BN
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
