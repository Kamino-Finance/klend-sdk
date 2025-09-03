import { Address, Instruction, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import { KaminoMarket } from '../classes';
import { DEFAULT_PUBLIC_KEY, referrerStatePda, referrerTokenStatePda, shortUrlPda, userMetadataPda } from '../utils';
import {
  PROGRAM_ID,
  ReferrerState,
  deleteReferrerStateAndShortUrl,
  initReferrerStateAndShortUrl,
  initReferrerTokenState,
} from '../lib';
import { SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';

export const getInitAllReferrerTokenStateIxs = async ({
  payer,
  kaminoMarket,
  referrer = payer.address,
}: {
  payer: TransactionSigner;
  kaminoMarket: KaminoMarket;
  referrer?: Address;
}) => {
  if (referrer === DEFAULT_PUBLIC_KEY) {
    throw new Error('Referrer not set');
  }

  await kaminoMarket.loadReserves();

  const initReferrerTokenStateIxs: Instruction[] = [];

  const tokenStatesToCreate: [Address, Address][] = [];
  const reserves = kaminoMarket.getReserves();
  const referrerTokenStates = await Promise.all(
    reserves.map(async (reserve) => {
      return await referrerTokenStatePda(referrer, reserve.address, kaminoMarket.programId);
    })
  );
  const uniqueReferrerTokenStates = [...new Set<Address>(referrerTokenStates)];
  const accounts = await kaminoMarket.getRpc().getMultipleAccounts(uniqueReferrerTokenStates).send();
  for (let i = 0; i < uniqueReferrerTokenStates.length; i++) {
    if (accounts.value[i] !== null) {
      tokenStatesToCreate.push([uniqueReferrerTokenStates[i], reserves[i].address]);
    }
  }

  tokenStatesToCreate.forEach(([referrerTokenStateAddress, reserveAddress]) => {
    const initReferrerTokenStateIx = initReferrerTokenState(
      {
        lendingMarket: kaminoMarket.getAddress(),
        payer,
        reserve: reserveAddress,
        referrer,
        referrerTokenState: referrerTokenStateAddress,
        rent: SYSVAR_RENT_ADDRESS,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
      },
      undefined,
      kaminoMarket.programId
    );

    initReferrerTokenStateIxs.push(initReferrerTokenStateIx);
  });

  return initReferrerTokenStateIxs;
};

export const getInitReferrerStateAndShortUrlIxs = async ({
  referrer,
  shortUrl,
  programId = PROGRAM_ID,
}: {
  referrer: TransactionSigner;
  shortUrl: string;
  programId: Address;
}) => {
  const [[referrerState], referrerShortUrl, [referrerUserMetadata]] = await Promise.all([
    referrerStatePda(referrer.address, programId),
    shortUrlPda(shortUrl, programId),
    userMetadataPda(referrer.address, programId),
  ]);

  const initReferrerStateAndShortUrlIx = initReferrerStateAndShortUrl(
    {
      shortUrl: shortUrl,
    },
    {
      referrer: referrer,
      referrerState,
      referrerShortUrl,
      referrerUserMetadata,
      rent: SYSVAR_RENT_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
    },
    undefined,
    programId
  );

  return initReferrerStateAndShortUrlIx;
};

// TODO: 1 thing left before adding program id
export const getDeleteReferrerStateAndShortUrlIxs = async ({
  referrer,
  rpc,
  programId = PROGRAM_ID,
}: {
  referrer: TransactionSigner;
  rpc: Rpc<SolanaRpcApi>;
  programId: Address;
}): Promise<Instruction> => {
  const [referrerStateAddress] = await referrerStatePda(referrer.address, programId);
  const referrerState = await ReferrerState.fetch(rpc, referrerStateAddress, programId);

  return deleteReferrerStateAndShortUrl(
    {
      referrer: referrer,
      referrerState: referrerStateAddress,
      shortUrl: referrerState!.shortUrl,
      rent: SYSVAR_RENT_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
    },
    undefined,
    programId
  );
};
