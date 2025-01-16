import { Connection } from '@solana/web3.js';
import { Obligation } from '../idl_codegen/accounts';
import { PROGRAM_ID } from '../idl_codegen/programId';
import bs58 from 'bs58';

export async function* getAllObligationAccounts(connection: Connection): AsyncGenerator<Obligation, void, unknown> {
  // Poor-man's paging...
  for (let i = 0; i < 256; i++) {
    const obligations = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          dataSize: Obligation.layout.span + 8,
        },
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Obligation.discriminator),
          },
        },
        {
          memcmp: {
            offset: 64,
            bytes: bs58.encode([i]), // ...via sharding by userId's first byte (just as a source of randomness)
          },
        },
      ],
    });
    for (const obligation of obligations) {
      yield Obligation.decode(obligation.account.data);
    }
  }
}
