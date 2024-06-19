import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import { KaminoReserve } from '../classes';
import {
  FlashBorrowReserveLiquidityArgs,
  FlashBorrowReserveLiquidityAccounts,
  flashBorrowReserveLiquidity,
  FlashRepayReserveLiquidityArgs,
  FlashRepayReserveLiquidityAccounts,
  flashRepayReserveLiquidity,
} from '../lib';
import Decimal from 'decimal.js';
import * as anchor from '@coral-xyz/anchor';

export const SOL_MINTS: Array<PublicKey> = [
  new PublicKey('So11111111111111111111111111111111111111111'),
  new PublicKey('So11111111111111111111111111111111111111112'),
];

export const getFlashLoanInstructions = (args: {
  borrowIxnIndex: number;
  walletPublicKey: PublicKey;
  lendingMarketAuthority: PublicKey;
  lendingMarketAddress: PublicKey;
  reserve: KaminoReserve;
  amountLamports: Decimal;
  destinationAta: PublicKey;
  referrerAccount: PublicKey;
  referrerTokenState: PublicKey;
  programId: PublicKey;
}) => {
  const flashBorrowIxn = getBorrowFlashLoanInstruction({
    walletPublicKey: args.walletPublicKey,
    lendingMarketAuthority: args.lendingMarketAuthority,
    lendingMarketAddress: args.lendingMarketAddress,
    reserve: args.reserve,
    amountLamports: args.amountLamports,
    destinationAta: args.destinationAta,
    referrerAccount: args.referrerAccount,
    referrerTokenState: args.referrerTokenState,
    programId: args.programId,
  });
  const flashRepayIxn = getRepayFlashLoanInstruction({
    borrowIxnIndex: args.borrowIxnIndex,
    walletPublicKey: args.walletPublicKey,
    lendingMarketAuthority: args.lendingMarketAuthority,
    lendingMarketAddress: args.lendingMarketAddress,
    reserve: args.reserve,
    amountLamports: args.amountLamports,
    userSourceLiquidity: args.destinationAta,
    referrerAccount: args.referrerAccount,
    referrerTokenState: args.referrerTokenState,
    programId: args.programId,
  });

  return { flashBorrowIxn, flashRepayIxn };
};

export const getBorrowFlashLoanInstruction = ({
  walletPublicKey,
  lendingMarketAuthority,
  lendingMarketAddress,
  reserve,
  amountLamports,
  destinationAta,
  referrerAccount,
  referrerTokenState,
  programId,
}: {
  walletPublicKey: PublicKey;
  lendingMarketAuthority: PublicKey;
  lendingMarketAddress: PublicKey;
  reserve: KaminoReserve;
  amountLamports: Decimal;
  destinationAta: PublicKey;
  referrerAccount: PublicKey;
  referrerTokenState: PublicKey;
  programId: PublicKey;
}) => {
  const args: FlashBorrowReserveLiquidityArgs = {
    liquidityAmount: new anchor.BN(amountLamports.floor().toString()),
  };
  const accounts: FlashBorrowReserveLiquidityAccounts = {
    userTransferAuthority: walletPublicKey,
    lendingMarketAuthority: lendingMarketAuthority,
    lendingMarket: lendingMarketAddress,
    reserve: reserve.address,
    reserveLiquidityMint: reserve.getLiquidityMint(),
    reserveSourceLiquidity: reserve.state.liquidity.supplyVault,
    userDestinationLiquidity: destinationAta,
    referrerAccount: referrerAccount,
    referrerTokenState: referrerTokenState,
    reserveLiquidityFeeReceiver: reserve.state.liquidity.feeVault,
    sysvarInfo: SYSVAR_INSTRUCTIONS_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  return flashBorrowReserveLiquidity(args, accounts, programId);
};

export const getRepayFlashLoanInstruction = ({
  borrowIxnIndex,
  walletPublicKey,
  lendingMarketAuthority,
  lendingMarketAddress,
  reserve,
  amountLamports,
  userSourceLiquidity,
  referrerAccount,
  referrerTokenState,
  programId,
}: {
  borrowIxnIndex: number;
  walletPublicKey: PublicKey;
  lendingMarketAuthority: PublicKey;
  lendingMarketAddress: PublicKey;
  reserve: KaminoReserve;
  amountLamports: Decimal;
  userSourceLiquidity: PublicKey;
  referrerAccount: PublicKey;
  referrerTokenState: PublicKey;
  programId: PublicKey;
}) => {
  const args: FlashRepayReserveLiquidityArgs = {
    borrowInstructionIndex: borrowIxnIndex,
    liquidityAmount: new anchor.BN(amountLamports.floor().toString()),
  };

  const accounts: FlashRepayReserveLiquidityAccounts = {
    userTransferAuthority: walletPublicKey,
    lendingMarketAuthority: lendingMarketAuthority,
    lendingMarket: lendingMarketAddress,
    reserve: reserve.address,
    reserveLiquidityMint: reserve.getLiquidityMint(),
    reserveDestinationLiquidity: reserve.state.liquidity.supplyVault,
    userSourceLiquidity: userSourceLiquidity,
    referrerAccount: referrerAccount,
    referrerTokenState: referrerTokenState,
    reserveLiquidityFeeReceiver: reserve.state.liquidity.feeVault,
    sysvarInfo: SYSVAR_INSTRUCTIONS_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  return flashRepayReserveLiquidity(args, accounts, programId);
};
