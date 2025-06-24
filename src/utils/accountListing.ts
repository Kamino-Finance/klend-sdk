import { Address, Base58EncodedBytes, getBase58Decoder, GetProgramAccountsApi, Rpc } from '@solana/kit';
import { LendingMarket, Obligation, Reserve } from '../@codegen/klend/accounts';
import { PROGRAM_ID } from '../@codegen/klend/programId';

const base58Decoder = getBase58Decoder();

export async function* getAllObligationAccounts(
  connection: Rpc<GetProgramAccountsApi>
): AsyncGenerator<[Address, Obligation], void, unknown> {
  // Poor-man's paging...
  for (let i = 0; i < 256; i++) {
    const obligations = await connection
      .getProgramAccounts(PROGRAM_ID, {
        filters: [
          {
            dataSize: BigInt(Obligation.layout.span + 8),
          },
          {
            memcmp: {
              offset: 0n,
              bytes: base58Decoder.decode(Obligation.discriminator) as Base58EncodedBytes,
              encoding: 'base58',
            },
          },
          {
            memcmp: {
              offset: 64n,
              bytes: base58Decoder.decode(Buffer.from([i])) as Base58EncodedBytes, // ...via sharding by userId's first byte (just as a source of randomness)
              encoding: 'base58',
            },
          },
        ],
        encoding: 'base64',
      })
      .send();
    for (const obligation of obligations) {
      yield [obligation.pubkey, Obligation.decode(Buffer.from(obligation.account.data[0], 'base64'))];
    }
  }
}

export async function* getAllReserveAccounts(
  rpc: Rpc<GetProgramAccountsApi>
): AsyncGenerator<[Address, Reserve], void, unknown> {
  // due to relatively low count of reserves, we technically don't really need a generator, but let's keep it consistent within this file
  const reserves = await rpc
    .getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          dataSize: BigInt(Reserve.layout.span + 8),
        },
        {
          memcmp: {
            offset: 0n,
            bytes: base58Decoder.decode(Reserve.discriminator) as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ],
      encoding: 'base64',
    })
    .send();
  for (const reserve of reserves) {
    yield [reserve.pubkey, Reserve.decode(Buffer.from(reserve.account.data[0], 'base64'))];
  }
}

export async function* getAllLendingMarketAccounts(
  connection: Rpc<GetProgramAccountsApi>,
  programId: Address = PROGRAM_ID
): AsyncGenerator<[Address, LendingMarket], void, unknown> {
  // due to relatively very low count of lending markets, we technically don't really need a generator, but let's keep it consistent within this file
  const lendingMarkets = await connection
    .getProgramAccounts(programId, {
      filters: [
        {
          dataSize: BigInt(LendingMarket.layout.span + 8),
        },
        {
          memcmp: {
            offset: 0n,
            bytes: base58Decoder.decode(LendingMarket.discriminator) as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ],
      encoding: 'base64',
    })
    .send();
  for (const lendingMarket of lendingMarkets) {
    yield [lendingMarket.pubkey, LendingMarket.decode(Buffer.from(lendingMarket.account.data[0], 'base64'))];
  }
}
