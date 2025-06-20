import { getConnectionPool } from './utils/connection';
import { createPriceBasedOrder, KaminoAction, OrderType, readPriceBasedOrder } from '@kamino-finance/klend-sdk';
import { EXAMPLE_OBLIGATION, MAIN_MARKET } from './utils/constants';
import { getLoan, getMarket } from './utils/helpers';
import { checkNotNull } from '../src/utils/validations';
import Decimal from 'decimal.js';
import { getKeypair } from './utils/keypair';
import { OrderActionType, PriceBasedOrderTriggerType } from '../src';
import { sendAndConfirmTx } from './utils/tx';

(async () => {
  // General set-up:
  const c = getConnectionPool();
  const wallet = await getKeypair();
  const args = {
    rpc: c.rpc,
    obligationPubkey: EXAMPLE_OBLIGATION,
    marketPubkey: MAIN_MARKET,
  };
  const kaminoMarket = await getMarket(args);
  const kaminoObligation = checkNotNull(await getLoan(args));

  // Construct a context (most notably: indicate the available stablecoins):
  const context = { kaminoMarket, kaminoObligation, stablecoins: ['USDC'] };

  // Print the currently-set stop-loss of that obligation:
  const currentStopLoss = readPriceBasedOrder(context, OrderType.StopLoss);
  console.log(currentStopLoss);
  // Prints:
  // {
  //   trigger: {
  //     type: LongStopLoss,
  //     whenCollateralPriceBelow: 120,
  //   },
  //   action: {
  //     type: PartialRepay,
  //     repayDebtAmountLamports: 10000000,
  //   },
  //   executionBonusBpsRange: [50, 200],
  //   }
  // }
  // Means: "When SOL < $120, then repay 10 USDC of my debt - I can pay from 0.5% up to 2% bonus SOL to whoever executes that".

  // Make that stop-loss more aggressive: increase the trigger price and allow it to repay all USDC.
  const newStopLoss = createPriceBasedOrder(context, OrderType.StopLoss, {
    trigger: {
      type: PriceBasedOrderTriggerType.LongStopLoss,
      whenCollateralPriceBelow: new Decimal(125),
    },
    action: {
      type: OrderActionType.FullRepay,
    },
    executionBonusBpsRange: [50, 200],
  });

  // Create an instruction that will actually set the new order's state on-chain:
  const ix = KaminoAction.buildSetObligationOrderIxn(wallet, kaminoMarket, kaminoObligation, newStopLoss);
  const txHash = await sendAndConfirmTx(c, wallet, [ix], [], [], 'setObligationOrder');
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
