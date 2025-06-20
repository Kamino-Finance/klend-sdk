import {
  KaminoAction,
  MultiplyObligation,
  PROGRAM_ID,
  getComputeBudgetAndPriorityFeeIxs,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { JLP_MARKET, JLP_MINT, USDC_MINT } from './utils/constants';
import { getMarket } from './utils/helpers';
import Decimal from 'decimal.js';
import { sendAndConfirmTx } from './utils/tx';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
// This only works for an existing obligation
(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: JLP_MARKET });

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = await obligationType.toPda(market.getAddress(), wallet.address);
  const obligation = await market.getObligationByAddress(obligationAddress);
  const currentSlot = await c.rpc.getSlot().send();

  const collTokenMintFactor = market.getReserveByMint(collTokenMint)?.getMintFactor() || 0;
  const debtTokenMintFactor = market.getReserveByMint(debtTokenMint)?.getMintFactor() || 0;

  // Deposit some JLP
  const depositAction = await KaminoAction.buildDepositTxns(
    market,
    new Decimal(1).mul(collTokenMintFactor).toString(),
    collTokenMint,
    wallet,
    obligation!,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    currentSlot
  );

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));
  const depositIxs = [
    ...computeIxs,
    ...depositAction.setupIxs,
    ...depositAction.lendingIxs,
    ...depositAction.cleanupIxs,
  ];

  const depositTxHash = await sendAndConfirmTx(c, wallet, depositIxs, [], [], 'deposit');

  console.log('txHash depositColl', depositTxHash);

  // Borrow some USDC
  const borrowAction = await KaminoAction.buildBorrowTxns(
    market,
    new Decimal(1).mul(debtTokenMintFactor).toString(),
    debtTokenMint,
    wallet,
    obligation!,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    currentSlot
  );

  const borrowIxs = [...computeIxs, ...borrowAction.setupIxs, ...borrowAction.lendingIxs, ...borrowAction.cleanupIxs];

  const borrowTxHash = await sendAndConfirmTx(c, wallet, borrowIxs, [], [], 'borrow');

  console.log('txHash borrowDebt', borrowTxHash);

  // Repay debt
  const repayAction = await KaminoAction.buildRepayTxns(
    market,
    new Decimal(1).mul(debtTokenMintFactor).toString(), // U64_MAX for full repay
    debtTokenMint,
    wallet,
    obligation!,
    true,
    undefined,
    currentSlot
  );

  const repayIxs = [...computeIxs, ...repayAction.setupIxs, ...repayAction.lendingIxs, ...repayAction.cleanupIxs];

  const repayTxHash = await sendAndConfirmTx(c, wallet, repayIxs, [], [], 'repay');

  console.log('txHash repayDebt', repayTxHash);

  // Repay debt
  const withdrawAction = await KaminoAction.buildWithdrawTxns(
    market,
    new Decimal(1).mul(collTokenMintFactor).toString(), // U64_MAX for full withdraw
    collTokenMint,
    wallet,
    obligation!,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    currentSlot
  );

  const withdrawIxs = [
    ...computeIxs,
    ...withdrawAction.setupIxs,
    ...withdrawAction.lendingIxs,
    ...withdrawAction.cleanupIxs,
  ];

  const withdrawTxHash = await sendAndConfirmTx(c, wallet, withdrawIxs, [], [], 'withdraw');

  console.log('txHash withdrawColl', withdrawTxHash);
})().catch(async (e) => {
  console.error(e);
});
