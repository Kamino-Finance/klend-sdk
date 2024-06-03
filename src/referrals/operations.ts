import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { KaminoMarket } from '../classes';
import {
  PublicKeyMap,
  buildAndSendTxnWithLogs,
  buildVersionedTransaction,
  referrerStatePda,
  shortUrlPda,
} from '../utils';
import {
  getDeleteReferrerStateAndShortUrlIxns,
  getInitAllReferrerTokenStateIxns,
  getInitReferrerStateAndShortUrlIxns,
} from './instructions';
import { PROGRAM_ID, UserMetadata, ReferrerState, ShortUrl } from '../lib';
import Decimal from 'decimal.js';

/**
 * Initialize all referrer token states for a given referrer
 * @param referrer
 * @param kaminoMarket
 */
export const initAllReferrerTokenStates = async ({
  referrer,
  kaminoMarket,
}: {
  referrer: Keypair;
  kaminoMarket: KaminoMarket;
}) => {
  const ixns = await getInitAllReferrerTokenStateIxns({ referrer: referrer.publicKey, kaminoMarket });

  const tx = await buildVersionedTransaction(kaminoMarket.getConnection(), referrer.publicKey, ixns);

  console.log('Init Referral Token States');

  return await buildAndSendTxnWithLogs(kaminoMarket.getConnection(), tx, referrer, [referrer]);
};

/**
 * Initialize referrer state and short url
 * @param connection
 * @param referrer
 * @param shortUrl
 */
export const createReferrerStateAndShortUrl = async ({
  connection,
  referrer,
  shortUrl,
  programId = PROGRAM_ID,
}: {
  connection: Connection;
  referrer: Keypair;
  shortUrl: string;
  programId?: PublicKey;
}) => {
  const ixn = getInitReferrerStateAndShortUrlIxns({ referrer: referrer.publicKey, shortUrl, programId });

  const tx = await buildVersionedTransaction(connection, referrer.publicKey, [ixn]);

  console.log('Init ReferrerState for referrer ' + referrer.publicKey.toBase58() + ' and shortUrl ' + shortUrl);

  return await buildAndSendTxnWithLogs(connection, tx, referrer, [referrer]);
};

/**
 * Initialize referrer state and short url
 * @param connection
 * @param referrer
 * @param newShortUrl
 */
export const updateReferrerStateAndShortUrl = async ({
  connection,
  referrer,
  newShortUrl,
  programId = PROGRAM_ID,
}: {
  connection: Connection;
  referrer: Keypair;
  newShortUrl: string;
  programId?: PublicKey;
}) => {
  const deleteIxn = await getDeleteReferrerStateAndShortUrlIxns({
    referrer: referrer.publicKey,
    connection,
    programId,
  });

  const initIxn = getInitReferrerStateAndShortUrlIxns({
    referrer: referrer.publicKey,
    shortUrl: newShortUrl,
    programId,
  });

  const tx = await buildVersionedTransaction(connection, referrer.publicKey, [deleteIxn, initIxn]);

  console.log('Update ReferrerState for referrer ' + referrer.publicKey.toBase58() + ' and shortUrl ' + newShortUrl);

  return await buildAndSendTxnWithLogs(connection, tx, referrer, [referrer]);
};

/**
 * Check if short URL available - also checks if short URL is valid (ascii-alphanumeric plus '_' '-', max 32 chars)
 * @param connection
 * @param shortUrl
 * @param programId
 */
export async function isShortUrlAvailable(
  connection: Connection,
  shortUrl: string,
  programId: PublicKey = PROGRAM_ID
): Promise<boolean> {
  if (shortUrl.length > 32) {
    return false;
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(shortUrl)) {
    return false;
  }

  const [shortUrlAddress] = shortUrlPda(shortUrl, programId);
  const info = await connection.getAccountInfo(shortUrlAddress);
  return info === null;
}

/**
 * Get referrer short URL address and shortUrl
 * @param connection
 * @param referrer
 * @param programId
 */
export async function getReferrerShortUrl(
  connection: Connection,
  referrer: PublicKey,
  programId: PublicKey = PROGRAM_ID
): Promise<[PublicKey | null, string | null]> {
  const [referrerStateAddress] = referrerStatePda(referrer, programId);
  const referrerState = await ReferrerState.fetch(connection, referrerStateAddress, programId);
  const shortUrlState = await ShortUrl.fetch(connection, referrerState!.shortUrl, programId);
  const shortUrlAddress = referrerState ? referrerState.shortUrl : null;
  const shortUrl = shortUrlState ? shortUrlState.shortUrl : null;
  return [shortUrlAddress, shortUrl];
}

