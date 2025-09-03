import { CliConnectionPool } from './CliConnectionPool';
import { Account, Instruction, TransactionSigner } from '@solana/kit';
import { sendAndConfirmTx } from './tx';
import { printSimulateTx } from './simulate';
import { printMultisigTx } from './multisig';
import { SendTxMode, sendTxModes } from './CliEnv';
import { AddressLookupTable } from '@solana-program/address-lookup-table';

export async function processTx(
  c: CliConnectionPool,
  payer: TransactionSigner,
  ixs: Instruction[],
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
    default:
      throw new Error(`Unknown tx mode ${mode}, valid options: ${sendTxModes.join('|')}`);
  }
}
