import {
  PublicKey,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Connection,
  GetProgramAccountsFilter,
} from '@solana/web3.js';
import { KaminoMarket, KaminoObligation } from '../classes';
import {
  LeverageObligation,
  MultiplyObligation,
  WRAPPED_SOL_MINT,
  createLookupTableIx,
  extendLookupTableIxs,
  getAssociatedTokenAddress,
  initUserMetadata,
  referrerTokenStatePda,
  userMetadataPda,
  isNotNullPubkey,
  UserMetadata,
  PublicKeySet,
} from '../lib';
import { farmsId } from '@hubbleprotocol/farms-sdk';
import { KaminoReserve } from '../classes/reserve';

export type KaminoUserMetadata = {
  address: PublicKey;
  state: UserMetadata;
};

export const getUserLutAddressAndSetupIxns = async (
  kaminoMarket: KaminoMarket,
  user: PublicKey,
  referrer: PublicKey = PublicKey.default,
  withExtendLut: boolean = true,
  multiplyMints: { coll: PublicKey; debt: PublicKey }[] = [],
  leverageMints: { coll: PublicKey; debt: PublicKey }[] = [],
  repayWithCollObligation: KaminoObligation | undefined = undefined,
  payer: PublicKey = PublicKey.default
): Promise<[PublicKey, TransactionInstruction[][]]> => {
  const [userMetadataAddress, userMetadataState] = await kaminoMarket.getUserMetadata(user);
  const initUserMetadataIxs: TransactionInstruction[] = [];
  let userLookupTableAddress: PublicKey;

  const referrerUserMetadata = referrer.equals(PublicKey.default)
    ? kaminoMarket.programId
    : (await kaminoMarket.getUserMetadata(referrer))[0];

  if (!userMetadataState) {
    const [createLutIx, lookupTableAddress] = await createLookupTableIx(kaminoMarket.getConnection(), user);
    userLookupTableAddress = lookupTableAddress;
    initUserMetadataIxs.push(createLutIx);
    initUserMetadataIxs.push(
      initUserMetadata(
        {
          userLookupTable: lookupTableAddress,
        },
        {
          owner: user,
          feePayer: payer.equals(PublicKey.default) ? user : payer,
          userMetadata: userMetadataAddress,
          referrerUserMetadata: referrerUserMetadata,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        },
        kaminoMarket.programId
      )
    );
  } else {
    userLookupTableAddress = userMetadataState.userLookupTable;
  }

  const setupUserMetadataIxs = [initUserMetadataIxs];

  if (withExtendLut) {
    const dedupUserLutAddresses = await getDedupUserLookupTableAddresses(
      kaminoMarket,
      userLookupTableAddress,
      user,
      referrer,
      multiplyMints,
      leverageMints,
      userMetadataState !== null,
      repayWithCollObligation
    );

    const extendLookupTableChunkIxs = extendLookupTableIxs(user, userLookupTableAddress, dedupUserLutAddresses, payer);

    for (const extendLutIx of extendLookupTableChunkIxs) {
      setupUserMetadataIxs.push([extendLutIx]);
    }
  }

  return [userLookupTableAddress, setupUserMetadataIxs];
};

const getDedupUserLookupTableAddresses = async (
  kaminoMarket: KaminoMarket,
  table_pk: PublicKey,
  user: PublicKey,
  referrer: PublicKey,
  multiplyMints: { coll: PublicKey; debt: PublicKey }[] = [],
  leverageMints: { coll: PublicKey; debt: PublicKey }[] = [],
  tableExists: boolean,
  repayWithCollObligation: KaminoObligation | undefined = undefined
): Promise<PublicKey[]> => {
  const requiredAddresses = await getUserLookupTableAddresses(
    kaminoMarket,
    user,
    referrer,
    multiplyMints,
    leverageMints,
    repayWithCollObligation
  );

  if (tableExists) {
    const userLookupTable = (await kaminoMarket.getConnection().getAddressLookupTable(table_pk)).value?.state!;
    const addressesAndLogsNotInLut = requiredAddresses.filter(
      (addressAndLogs) => userLookupTable.addresses.filter((a) => a.equals(addressAndLogs.address)).length === 0
    );
    console.log('Addresses to be added in LUT:');
    const addressNotInLut = addressesAndLogsNotInLut.map((addressAndLogs) => {
      console.log(addressAndLogs.log);
      return addressAndLogs.address;
    });
    return new PublicKeySet(addressNotInLut).toArray();
  } else {
    const addressNotInLut = requiredAddresses.map((addressAndLogs) => {
      console.log(addressAndLogs.log);
      return addressAndLogs.address;
    });
    return new PublicKeySet(addressNotInLut).toArray();
  }
};

