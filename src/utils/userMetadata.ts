import {
  Address,
  Instruction,
  none,
  some,
  Rpc,
  GetProgramAccountsApi,
  GetProgramAccountsMemcmpFilter,
  GetProgramAccountsDatasizeFilter,
  TransactionSigner,
  Option,
  isSome,
} from '@solana/kit';
import { KaminoMarket, KaminoObligation } from '../classes';
import {
  LeverageObligation,
  MultiplyObligation,
  createLookupTableIx,
  extendLookupTableIxs,
  getAssociatedTokenAddress,
  initUserMetadata,
  referrerTokenStatePda,
  userMetadataPda,
  isNotNullPubkey,
  UserMetadata,
  obligationFarmStatePda,
  DEFAULT_PUBLIC_KEY,
} from '../lib';
import { KaminoReserve } from '../classes/reserve';
import { Buffer } from 'buffer';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { fetchAddressLookupTable } from '@solana-program/address-lookup-table';

export type KaminoUserMetadata = {
  address: Address;
  state: UserMetadata;
};

export const getUserLutAddressAndSetupIxs = async (
  kaminoMarket: KaminoMarket,
  user: TransactionSigner,
  referrer: Option<Address> = none(),
  withExtendLut: boolean = true,
  multiplyMints: { coll: Address; debt: Address }[] = [],
  leverageMints: { coll: Address; debt: Address }[] = [],
  repayWithCollObligation: KaminoObligation | undefined = undefined,
  payer: TransactionSigner = user
): Promise<[Address, Instruction[][]]> => {
  const [userMetadataAddress, userMetadataState] = await kaminoMarket.getUserMetadata(user.address);
  const initUserMetadataIxs: Instruction[] = [];
  let userLookupTableAddress: Address;

  if (userMetadataState === null) {
    const referrerUserMetadata: Option<Address> = isSome(referrer)
      ? some((await kaminoMarket.getUserMetadata(referrer.value))[0])
      : none();

    const [createLutIx, lookupTableAddress] = await createLookupTableIx(kaminoMarket.getRpc(), user);
    userLookupTableAddress = lookupTableAddress;
    initUserMetadataIxs.push(createLutIx);
    initUserMetadataIxs.push(
      initUserMetadata(
        {
          userLookupTable: lookupTableAddress,
        },
        {
          owner: user,
          feePayer: payer,
          userMetadata: userMetadataAddress,
          referrerUserMetadata,
          rent: SYSVAR_RENT_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,
        },
        undefined,
        kaminoMarket.programId
      )
    );
  } else {
    userLookupTableAddress = userMetadataState.userLookupTable;
    referrer = userMetadataState.referrer === DEFAULT_PUBLIC_KEY ? none() : some(userMetadataState.referrer);
  }

  const setupUserMetadataIxs = [initUserMetadataIxs];

  if (withExtendLut) {
    const dedupUserLutAddresses = await getDedupUserLookupTableAddresses(
      kaminoMarket,
      userLookupTableAddress,
      user.address,
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
  tableAddress: Address,
  user: Address,
  referrer: Option<Address>,
  multiplyMints: { coll: Address; debt: Address }[] = [],
  leverageMints: { coll: Address; debt: Address }[] = [],
  tableExists: boolean,
  repayWithCollObligation: KaminoObligation | undefined = undefined
): Promise<Address[]> => {
  const requiredAddresses = await getUserLookupTableAddresses(
    kaminoMarket,
    user,
    referrer,
    multiplyMints,
    leverageMints,
    repayWithCollObligation
  );

  if (tableExists) {
    const userLookupTable = (await fetchAddressLookupTable(kaminoMarket.getRpc(), tableAddress)).data;
    const addressesAndLogsNotInLut = requiredAddresses.filter(
      (addressAndLogs) => userLookupTable.addresses.filter((a) => a === addressAndLogs.address).length === 0
    );
    console.log('Addresses to be added in LUT:');
    const addressNotInLut = addressesAndLogsNotInLut.map((addressAndLogs) => {
      console.log(addressAndLogs.log);
      return addressAndLogs.address;
    });
    return [...new Set<Address>(addressNotInLut)];
  } else {
    const addressNotInLut = requiredAddresses.map((addressAndLogs) => {
      console.log(addressAndLogs.log);
      return addressAndLogs.address;
    });
    return [...new Set(addressNotInLut)];
  }
};

const getUserLookupTableAddresses = async (
  kaminoMarket: KaminoMarket,
  user: Address,
  referrer: Option<Address>,
  multiplyMints: { coll: Address; debt: Address }[] = [],
  leverageMints: { coll: Address; debt: Address }[] = [],
  repayWithCollObligation: KaminoObligation | undefined = undefined
): Promise<{ address: Address; log: string }[]> => {
  const addresses: { address: Address; log: string }[] = [];
  addresses.push({ address: user, log: 'user address' });
  const [userMetadataAddress] = await userMetadataPda(user, kaminoMarket.programId);
  addresses.push({ address: userMetadataAddress, log: 'userMetadata address' });

  const allMints: Address[] = [];
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

  const dedupMints = [...new Set(allMints)];
  const reserves: KaminoReserve[] = [];
  dedupMints.forEach((mint) => {
    const kaminoReserve = kaminoMarket.getReserveByMint(mint);
    if (kaminoReserve) {
      reserves.push(kaminoReserve);
    }
  });

  // reserve mint ATAs
  const mintsAtas: { address: Address; log: string }[] = await Promise.all(
    dedupMints.map(async (mint) => {
      return { address: await getAssociatedTokenAddress(mint, user), log: 'ata for mint ' + mint.toString() };
    })
  );
  addresses.push(...mintsAtas);
  // ctoken ATAs
  const ctokenMintsAtas: { address: Address; log: string }[] = await Promise.all(
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
  const farmCollateralStates: Address[] = reserves.map((reserve) => reserve.state.farmCollateral);
  const farmDebtStates: Address[] = reserves.map((reserve) => reserve.state.farmDebt);
  const farmStates = new Set(farmCollateralStates.concat(farmDebtStates).filter((address) => isNotNullPubkey(address)));
  const farmStatesAdressesAndLogs = [...farmStates].map((address) => {
    return { address: address, log: 'farm state' };
  });
  addresses.push(...farmStatesAdressesAndLogs);
  if (isSome(referrer)) {
    // referrer token states
    const referrerTokenStates: { address: Address; log: string }[] = await Promise.all(
      reserves.map(async (reserve) => {
        return {
          address: await referrerTokenStatePda(referrer.value, reserve.address, kaminoMarket.programId),
          log: `referrer token state for reserve ${reserve.address}`,
        };
      })
    );
    addresses.push(...referrerTokenStates);
  }

  const [multiplyObligations, multiplyObligationsFarmUserStates] =
    await getMultiplyObligationAndObligationFarmStateAddresses(kaminoMarket, user, multiplyMints);

  addresses.push(...multiplyObligations);
  addresses.push(...multiplyObligationsFarmUserStates);

  const [leverageObligations, leverageObligationsFarmUserStates] =
    await getLeverageObligationAndObligationFarmStateAddresses(kaminoMarket, user, leverageMints);

  addresses.push(...leverageObligations);
  addresses.push(...leverageObligationsFarmUserStates);

  if (repayWithCollObligation) {
    const repayWithCollFarmUserStates = await getRepayWithCollObligationFarmStateAddresses(
      kaminoMarket,
      repayWithCollObligation
    );
    addresses.push(...repayWithCollFarmUserStates);
    addresses.push({ address: repayWithCollObligation.obligationAddress, log: 'repay with coll obligation' });
  }

  return addresses;
};

async function getMultiplyObligationAndObligationFarmStateAddresses(
  kaminoMarket: KaminoMarket,
  user: Address,
  mints: { coll: Address; debt: Address }[]
): Promise<[{ address: Address; log: string }[], { address: Address; log: string }[]]> {
  const obligationPdas: { address: Address; log: string }[] = [];
  const farmUserStates: { address: Address; log: string }[] = [];

  for (const { coll: collMint, debt: debtMint } of mints) {
    const collReserve = kaminoMarket.getReserveByMint(collMint);
    const debtReserve = kaminoMarket.getReserveByMint(debtMint);
    const collMintString = collMint.toString();
    const debtMintString = debtMint.toString();
    if (collReserve && debtReserve) {
      const multiplyObligation = new MultiplyObligation(collMint, debtMint, kaminoMarket.programId);
      obligationPdas.push({
        address: await multiplyObligation.toPda(kaminoMarket.getAddress(), user),
        log: 'multiply obligation coll: ' + collMintString + ' debt: ' + debtMintString,
      });
      if (collReserve.state.farmCollateral !== DEFAULT_PUBLIC_KEY) {
        farmUserStates.push({
          address: await obligationFarmStatePda(
            collReserve.state.farmCollateral!,
            await multiplyObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'collReserve farmState for multiply obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
      if (debtReserve.state.farmDebt !== DEFAULT_PUBLIC_KEY) {
        farmUserStates.push({
          address: await obligationFarmStatePda(
            debtReserve.state.farmDebt!,
            await multiplyObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'debtReserve farmState for multiply obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
    }
  }

  return [obligationPdas, farmUserStates];
}

async function getLeverageObligationAndObligationFarmStateAddresses(
  kaminoMarket: KaminoMarket,
  user: Address,
  mints: { coll: Address; debt: Address }[]
): Promise<[{ address: Address; log: string }[], { address: Address; log: string }[]]> {
  const obligationPdas: { address: Address; log: string }[] = [];
  const farmUserStates: { address: Address; log: string }[] = [];

  for (const { coll: collMint, debt: debtMint } of mints) {
    const collReserve = kaminoMarket.getReserveByMint(collMint);
    const debtReserve = kaminoMarket.getReserveByMint(debtMint);
    const collMintString = collMint.toString();
    const debtMintString = debtMint.toString();
    if (collReserve && debtReserve) {
      const leverageObligation = new LeverageObligation(collMint, debtMint, kaminoMarket.programId);
      obligationPdas.push({
        address: await leverageObligation.toPda(kaminoMarket.getAddress(), user),
        log: 'leverage obligation coll: ' + collMintString + ' debt: ' + debtMintString,
      });
      if (collReserve.state.farmCollateral !== DEFAULT_PUBLIC_KEY) {
        farmUserStates.push({
          address: await obligationFarmStatePda(
            collReserve.state.farmCollateral!,
            await leverageObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'collReserve farmState for leverage obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
      if (debtReserve.state.farmDebt !== DEFAULT_PUBLIC_KEY) {
        farmUserStates.push({
          address: await obligationFarmStatePda(
            debtReserve.state.farmDebt!,
            await leverageObligation.toPda(kaminoMarket.getAddress(), user)
          ),
          log: 'debtReserve farmState for leverage obligation coll: ' + collMintString + ' debt: ' + debtMintString,
        });
      }
    }
  }

  return [obligationPdas, farmUserStates];
}

async function getRepayWithCollObligationFarmStateAddresses(
  kaminoMarket: KaminoMarket,
  obligation: KaminoObligation
): Promise<{ address: Address; log: string }[]> {
  const farmUserStates: { address: Address; log: string }[] = [];
  const obligationString = obligation.obligationAddress.toString();

  for (const borrow of obligation.getBorrows()) {
    const borrowReserve = kaminoMarket.getReserveByMint(borrow.mintAddress)!;
    if (borrowReserve.state.farmDebt !== DEFAULT_PUBLIC_KEY) {
      farmUserStates.push({
        address: await obligationFarmStatePda(borrowReserve.state.farmDebt!, obligation.obligationAddress),
        log: 'debtReserve farmState for vanilla obligation: ' + obligationString,
      });
    }
  }

  for (const deposit of obligation.getDeposits()) {
    const depositReserve = kaminoMarket.getReserveByMint(deposit.mintAddress)!;
    if (depositReserve.state.farmCollateral !== DEFAULT_PUBLIC_KEY) {
      farmUserStates.push({
        address: await obligationFarmStatePda(depositReserve.state.farmCollateral!, obligation.obligationAddress),
        log: 'collReserve farmState for vanilla obligation' + obligationString,
      });
    }
  }

  return farmUserStates;
}

export async function getAllUserMetadatasWithFilter(
  rpc: Rpc<GetProgramAccountsApi>,
  filter: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[],
  programId: Address
): Promise<KaminoUserMetadata[]> {
  const filters: (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[] = [
    {
      dataSize: BigInt(UserMetadata.layout.span + 8),
    },
    ...filter,
  ];

  const userMetadatas = await rpc
    .getProgramAccounts(programId, {
      filters,
      encoding: 'base64',
    })
    .send();

  return userMetadatas.map((userMetadata) => {
    if (userMetadata.account.owner !== programId) {
      throw new Error("account doesn't belong to this program");
    }

    const userMetadataAccount = UserMetadata.decode(Buffer.from(userMetadata.account.data[0], 'base64'));

    if (!userMetadataAccount) {
      throw Error('Could not parse user metadata.');
    }

    return { address: userMetadata.pubkey, state: userMetadataAccount };
  });
}
