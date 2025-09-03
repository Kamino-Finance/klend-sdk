/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export const DISCRIMINATOR = Buffer.from([130, 80, 38, 153, 80, 212, 182, 253])

export interface IdlMissingTypesArgs {
  reserveFarmKind: types.ReserveFarmKindKind
  assetTier: types.AssetTierKind
  feeCalculation: types.FeeCalculationKind
  reserveStatus: types.ReserveStatusKind
  updateConfigMode: types.UpdateConfigModeKind
  updateLendingMarketConfigValue: types.UpdateLendingMarketConfigValueKind
  updateLendingMarketConfigMode: types.UpdateLendingMarketModeKind
}

export interface IdlMissingTypesAccounts {
  signer: TransactionSigner
  globalConfig: Address
  lendingMarket: Address
  reserve: Address
}

export const layout = borsh.struct([
  types.ReserveFarmKind.layout("reserveFarmKind"),
  types.AssetTier.layout("assetTier"),
  types.FeeCalculation.layout("feeCalculation"),
  types.ReserveStatus.layout("reserveStatus"),
  types.UpdateConfigMode.layout("updateConfigMode"),
  types.UpdateLendingMarketConfigValue.layout("updateLendingMarketConfigValue"),
  types.UpdateLendingMarketMode.layout("updateLendingMarketConfigMode"),
])

export function idlMissingTypes(
  args: IdlMissingTypesArgs,
  accounts: IdlMissingTypesAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.signer.address, role: 2, signer: accounts.signer },
    { address: accounts.globalConfig, role: 0 },
    { address: accounts.lendingMarket, role: 0 },
    { address: accounts.reserve, role: 1 },
    ...remainingAccounts,
  ]
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      reserveFarmKind: args.reserveFarmKind.toEncodable(),
      assetTier: args.assetTier.toEncodable(),
      feeCalculation: args.feeCalculation.toEncodable(),
      reserveStatus: args.reserveStatus.toEncodable(),
      updateConfigMode: args.updateConfigMode.toEncodable(),
      updateLendingMarketConfigValue:
        args.updateLendingMarketConfigValue.toEncodable(),
      updateLendingMarketConfigMode:
        args.updateLendingMarketConfigMode.toEncodable(),
    },
    buffer
  )
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len)
  const ix: Instruction = { accounts: keys, programAddress, data }
  return ix
}