const getUserLookupTableAddresses = async (
  kaminoMarket: KaminoMarket,
  user: PublicKey,
  referrer: PublicKey,
  multiplyMints: { coll: PublicKey; debt: PublicKey }[] = [],
  leverageMints: { coll: PublicKey; debt: PublicKey }[] = [],
  repayWithCollObligation: KaminoObligation | undefined = undefined
): Promise<{ address: PublicKey; log: string }[]> => {
  const addresses: { address: PublicKey; log: string }[] = [];
  addresses.push({ address: user, log: 'user address' });
  const [userMetadataAddress] = userMetadataPda(user, kaminoMarket.programId);
  addresses.push({ address: userMetadataAddress, log: 'userMetadata address' });

  const allMints: PublicKey[] = [];
  multiplyMints.forEach(({ coll: collMint, debt: debtMint }) => {
    allMints.push(collMint);
    allMints.push(debtMint);
  });
  leverageMints.forEach(({ coll: collMint, debt: debtMint }) => {
    allMints.push(collMint);
    allMints.push(debtMint);
  });

  if (repayWithCollObligation) {
    repayWithCollObligation.borrows.forEach((borrow) => {
      allMints.push(borrow.mintAddress);
    });

    repayWithCollObligation.deposits.forEach((deposit) => {
      allMints.push(deposit.mintAddress);
    });
  }

  const dedupMints = [...new PublicKeySet(allMints).toArray()];
  const reserves: KaminoReserve[] = [];
  dedupMints.forEach((mint) => {
    const kaminoReserve = kaminoMarket.getReserveByMint(mint);
    if (kaminoReserve) {
      reserves.push(kaminoReserve);
    }
  });

  // reserve mint ATAs
  const mintsAtas: { address: PublicKey; log: string }[] = await Promise.all(
    dedupMints.map(async (mint) => {
      return { address: await getAssociatedTokenAddress(mint, user), log: 'ata for mint ' + mint.toString() };
    })
  );
  addresses.push(...mintsAtas);
  // ctoken ATAs
  const ctokenMintsAtas: { address: PublicKey; log: string }[] = await Promise.all(
    reserves.map(async (reserve) => {
      const ctokenMint = reserve.getCTokenMint();
      return {
        address: await getAssociatedTokenAddress(ctokenMint, user),
        log: 'ctoken ata for reserve ' + reserve.address.toString(),
      };
    })
  );
  addresses.push(...ctokenMintsAtas);
  // farm states
  const farmCollateralStates: PublicKey[] = reserves.map((reserve) => reserve.state.farmCollateral);
  const farmDebtStates: PublicKey[] = reserves.map((reserve) => reserve.state.farmDebt);
  const farmStates = new PublicKeySet(
    farmCollateralStates.concat(farmDebtStates).filter((address) => isNotNullPubkey(address))
  );
  const farmStatesAdressesAndLogs = farmStates.toArray().map((address) => {
    return { address: address, log: 'farm state' };
  });
  addresses.push(...farmStatesAdressesAndLogs);
  // referrer token states
  const referrerTokenStates: { address: PublicKey; log: string }[] = reserves.map((reserve) => {
    return {
      address: referrerTokenStatePda(referrer, reserve.address, kaminoMarket.programId)[0],
      log: 'referrer token state for reserve ' + reserve.address,
    };
  });
  if (!referrer.equals(PublicKey.default)) {
    addresses.push(...referrerTokenStates);
  }

  const [multiplyObligations, multiplyObligationsFarmUserStates] = getMultiplyObligationAndObligationFarmStateAddresses(
    kaminoMarket,
    user,
    multiplyMints
  );

  addresses.push(...multiplyObligations);
  addresses.push(...multiplyObligationsFarmUserStates);

  const [leverageObligations, leverageObligationsFarmUserStates] = getLeverageObligationAndObligationFarmStateAddresses(
    kaminoMarket,
    user,
    leverageMints
  );

  addresses.push(...leverageObligations);
  addresses.push(...leverageObligationsFarmUserStates);

  if (repayWithCollObligation) {
    const repayWithCollFarmUserStates = getRepayWithCollObligationFarmStateAddresses(
      kaminoMarket,
      repayWithCollObligation
    );
    addresses.push(...repayWithCollFarmUserStates);
    addresses.push({ address: repayWithCollObligation.obligationAddress, log: 'repay with coll obligation' });
  }

  return addresses;
};

