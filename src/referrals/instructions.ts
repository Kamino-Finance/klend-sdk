import { PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, TransactionInstruction, Connection } from '@solana/web3.js';
import { KaminoMarket } from '../classes';
import { checkIfAccountExists, referrerStatePda, referrerTokenStatePda, shortUrlPda, userMetadataPda } from '../utils';
import {
  PROGRAM_ID,
  ReferrerState,
  deleteReferrerStateAndShortUrl,
  initReferrerStateAndShortUrl,
  initReferrerTokenState,
} from '../lib';

export const getInitAllReferrerTokenStateIxns = async ({
  referrer,
  kaminoMarket,
}: {
  referrer: PublicKey;
  kaminoMarket: KaminoMarket;
}) => {
  if (referrer.equals(PublicKey.default)) {
    throw new Error('Referrer not set');
  }

  await kaminoMarket.loadReserves();

  const initReferrerTokenStateIxns: TransactionInstruction[] = [];

  const tokenStatesToCreate: [PublicKey, PublicKey][] = [];
  for (const reserve of kaminoMarket.reserves.values()) {
    const referrerTokenStateAddress = referrerTokenStatePda(referrer, reserve.address, kaminoMarket.programId)[0];

    if (!(await checkIfAccountExists(kaminoMarket.getConnection(), referrerTokenStateAddress))) {
      tokenStatesToCreate.push([referrerTokenStateAddress, reserve?.address]);
    }
  }

  tokenStatesToCreate.forEach(([referrerTokenStateAddress, reserveAddress]) => {
    const initReferrerTokenStateIx = initReferrerTokenState(
      {
        referrer: referrer,
      },
      {
        lendingMarket: kaminoMarket.getAddress(),
        payer: referrer,
        reserve: reserveAddress,
        referrerTokenState: referrerTokenStateAddress,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      }
    );

    initReferrerTokenStateIxns.push(initReferrerTokenStateIx);
  });

  return initReferrerTokenStateIxns;
};

export const getInitReferrerStateAndShortUrlIxns = ({
  referrer,
  shortUrl,
  programId = PROGRAM_ID,
}: {
  referrer: PublicKey;
  shortUrl: string;
  programId: PublicKey;
}) => {
  const [referrerStateAddress] = referrerStatePda(referrer, programId);
  const [shortUrlAddress] = shortUrlPda(shortUrl, programId);

  const referrerUserMetadataAddress = userMetadataPda(referrer, programId)[0];

  const initReferrerStateAndShortUrlIx = initReferrerStateAndShortUrl(
    {
      shortUrl: shortUrl,
    },
    {
      referrer: referrer,
      referrerState: referrerStateAddress,
      referrerShortUrl: shortUrlAddress,
      referrerUserMetadata: referrerUserMetadataAddress,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
    },
    programId
  );

  return initReferrerStateAndShortUrlIx;
};

// TODO: 1 thing left before adding program id
export const getDeleteReferrerStateAndShortUrlIxns = async ({
  referrer,
  connection,
  programId = PROGRAM_ID,
}: {
  referrer: PublicKey;
  connection: Connection;
  programId: PublicKey;
}) => {
  const [referrerStateAddress] = referrerStatePda(referrer, programId);
  const referrerState = await ReferrerState.fetch(connection, referrerStateAddress, programId);

  const initReferrerStateAndShortUrlIx = deleteReferrerStateAndShortUrl(
    {
      referrer: referrer,
      referrerState: referrerStateAddress,
      shortUrl: referrerState!.shortUrl,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
    },
    programId
  );

  return initReferrerStateAndShortUrlIx;
};