/**
 * Get referrer for a given Short URL
 * @param connection
 * @param shortUrl
 * @param programId
 */
export async function getReferrerForShortUrl(
  connection: Connection,
  shortUrl: string,
  programId: PublicKey = PROGRAM_ID
): Promise<PublicKey> {
  const [shortUrlAddress] = shortUrlPda(shortUrl, programId);
  const shortUrlState = await ShortUrl.fetch(connection, shortUrlAddress, programId);
  return shortUrlState!.referrer;
}

/**
 * Get referrer all UserMetadata user accounts linked to a given referrer
 * @param connection
 * @param referrer
 * @param programId
 */
export async function getUserMetadatasByReferrer(
  connection: Connection,
  referrer: PublicKey,
  programId: PublicKey = PROGRAM_ID
): Promise<UserMetadata[]> {
  const userMetadatas = await connection.getProgramAccounts(programId, {
    filters: [
      {
        dataSize: UserMetadata.layout.span + 8,
      },
      {
        memcmp: {
          offset: 8,
          bytes: referrer.toBase58(),
        },
      },
    ],
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
      throw Error('Could not parse obligation.');
    }

    return userMetadataAccount;
  });
}

/**
 * Get referrer all UserMetadata user accounts
 * @param connection
 * @param referrer
 * @param programId
 */
export async function getAllUserMetadatas(
  connection: Connection,
  programId: PublicKey = PROGRAM_ID
): Promise<UserMetadata[]> {
  const userMetadatas = await connection.getProgramAccounts(programId, {
    filters: [
      {
        dataSize: UserMetadata.layout.span + 8,
      },
    ],
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
      throw Error('Could not parse obligation.');
    }

    return userMetadataAccount;
  });
}

/**
 * Get referrer all UserMetadata user accounts linked to a given referrer
 * @param connection
 * @param referrer
 * @param programId
 */
export async function getTotalUsersReferred(
  connection: Connection,
  referrer: PublicKey,
  programId: PublicKey = PROGRAM_ID
): Promise<number> {
  const userMetadatas = await getUserMetadatasByReferrer(connection, referrer, programId);
  return userMetadatas.length;
}

export type ReferralRank = {
  referrer: PublicKey;
  totalUsersReferred: number;
  totalEarningsUsd: Decimal;
};

/**
 * Get ReferralRank array of all referrers ordered by how much they've earned in USD
 * @param connection
 * @param kaminoMarket
 */
export async function getReferralsRanking(connection: Connection, kaminoMarket: KaminoMarket): Promise<ReferralRank[]> {
  const referrersUsersReferred = new PublicKeyMap<PublicKey, number>();

  // counting users referred for each referrer
  const userMetadatas = await getAllUserMetadatas(connection, kaminoMarket.programId);
  for (const userMetadata of userMetadatas) {
    const referrer = userMetadata.referrer;
    const usersReferred = referrersUsersReferred.get(referrer);
    if (usersReferred) {
      referrersUsersReferred.set(referrer, usersReferred + 1);
    } else {
      referrersUsersReferred.set(referrer, 1);
    }
  }

  const referralsRankArray: ReferralRank[] = [];

  for (const referrer of referrersUsersReferred.keys()) {
    const referrerTokenStates = await kaminoMarket.getAllReferrerFeesCumulative(referrer);
    let totalEarningsUsd = new Decimal(0);
    // calculating earnings for each referrer
    for (const reserve of kaminoMarket.reserves.values()) {
      totalEarningsUsd = totalEarningsUsd.add(
        referrerTokenStates.get(reserve.getLiquidityMint())!.mul(reserve.getOracleMarketPrice())
      );
    }

    referralsRankArray.push({
      referrer: new PublicKey(referrer),
      totalUsersReferred: referrersUsersReferred.get(referrer)!,
      totalEarningsUsd: totalEarningsUsd,
    });
  }

  referralsRankArray.sort((a, b) => {
    return b.totalEarningsUsd.comparedTo(a.totalEarningsUsd);
  });

  return referralsRankArray;
}

/**
 * Get ReferralRank array of all referrers ordered by how much they've earned in USD
 * @param connection
 * @param user
 * @param programId
 */
export async function getUserReferralRanking(connection: Connection, user: PublicKey, kaminoMarket: KaminoMarket) {
  const referralsRanking = await getReferralsRanking(connection, kaminoMarket);

  for (let index = 0; index < referralsRanking.length; index++) {
    if (user.equals(referralsRanking[index].referrer)) {
      return index + 1;
    }
  }
}
