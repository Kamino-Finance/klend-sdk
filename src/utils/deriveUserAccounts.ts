import { Address } from '@solana/kit';
import { getAssociatedTokenAddress } from './ata';
import { userMetadataPda, referrerTokenStatePda, obligationFarmStatePda } from './seeds';
import { DEFAULT_PUBLIC_KEY, isNotNullPubkey } from './pubkey';
import { VanillaObligation, MultiplyObligation, LeverageObligation, LendingObligation } from './ObligationType';

export type DeriveReserveInfo = {
  address: Address;
  mint: Address;
  cTokenMint: Address;
  farmCollateral: Address;
  farmDebt: Address;
};

type MintPair = { coll: Address; debt: Address; obligationPda?: Address };

export type DeriveUserAccountsParams = {
  wallet: Address;
  /** KLend-specific context. Omit if tx doesn't touch KLend. */
  klend?: {
    market: Address;
    programId: Address;
    reservesInfo: DeriveReserveInfo[];
    multiplyMints?: MintPair[];
    leverageMints?: MintPair[];
    referrer?: Address;
  };
  /**
   * Extra mints to derive ATAs for — strategy shares, vault shares, swap tokens,
   * or any other token the user holds. These generate user ATAs automatically.
   */
  additionalMints?: Address[];
};

/**
 * Deterministically derives all user-specific accounts for a Kamino transaction.
 * Pass the result as `userAccounts` to POST /luts/find-minimal.
 * Over-deriving is safe — the API only uses userAccounts to filter uncovered addresses.
 */
export async function deriveUserAccounts(params: DeriveUserAccountsParams): Promise<Address[]> {
  const { wallet, klend, additionalMints = [] } = params;

  // Run additional ATAs and klend derivation in parallel
  const [additionalAtas, klendAddresses] = await Promise.all([
    Promise.all(additionalMints.map((mint) => getAssociatedTokenAddress(mint, wallet))),
    klend ? deriveKlendUserAccounts(klend, wallet) : Promise.resolve([]),
  ]);

  const addresses = new Set<Address>([wallet, ...additionalAtas, ...klendAddresses]);

  return [...addresses];
}

async function deriveKlendUserAccounts(
  klend: NonNullable<DeriveUserAccountsParams['klend']>,
  wallet: Address
): Promise<Address[]> {
  const { market, programId, reservesInfo, multiplyMints = [], leverageMints = [], referrer } = klend;

  // User metadata + vanilla obligation in parallel
  const [[userMetadata], vanillaObligationPda] = await Promise.all([
    userMetadataPda(wallet, programId),
    new VanillaObligation(programId).toPda(market, wallet),
  ]);

  // Per-reserve: all derivations in a single Promise.all
  const reservePromises = reservesInfo.map(async (reserve) => {
    const promises: Promise<Address>[] = [
      getAssociatedTokenAddress(reserve.mint, wallet),
      getAssociatedTokenAddress(reserve.cTokenMint, wallet),
      new LendingObligation(reserve.mint, programId).toPda(market, wallet),
    ];

    if (isNotNullPubkey(reserve.farmCollateral)) {
      promises.push(obligationFarmStatePda(reserve.farmCollateral, vanillaObligationPda));
    }
    if (isNotNullPubkey(reserve.farmDebt)) {
      promises.push(obligationFarmStatePda(reserve.farmDebt, vanillaObligationPda));
    }
    if (referrer && referrer !== DEFAULT_PUBLIC_KEY) {
      promises.push(referrerTokenStatePda(referrer, reserve.address, programId));
    }

    return Promise.all(promises);
  });

  // Shared helper for multiply/leverage — same structure, different obligation type
  const deriveObligationWithFarms = async (
    ObligationType: typeof MultiplyObligation | typeof LeverageObligation,
    coll: Address,
    debt: Address,
    precomputedPda?: Address
  ): Promise<Address[]> => {
    const obligationPda = precomputedPda ?? (await new ObligationType(coll, debt, programId).toPda(market, wallet));

    const collReserve = reservesInfo.find((r) => r.mint === coll);
    const debtReserve = reservesInfo.find((r) => r.mint === debt);

    const farmPromises: Promise<Address>[] = [];
    if (collReserve && isNotNullPubkey(collReserve.farmCollateral)) {
      farmPromises.push(obligationFarmStatePda(collReserve.farmCollateral, obligationPda));
    }
    if (debtReserve && isNotNullPubkey(debtReserve.farmDebt)) {
      farmPromises.push(obligationFarmStatePda(debtReserve.farmDebt, obligationPda));
    }

    return [obligationPda, ...(await Promise.all(farmPromises))];
  };

  const multiplyPromises = multiplyMints.map(({ coll, debt, obligationPda }) =>
    deriveObligationWithFarms(MultiplyObligation, coll, debt, obligationPda)
  );
  const leveragePromises = leverageMints.map(({ coll, debt, obligationPda }) =>
    deriveObligationWithFarms(LeverageObligation, coll, debt, obligationPda)
  );

  const allResults = await Promise.all([...reservePromises, ...multiplyPromises, ...leveragePromises]);

  return [userMetadata, vanillaObligationPda, ...allResults.flat()];
}
