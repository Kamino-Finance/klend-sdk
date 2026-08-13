import { getConnectionPool } from '../utils/connection';
import { KaminoAction, KaminoBorrowOrder } from '@kamino-finance/klend-sdk';
import { EXAMPLE_OBLIGATION, MAIN_MARKET, USDC_MINT, USDC_RESERVE_MAIN_MARKET } from '../utils/constants';
import { getLoan, getMarket } from '../utils/helpers';
import { checkNotNull } from '../../src/utils/validations';
import { getKeypair } from '../utils/keypair';
import { sendAndConfirmTx } from '../utils/tx';
import BN from 'bn.js';

(async () => {
  // General set-up:
  const c = getConnectionPool();

  // Borrower's wallet (owner of the obligation)
  const borrowerWallet = await getKeypair();

  // Lender's wallet (different party that will fill the order)
  const lenderWallet = await getKeypair();

  const args = {
    rpc: c.rpc,
    obligationPubkey: EXAMPLE_OBLIGATION,
    marketPubkey: MAIN_MARKET,
  };
  const kaminoMarket = await getMarket(args);
  const kaminoObligation = checkNotNull(await getLoan(args));

  // Example 1: Borrower creates a fixed-term borrow order request
  // This creates a request to borrow 1000 USDC for min 30 days at max 10% APY (1000 bps)
  const borrowOrder = KaminoBorrowOrder.createFixedTermBorrowOrder({
    debtMint: USDC_MINT,
    amount: new BN(1000_000000), // 1000 USDC (6 decimals)
    destination: borrowerWallet.address, // Where borrowed funds should be sent
    termSeconds: new BN(30 * 24 * 60 * 60), // Fixed term of at least 30 days
    expirySeconds: new BN(7 * 24 * 60 * 60), // Order expires if not filled within 7 days
    maxRateBps: 1000, // Max 10% APY (1000 bps)
  });

  // Example 2: Borrower sets the borrow order on their obligation
  // This posts the order on-chain, making it available for lenders to fill
  const setBorrowOrderIxs = await KaminoAction.buildSetBorrowOrderIxs(
    borrowerWallet,
    kaminoMarket,
    kaminoObligation,
    borrowOrder,
    0, // orderIdx - the obligation's first borrow order
    new BN(0) // minExpectedCurrentRemainingDebtAmount - 0 for new orders
  );

  const setOrderTxHash = await sendAndConfirmTx(c, borrowerWallet, setBorrowOrderIxs, [], [], 'setBorrowOrder');
  console.log('Borrower set borrow order tx:', setOrderTxHash);

  // Example 3: Lender fills the borrow order
  // A lender would scan for obligations with active borrow orders and fill them
  const reserve = kaminoMarket.getReserveByAddress(USDC_RESERVE_MAIN_MARKET)!;
  const fillBorrowOrderIx = await KaminoAction.buildFillBorrowOrderIx(
    lenderWallet,
    kaminoMarket,
    kaminoObligation,
    reserve,
    // used to pick the order to fill: one past its fillable deadline is skipped
    Math.floor(Date.now() / 1000)
  );

  const fillOrderTxHash = await sendAndConfirmTx(c, lenderWallet, [fillBorrowOrderIx], [], [], 'fillBorrowOrder');
  console.log('Lender filled borrow order tx:', fillOrderTxHash);

  // Example 4: Borrower cancels a borrow order (before it's filled)
  const cancelOrderIxs = await KaminoAction.buildSetBorrowOrderIxs(
    borrowerWallet,
    kaminoMarket,
    kaminoObligation,
    null,
    0 // orderIdx - cancels the order set above; a cancellation has to name the order it means
  );

  const cancelTxHash = await sendAndConfirmTx(c, borrowerWallet, cancelOrderIxs, [], [], 'cancelBorrowOrder');
  console.log('Borrower cancelled borrow order tx:', cancelTxHash);
})().catch(async (e) => {
  console.error(e);
});