function getMultiplyObligationAndObligationFarmStateAddresses(
  kaminoMarket: KaminoMarket,
  user: PublicKey,
  mints: { coll: PublicKey; debt: PublicKey }[]
): [{ address: PublicKey; log: string }[], { address: PublicKey; log: string }[]] {
  const obligationPdas: { address: PublicKey; log: string }[] = [];
  const farmUserStates: { address: PublicKey; log: string }[] = [];

  for (const { coll: collMint, debt: debtMint } of mints) {
    const collReserve = kaminoMarket.getReserveByMint(collMint);
    const debtReserve = kaminoMarket.getReserveByMint(debtMint);
    const collMintString = collMint.toString();
    const debtMintString = debtMint.toString();
    if (collReserve && debtReserve) {
      const multiplyObligation = new MultiplyObligation(collMint, WRAPPED_SOL_MINT, kaminoMarket.programId);
      obligationPdas.push({
        address: multiplyObligation.toPda(kaminoMarket.getAddress(), user),
        log: 'multiply obligation coll: ' + collMintString + ' debt: ' + debtMintString,
      });
      if (!collReserve.state.farmCollateral.equals(PublicKey.default)) {
        farmUserStates.push({
          address: getPdaFarmsUserState(
            collReserve.state.farmCollateral!,
            multiplyObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'collReserve farmState for multiply obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
      if (!debtReserve.state.farmDebt.equals(PublicKey.default)) {
        farmUserStates.push({
          address: getPdaFarmsUserState(
            debtReserve.state.farmDebt!,
            multiplyObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'debtReserve farmState for multiply obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
    }
  }

  return [obligationPdas, farmUserStates];
}

function getLeverageObligationAndObligationFarmStateAddresses(
  kaminoMarket: KaminoMarket,
  user: PublicKey,
  mints: { coll: PublicKey; debt: PublicKey }[]
): [{ address: PublicKey; log: string }[], { address: PublicKey; log: string }[]] {
  const obligationPdas: { address: PublicKey; log: string }[] = [];
  const farmUserStates: { address: PublicKey; log: string }[] = [];

  for (const { coll: collMint, debt: debtMint } of mints) {
    const collReserve = kaminoMarket.getReserveByMint(collMint);
    const debtReserve = kaminoMarket.getReserveByMint(debtMint);
    const collMintString = collMint.toString();
    const debtMintString = debtMint.toString();
    if (collReserve && debtReserve) {
      const leverageObligation = new LeverageObligation(collMint, debtMint, kaminoMarket.programId);
      obligationPdas.push({
        address: leverageObligation.toPda(kaminoMarket.getAddress(), user),
        log: 'leverage obligation coll: ' + collMintString + ' debt: ' + debtMintString,
      });
      if (!collReserve.state.farmCollateral.equals(PublicKey.default)) {
        farmUserStates.push({
          address: getPdaFarmsUserState(
            collReserve.state.farmCollateral!,
            leverageObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'collReserve farmState for leverage obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
      if (!debtReserve.state.farmDebt.equals(PublicKey.default)) {
        farmUserStates.push({
          address: getPdaFarmsUserState(
            debtReserve.state.farmDebt!,
            leverageObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'debtReserve farmState for leverage obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
    }
  }

  return [obligationPdas, farmUserStates];
}

function getRepayWithCollObligationFarmStateAddresses(
  kaminoMarket: KaminoMarket,
  obligation: KaminoObligation
): { address: PublicKey; log: string }[] {
  const farmUserStates: { address: PublicKey; log: string }[] = [];
  const obligationString = obligation.obligationAddress.toString();

  obligation.borrows.forEach((borrow) => {
    const borrowReserve = kaminoMarket.getReserveByMint(borrow.mintAddress)!;
    if (!borrowReserve.state.farmDebt.equals(PublicKey.default)) {
      farmUserStates.push({
        address: getPdaFarmsUserState(borrowReserve.state.farmDebt!, obligation.obligationAddress),
        log: 'debtReserve farmState for vanilla obligation: ' + obligationString,
      });
    }
  });

  obligation.deposits.forEach((deposit) => {
    const depositReserve = kaminoMarket.getReserveByMint(deposit.mintAddress)!;
    if (!depositReserve.state.farmCollateral.equals(PublicKey.default)) {
      farmUserStates.push({
        address: getPdaFarmsUserState(depositReserve.state.farmCollateral!, obligation.obligationAddress),
        log: 'collReserve farmState for vanilla obligation' + obligationString,
      });
    }
  });

  return farmUserStates;
}

const BASE_SEED_USER_STATE = Buffer.from('user');

const getPdaFarmsUserState = (farm: PublicKey, obligation: PublicKey) =>
  PublicKey.findProgramAddressSync([BASE_SEED_USER_STATE, farm.toBytes(), obligation.toBytes()], farmsId)[0];

export async function getAllUserMetadatasWithFilter(
  connection: Connection,
  filter: GetProgramAccountsFilter[],
  programId: PublicKey
): Promise<KaminoUserMetadata[]> {
  const filters = [
    {
      dataSize: UserMetadata.layout.span + 8,
    },
    ...filter,
  ];

  const userMetadatas = await connection.getProgramAccounts(programId, {
    filters,
  });

  return userMetadatas.map((userMetadata) => {
    if (userMetadata.account === null) {
      throw new Error('Invalid account');
    }
    if (!userMetadata.account.owner.equals(programId)) {
      throw new Error("account doesn't belong to this program");
    }

    const userMetadataAccount = UserMetadata.decode(userMetadata.account.data);

    if (!userMetadataAccount) {
      throw Error('Could not parse user metadata.');
    }

    return { address: userMetadata.pubkey, state: userMetadataAccount };
  });
}
