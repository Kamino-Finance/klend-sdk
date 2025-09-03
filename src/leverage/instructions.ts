import { Address, Option, TransactionSigner } from '@solana/kit';
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
import BN from 'bn.js';
import { SYSVAR_INSTRUCTIONS_ADDRESS } from '@solana/sysvars';

export const getFlashLoanInstructions = (args: {
  borrowIxIndex: number;
  userTransferAuthority: TransactionSigner;
  lendingMarketAuthority: Address;
  lendingMarketAddress: Address;
  reserve: KaminoReserve;
  amountLamports: Decimal;
  destinationAta: Address;
  referrerAccount: Option<Address>;
  referrerTokenState: Option<Address>;
  programId: Address;
}) => {
  const flashBorrowIx = getBorrowFlashLoanInstruction({
    userTransferAuthority: args.userTransferAuthority,
    lendingMarketAuthority: args.lendingMarketAuthority,
    lendingMarketAddress: args.lendingMarketAddress,
    reserve: args.reserve,
    amountLamports: args.amountLamports,
    destinationAta: args.destinationAta,
    referrerAccount: args.referrerAccount,
    referrerTokenState: args.referrerTokenState,
    programId: args.programId,
  });
  const flashRepayIx = getRepayFlashLoanInstruction({
    borrowIxIndex: args.borrowIxIndex,
    userTransferAuthority: args.userTransferAuthority,
    lendingMarketAuthority: args.lendingMarketAuthority,
    lendingMarketAddress: args.lendingMarketAddress,
    reserve: args.reserve,
    amountLamports: args.amountLamports,
    userSourceLiquidity: args.destinationAta,
    referrerAccount: args.referrerAccount,
    referrerTokenState: args.referrerTokenState,
    programId: args.programId,
  });

  return { flashBorrowIx, flashRepayIx };
};

export const getBorrowFlashLoanInstruction = ({
  userTransferAuthority,
  lendingMarketAuthority,
  lendingMarketAddress,
  reserve,
  amountLamports,
  destinationAta,
  referrerAccount,
  referrerTokenState,
  programId,
}: {
  userTransferAuthority: TransactionSigner;
  lendingMarketAuthority: Address;
  lendingMarketAddress: Address;
  reserve: KaminoReserve;
  amountLamports: Decimal;
  destinationAta: Address;
  referrerAccount: Option<Address>;
  referrerTokenState: Option<Address>;
  programId: Address;
}) => {
  const args: FlashBorrowReserveLiquidityArgs = {
    liquidityAmount: new BN(amountLamports.floor().toString()),
  };
  const accounts: FlashBorrowReserveLiquidityAccounts = {
    userTransferAuthority,
    lendingMarketAuthority,
    lendingMarket: lendingMarketAddress,
    reserve: reserve.address,
    reserveLiquidityMint: reserve.getLiquidityMint(),
    reserveSourceLiquidity: reserve.state.liquidity.supplyVault,
    userDestinationLiquidity: destinationAta,
    referrerAccount,
    referrerTokenState,
    reserveLiquidityFeeReceiver: reserve.state.liquidity.feeVault,
    sysvarInfo: SYSVAR_INSTRUCTIONS_ADDRESS,
    tokenProgram: reserve.getLiquidityTokenProgram(),
  };

  return flashBorrowReserveLiquidity(args, accounts, undefined, programId);
};

export const getRepayFlashLoanInstruction = ({
  borrowIxIndex,
  userTransferAuthority,
  lendingMarketAuthority,
  lendingMarketAddress,
  reserve,
  amountLamports,
  userSourceLiquidity,
  referrerAccount,
  referrerTokenState,
  programId,
}: {
  borrowIxIndex: number;
  userTransferAuthority: TransactionSigner;
  lendingMarketAuthority: Address;
  lendingMarketAddress: Address;
  reserve: KaminoReserve;
  amountLamports: Decimal;
  userSourceLiquidity: Address;
  referrerAccount: Option<Address>;
  referrerTokenState: Option<Address>;
  programId: Address;
}) => {
  const args: FlashRepayReserveLiquidityArgs = {
    borrowInstructionIndex: borrowIxIndex,
    liquidityAmount: new BN(amountLamports.floor().toString()),
  };

  const accounts: FlashRepayReserveLiquidityAccounts = {
    userTransferAuthority,
    lendingMarketAuthority: lendingMarketAuthority,
    lendingMarket: lendingMarketAddress,
    reserve: reserve.address,
    reserveLiquidityMint: reserve.getLiquidityMint(),
    reserveDestinationLiquidity: reserve.state.liquidity.supplyVault,
    userSourceLiquidity: userSourceLiquidity,
    referrerAccount: referrerAccount,
    referrerTokenState: referrerTokenState,
    reserveLiquidityFeeReceiver: reserve.state.liquidity.feeVault,
    sysvarInfo: SYSVAR_INSTRUCTIONS_ADDRESS,
    tokenProgram: reserve.getLiquidityTokenProgram(),
  };

  return flashRepayReserveLiquidity(args, accounts, undefined, programId);
};
