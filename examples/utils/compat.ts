import { Account, AccountRole, Instruction, lamports, none, some } from '@solana/kit';
import { AddressLookupTableAccount, TransactionInstruction } from '@solana/web3.js';
import { fromLegacyPublicKey, fromLegacyTransactionInstruction } from '@solana/compat';
import { ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS, AddressLookupTable } from '@solana-program/address-lookup-table';

export function fromLegacyLookupTables(...account: AddressLookupTableAccount[]): Account<AddressLookupTable>[] {
  return account.map(fromLegacyLookupTable);
}

function fromLegacyLookupTable(lut: AddressLookupTableAccount): Account<AddressLookupTable> {
  return {
    address: fromLegacyPublicKey(lut.key),
    programAddress: ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS,
    executable: false,
    lamports: lamports(0n),
    data: {
      padding: 0,
      lastExtendedSlotStartIndex: lut.state.lastExtendedSlotStartIndex,
      lastExtendedSlot: BigInt(lut.state.lastExtendedSlot),
      addresses: lut.state.addresses.map(fromLegacyPublicKey),
      authority: lut.state.authority ? some(fromLegacyPublicKey(lut.state.authority)) : none(),
      discriminator: 0,
      deactivationSlot: lut.state.deactivationSlot,
    },
    space: 0n,
  };
}

export function fromLegacyInstructions(...legacy: TransactionInstruction[]): Instruction[] {
  return legacy.map(fromLegacyTransactionInstruction);
}

export function getAccountRole({ isSigner, isMut }: { isSigner: boolean; isMut: boolean }): AccountRole {
  if (isSigner && isMut) {
    return AccountRole.WRITABLE_SIGNER;
  }
  if (isSigner && !isMut) {
    return AccountRole.READONLY_SIGNER;
  }
  if (!isSigner && isMut) {
    return AccountRole.WRITABLE;
  }
  return AccountRole.READONLY;
}
