import { Address, Base58EncodedBytes, Commitment, getBase58Decoder, Rpc, Slot } from '@solana/kit';
import { KaminoMarket, KaminoMarketRpcApi, KaminoObligation } from '../classes';
import { PROGRAM_ID } from '../@codegen/klend/programId';
import { Obligation } from '../@codegen/klend/accounts';
import Decimal from 'decimal.js';

export async function getUserObligationsInMarkets(
  rpc: Rpc<KaminoMarketRpcApi>,
  user: Address,
  markets: Map<Address, KaminoMarket>,
  slot: Slot,
  commitment: Commitment = 'processed',
  programId: Address = PROGRAM_ID
): Promise<KaminoObligation[]> {
  const obligations = await rpc
    .getProgramAccounts(programId, {
      filters: [
        {
          dataSize: BigInt(Obligation.layout.span + 8),
        },
        {
          memcmp: {
            offset: 0n,
            bytes: getBase58Decoder().decode(Obligation.discriminator) as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
        {
          memcmp: {
            offset: 64n,
            bytes: user.toString() as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ],
      encoding: 'base64',
      commitment,
    })
    .send();

  const collateralExchangeRates = new Map<Address, Decimal>();
  const cumulativeBorrowRates = new Map<Address, Decimal>();
  const kaminoObligations: KaminoObligation[] = [];
  for (const obligation of obligations) {
    if (obligation.account.owner !== programId) {
      throw new Error(`Account ${obligation.account.owner} doesn't belong to this program ${programId}`);
    }

    const obligationAccount = Obligation.decode(Buffer.from(obligation.account.data[0], 'base64'));

    if (!obligationAccount) {
      throw Error('Could not parse obligation.');
    }

    const market = markets.get(obligationAccount.lendingMarket);
    if (!market) {
      continue;
    }

    KaminoObligation.addRatesForObligation(
      market,
      obligationAccount,
      collateralExchangeRates,
      cumulativeBorrowRates,
      slot
    );
    kaminoObligations.push(
      new KaminoObligation(market, obligation.pubkey, obligationAccount, collateralExchangeRates, cumulativeBorrowRates)
    );
  }
  return kaminoObligations;
}
