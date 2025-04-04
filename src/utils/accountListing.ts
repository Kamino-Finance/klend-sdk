import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import { LendingMarket, Obligation, Reserve } from '../idl_codegen/accounts';
import { PROGRAM_ID } from '../idl_codegen/programId';
import bs58 from 'bs58';

export async function* getAllObligationAccounts(
  connection: Connection
): AsyncGenerator<[PublicKey, Obligation], void, unknown> {
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
      yield [obligation.pubkey, Obligation.decode(obligation.account.data)];
    }
  }
}

export async function* getAllReserveAccounts(
  connection: Connection
): AsyncGenerator<[PublicKey, Reserve, AccountInfo<Buffer>], void, unknown> {
  // due to relatively low count of reserves, we technically don't really need a generator, but let's keep it consistent within this file
  const reserves = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        dataSize: Reserve.layout.span + 8,
      },
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Reserve.discriminator),
        },
      },
    ],
  });
  for (const reserve of reserves) {
    yield [reserve.pubkey, Reserve.decode(reserve.account.data), reserve.account];
  }
}

export async function* getAllLendingMarketAccounts(
  connection: Connection
): AsyncGenerator<[PublicKey, LendingMarket], void, unknown> {
  // due to relatively very low count of lending markets, we technically don't really need a generator, but let's keep it consistent within this file
  const lendingMarkets = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        dataSize: LendingMarket.layout.span + 8,
      },
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(LendingMarket.discriminator),
        },
      },
    ],
  });
  for (const lendingMarket of lendingMarkets) {
    yield [lendingMarket.pubkey, LendingMarket.decode(lendingMarket.account.data)];
  }
}
