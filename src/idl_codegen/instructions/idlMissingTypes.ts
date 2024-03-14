import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface IdlMissingTypesArgs {
  reserveFarmKind: types.ReserveFarmKindKind
  assetTier: types.AssetTierKind
  feeCalculation: types.FeeCalculationKind
  reserveStatus: types.ReserveStatusKind
  updateConfigMode: types.UpdateConfigModeKind
  updateLendingMarketConfigValue: types.UpdateLendingMarketConfigValueKind
}

export interface IdlMissingTypesAccounts {
  lendingMarketOwner: PublicKey
  lendingMarket: PublicKey
  reserve: PublicKey
}

export const layout = borsh.struct([
  types.ReserveFarmKind.layout("reserveFarmKind"),
  types.AssetTier.layout("assetTier"),
  types.FeeCalculation.layout("feeCalculation"),
  types.ReserveStatus.layout("reserveStatus"),
  types.UpdateConfigMode.layout("updateConfigMode"),
  types.UpdateLendingMarketConfigValue.layout("updateLendingMarketConfigValue"),
])

export function idlMissingTypes(
  args: IdlMissingTypesArgs,
  accounts: IdlMissingTypesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lendingMarketOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.lendingMarket, isSigner: false, isWritable: false },
    { pubkey: accounts.reserve, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([130, 80, 38, 153, 80, 212, 182, 253])
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
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
