import { ManagerConnectionPool } from './ManagerConnectionPool';
import { Account, IInstruction, TransactionSigner } from '@solana/kit';
import { sendAndConfirmTx } from './tx';
import { printSimulateTx } from './simulate';
import { printMultisigTx } from './multisig';
import { SendTxMode } from './ManagerEnv';
import { AddressLookupTable } from '@solana-program/address-lookup-table';

export async function processTx(
  c: ManagerConnectionPool,
  payer: TransactionSigner,
  ixs: IInstruction[],
  mode: SendTxMode,
  luts: Account<AddressLookupTable>[] = []
): Promise<void> {
  switch (mode) {
    case 'execute':
      await sendAndConfirmTx(c, payer, ixs, luts);
      break;
    case 'simulate':
      await printSimulateTx(c, payer, ixs, luts);
      break;
    case 'multisig':
      await printMultisigTx(payer, ixs, luts);
      break;
    case 'print':
      break;
  }
}
