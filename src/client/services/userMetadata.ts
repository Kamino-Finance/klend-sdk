import { Address, GetProgramAccountsDatasizeFilter, GetProgramAccountsMemcmpFilter } from '@solana/kit';
import { getAllUserMetadatasWithFilter } from '../../utils';
import fs from 'fs';
import { CliConnectionPool } from '../tx/CliConnectionPool';

export async function downloadUserMetadatasWithFilter(
  c: CliConnectionPool,
  filter: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[],
  output: string,
  programId: Address
): Promise<void> {
  const userMetadatas = await getAllUserMetadatasWithFilter(c.rpc, filter, programId);

  // help mapping
  const userPubkeys = userMetadatas.map((userMetadatas) => userMetadatas.address.toString());

  if (output) {
    fs.writeFileSync(output, JSON.stringify(userPubkeys, null, 2));
  } else {
    for (const userPubkey of userPubkeys) {
      console.log(userPubkey);
    }
  }
  console.log('Total of ' + userPubkeys.length + ' userMetadatas filtered');
}
