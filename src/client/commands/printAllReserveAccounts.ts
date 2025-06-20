import { getAllReserveAccounts } from '../../utils';
import { GetProgramAccountsApi, Rpc } from '@solana/kit';

export async function printAllReserveAccounts(rpc: Rpc<GetProgramAccountsApi>): Promise<void> {
  let count = 0;
  const logItems: { address: string; value: string; index: number }[] = [];
  for await (const [address, reserveAccount] of getAllReserveAccounts(rpc)) {
    count++;
    const logItem = {
      address: address.toString(),
      value: reserveAccount.config.autodeleverageEnabled.toString(),
      index: count,
    };
    logItems.push(logItem);
  }
  console.log(`Total reserves: ${count}`);
  console.log(logItems);
}
