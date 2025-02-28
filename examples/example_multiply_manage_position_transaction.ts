import {
  KaminoAction,
  MultiplyObligation,
  PROGRAM_ID,
  buildAndSendTxn,
  getComputeBudgetAndPriorityFeeIxns,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { JLP_MARKET, JLP_MINT, USDC_MINT } from './utils/constants';
import { getMarket } from './utils/helpers';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
// This only works for an existing obligation
(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const market = await getMarket({ connection, marketPubkey: JLP_MARKET });

  const collTokenMint = JLP_MINT;
  const debtTokenMint = USDC_MINT;

  const obligationType = new MultiplyObligation(collTokenMint, debtTokenMint, PROGRAM_ID); // new LeverageObligation(collTokenMint, debtTokenMint, PROGRAM_ID); for leverage
  const obligationAddress = obligationType.toPda(market.getAddress(), wallet.publicKey);
  const obligation = await market.getObligationByAddress(obligationAddress);
  const currentSlot = await connection.getSlot();

  const collTokenMintFactor = market.getReserveByMint(new PublicKey(collTokenMint))?.getMintFactor() || 0;
  const debtTokenMintFactor = market.getReserveByMint(new PublicKey(debtTokenMint))?.getMintFactor() || 0;

  // Deposit some JLP
  const depositAction = await KaminoAction.buildDepositTxns(
    market,
    new Decimal(1).mul(collTokenMintFactor).toString(),
    new PublicKey(collTokenMint),
    wallet.publicKey,
    obligation!,
    true,
    currentSlot
  );

  const computeIxs = getComputeBudgetAndPriorityFeeIxns(1_400_000, new Decimal(500000));
  const depositIxs = [
    ...computeIxs,
    ...depositAction.setupIxs,
    ...depositAction.lendingIxs,
    ...depositAction.cleanupIxs,
  ];

  const depositTxHash = await buildAndSendTxn(connection, wallet, depositIxs, []);

  console.log('txHash depositColl', depositTxHash);

  // Borrow some USDC
  const borrowAction = await KaminoAction.buildBorrowTxns(
    market,
    new Decimal(1).mul(debtTokenMintFactor).toString(),
    new PublicKey(debtTokenMint),
    wallet.publicKey,
    obligation!,
    true,
    currentSlot
  );

  const borrowIxs = [...computeIxs, ...borrowAction.setupIxs, ...borrowAction.lendingIxs, ...borrowAction.cleanupIxs];

  const borrowTxHash = await buildAndSendTxn(connection, wallet, borrowIxs, []);

  console.log('txHash borrowDebt', borrowTxHash);

  // Repay debt
  const repayAction = await KaminoAction.buildRepayTxns(
    market,
    new Decimal(1).mul(debtTokenMintFactor).toString(), // U64_MAX for full repay
    new PublicKey(debtTokenMint),
    wallet.publicKey,
    obligation!,
    true,
    currentSlot
  );

  const repayIxs = [...computeIxs, ...repayAction.setupIxs, ...repayAction.lendingIxs, ...repayAction.cleanupIxs];

  const repayTxHash = await buildAndSendTxn(connection, wallet, repayIxs, []);

  console.log('txHash repayDebt', repayTxHash);

  // Repay debt
  const withdrawAction = await KaminoAction.buildWithdrawTxns(
    market,
    new Decimal(1).mul(collTokenMintFactor).toString(), // U64_MAX for full withdraw
    new PublicKey(collTokenMint),
    wallet.publicKey,
    obligation!,
    true,
    currentSlot
  );

  const withdrawIxs = [
    ...computeIxs,
    ...withdrawAction.setupIxs,
    ...withdrawAction.lendingIxs,
    ...withdrawAction.cleanupIxs,
  ];

  const withdrawTxHash = await buildAndSendTxn(connection, wallet, withdrawIxs, []);

  console.log('txHash withdrawColl', withdrawTxHash);
})().catch(async (e) => {
  console.error(e);
});
