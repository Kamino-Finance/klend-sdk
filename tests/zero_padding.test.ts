import { createMarketWithLoan } from './setup_utils';
import { expect } from 'chai';
import { BN } from '@coral-xyz/anchor';
import { Obligation, ObligationZP } from '../src';

describe('zero_padding', function () {
  it('retrieve an obligation', async function () {
    const { kaminoMarket, obligation } = await createMarketWithLoan(new BN(1000), new BN(500));
    await kaminoMarket.loadReserves();

    const fetchedObligation = await Obligation.fetch(kaminoMarket.getConnection(), obligation);
    const obligationJSON = fetchedObligation!.toJSON();
    obligationJSON.padding3 = [];
    const obligationJsonString = JSON.stringify(obligationJSON);

    const zeroPaddingObligation = await ObligationZP.fetch(kaminoMarket.getConnection(), obligation);
    const zeroPaddingObligationJSON = zeroPaddingObligation!.toJSON();
    const zeroPaddingObligationJsonString = JSON.stringify(zeroPaddingObligationJSON);

    expect(zeroPaddingObligationJsonString).eq(obligationJsonString);
  });
});
