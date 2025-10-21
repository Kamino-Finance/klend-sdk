import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoManager,
  MarketWithAddress,
  PROGRAM_ID,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { getMarket } from '../utils/helpers';
import { generateKeyPairSigner } from '@solana/kit';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const initialAdmin = await getKeypair();
  const newOwner = await generateKeyPairSigner();

  const market = await generateKeyPairSigner(); // the market to change the admin of
  const marketState = await getMarket({ rpc: c.rpc, marketPubkey: market.address });
  let marketWithAddress: MarketWithAddress = {
    address: market.address,
    state: marketState.state,
  };

  const kaminoManager = new KaminoManager(c.rpc, DEFAULT_RECENT_SLOT_DURATION_MS, PROGRAM_ID);

  // tx1: set the pending admin field to the new admin
  const ix1 = kaminoManager.updatePendingLendingMarketAdminIx(initialAdmin, marketWithAddress, newOwner.address);
  await sendAndConfirmTx(c, initialAdmin, ix1, [], [], 'updatePendingLendingMarketAdmin');

  const updatedMarketState = await getMarket({ rpc: c.rpc, marketPubkey: market.address });
  marketWithAddress.state = updatedMarketState.state;

  // tx2: update the market admin to the new admin
  const ix2 = kaminoManager.updateLendingMarketOwnerIxs(marketWithAddress, newOwner);
  await sendAndConfirmTx(c, newOwner, [ix2], [], [], 'updateLendingMarketOwner');
})().catch(async (e) => {
  console.error(e);
});
