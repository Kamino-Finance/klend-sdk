import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoManager,
  MarketWithAddress,
  PROGRAM_ID,
  buildAndSendTxnWithLogs,
  buildVersionedTransaction,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { getMarket } from './utils/helpers';
import { Keypair } from '@solana/web3.js';

(async () => {
  const connection = getConnection();
  const initialAdmin = getKeypair();
  const newOwner = Keypair.generate();

  const market = Keypair.generate(); // the market to change the admin of
  const marketState = await getMarket({ connection, marketPubkey: market.publicKey });
  let marketWithAddress: MarketWithAddress = {
    address: market.publicKey,
    state: marketState.state,
  };

  const kaminoManager = new KaminoManager(connection, DEFAULT_RECENT_SLOT_DURATION_MS, PROGRAM_ID);

  // tx1: set the pending admin field to the new admin
  const ix1 = kaminoManager.updatePendingLendingMarketAdminIx(marketWithAddress, newOwner.publicKey);
  const tx1 = await buildVersionedTransaction(connection, initialAdmin.publicKey, ix1);
  await buildAndSendTxnWithLogs(connection, tx1, initialAdmin, []);

  const updatedMarketState = await getMarket({ connection, marketPubkey: market.publicKey });
  marketWithAddress.state = updatedMarketState.state;

  // tx2: update the market admin to the new admin
  const ix2 = kaminoManager.updateLendingMarketOwnerIxs(marketWithAddress);
  const tx2 = await buildVersionedTransaction(connection, newOwner.publicKey, [ix2]);
  await buildAndSendTxnWithLogs(connection, tx2, newOwner, []);
})().catch(async (e) => {
  console.error(e);
});
