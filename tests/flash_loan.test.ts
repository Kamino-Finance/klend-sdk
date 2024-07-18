import { SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from '@solana/web3.js';
import { flashBorrowReserveLiquidity, flashRepayReserveLiquidity, PROGRAM_ID } from '../src';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from 'bn.js';
import { buildAndSendTxnWithLogs, buildVersionedTransaction } from '../src/utils';
import { createMarketWithLoan } from './setup_utils';
import { createAta } from './token_utils';
import { sleep } from '@hubbleprotocol/farms-sdk';

describe('flash loan', () => {
  it('empty_flash_loan', async () => {
    const { kaminoMarket, env } = await createMarketWithLoan(new BN(100), new BN(0));
    const payer = env.admin;

    const reserve = kaminoMarket.getReserveBySymbol('USDH');

    if (!reserve) {
      throw "can't find reserve!";
    }
    const [, usdhAta] = await createAta(env, payer.publicKey, reserve.getLiquidityMint());
    await sleep(2000);

    const ixns: TransactionInstruction[] = [];

    ixns.push(
      flashBorrowReserveLiquidity(
        {
          liquidityAmount: new BN('10'),
        },
        {
          userTransferAuthority: payer.publicKey,
          lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
          lendingMarket: kaminoMarket.getAddress(),
          reserve: reserve.address,
          reserveLiquidityMint: reserve.getLiquidityMint(),
          reserveSourceLiquidity: reserve.state.liquidity.supplyVault,
          userDestinationLiquidity: usdhAta,
          referrerAccount: PROGRAM_ID,
          referrerTokenState: PROGRAM_ID, // TODO: Replace with referrer account logic
          reserveLiquidityFeeReceiver: reserve.state.liquidity.feeVault,
          sysvarInfo: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        }
      ),
      flashRepayReserveLiquidity(
        {
          liquidityAmount: new BN('10'),
          borrowInstructionIndex: ixns.length,
        },
        {
          userTransferAuthority: payer.publicKey,
          lendingMarketAuthority: kaminoMarket.getLendingMarketAuthority(),
          lendingMarket: kaminoMarket.getAddress(),
          reserve: reserve.address,
          reserveLiquidityMint: reserve.getLiquidityMint(),
          reserveDestinationLiquidity: reserve.state.liquidity.supplyVault,
          userSourceLiquidity: usdhAta,
          referrerAccount: PROGRAM_ID,
          referrerTokenState: PROGRAM_ID, // TODO: Replace with referrer account logic
          reserveLiquidityFeeReceiver: reserve.state.liquidity.feeVault,
          sysvarInfo: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        }
      )
    );

    const tx = await buildVersionedTransaction(env.provider.connection, payer.publicKey, ixns);
    const txHash = await buildAndSendTxnWithLogs(kaminoMarket.getConnection(), tx, payer, []);
    console.log(txHash);
  });
});
