import {
  Address,
  GetProgramAccountsApi,
  Rpc,
  address,
  GetAccountInfoApi,
  fetchEncodedAccount,
  Base58EncodedBytes,
} from '@solana/kit';
import { KaminoMarket } from '../classes';
import { referrerStatePda, shortUrlPda } from '../utils';
import { PROGRAM_ID, UserMetadata, ReferrerState, ShortUrl } from '../lib';
import Decimal from 'decimal.js';

/**
 * Check if short URL available - also checks if short URL is valid (ascii-alphanumeric plus '_' '-', max 32 chars)
 * @param connection
 * @param shortUrl
 * @param programId
 */
export async function isShortUrlAvailable(
  connection: Rpc<GetAccountInfoApi>,
  shortUrl: string,
  programId: Address = PROGRAM_ID
): Promise<boolean> {
  if (shortUrl.length > 32) {
    return false;
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(shortUrl)) {
    return false;
  }

  const shortUrlAddress = await shortUrlPda(shortUrl, programId);
  const info = await fetchEncodedAccount(connection, shortUrlAddress);
  return !info.exists;
}

/**
 * Get referrer short URL address and shortUrl
 * @param rpc
 * @param referrer
 * @param programId
 */
export async function getReferrerShortUrl(
  rpc: Rpc<GetAccountInfoApi>,
  referrer: Address,
  programId: Address = PROGRAM_ID
): Promise<[Address | null, string | null]> {
  const [referrerStateAddress] = await referrerStatePda(referrer, programId);
  const referrerState = await ReferrerState.fetch(rpc, referrerStateAddress, programId);
  const shortUrlState = await ShortUrl.fetch(rpc, referrerState!.shortUrl, programId);
  const shortUrlAddress = referrerState ? referrerState.shortUrl : null;
  const shortUrl = shortUrlState ? shortUrlState.shortUrl : null;
  return [shortUrlAddress, shortUrl];
}

/**
 * Get referrer for a given Short URL
 * @param rpc
 * @param shortUrl
 * @param programId
 */
export async function getReferrerForShortUrl(
  rpc: Rpc<GetAccountInfoApi>,
  shortUrl: string,
  programId: Address = PROGRAM_ID
): Promise<Address> {
  const shortUrlAddress = await shortUrlPda(shortUrl, programId);
  const shortUrlState = await ShortUrl.fetch(rpc, shortUrlAddress, programId);
  return shortUrlState!.referrer;
}

/**
 * Get referrer all UserMetadata user accounts linked to a given referrer
 * @param rpc
 * @param referrer
 * @param programId
 */
export async function getUserMetadatasByReferrer(
  rpc: Rpc<GetProgramAccountsApi>,
  referrer: Address,
  programId: Address = PROGRAM_ID
): Promise<UserMetadata[]> {
  const userMetadatas = await rpc
    .getProgramAccounts(programId, {
      filters: [
        {
          dataSize: BigInt(UserMetadata.layout.span + 8),
        },
        {
          memcmp: {
            offset: 8n,
            bytes: referrer.toString() as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
      ],
      encoding: 'base64',
    })
    .send();

  return userMetadatas.map((userMetadata) => {
    if (userMetadata.account.owner !== programId) {
      throw new Error("account doesn't belong to this program");
    }

    const userMetadataAccount = UserMetadata.decode(Buffer.from(userMetadata.account.data[0], 'base64'));

    if (!userMetadataAccount) {
      throw Error('Could not parse obligation.');
    }

    return userMetadataAccount;
  });
}

/**
 * Get referrer all UserMetadata user accounts
 * @param rpc
 * @param referrer
 * @param programId
 */
export async function getAllUserMetadatas(
  rpc: Rpc<GetProgramAccountsApi>,
  programId: Address = PROGRAM_ID
): Promise<UserMetadata[]> {
  const userMetadatas = await rpc
    .getProgramAccounts(programId, {
      filters: [
        {
          dataSize: BigInt(UserMetadata.layout.span + 8),
        },
      ],
      encoding: 'base64',
    })
    .send();

  return userMetadatas.map((userMetadata) => {
    if (userMetadata.account.owner !== programId) {
      throw new Error("account doesn't belong to this program");
    }

    const userMetadataAccount = UserMetadata.decode(Buffer.from(userMetadata.account.data[0], 'base64'));

    if (!userMetadataAccount) {
      throw Error('Could not parse obligation.');
    }

    return userMetadataAccount;
  });
}

/**
 * Get referrer all UserMetadata user accounts linked to a given referrer
 * @param rpc
 * @param referrer
 * @param programId
 */
export async function getTotalUsersReferred(
  rpc: Rpc<GetProgramAccountsApi>,
  referrer: Address,
  programId: Address = PROGRAM_ID
): Promise<number> {
  const userMetadatas = await getUserMetadatasByReferrer(rpc, referrer, programId);
  return userMetadatas.length;
}

export type ReferralRank = {
  referrer: Address;
  totalUsersReferred: number;
  totalEarningsUsd: Decimal;
};

/**
 * Get ReferralRank array of all referrers ordered by how much they've earned in USD
 * @param rpc
 * @param kaminoMarket
 */
export async function getReferralsRanking(
  rpc: Rpc<GetProgramAccountsApi>,
  kaminoMarket: KaminoMarket
): Promise<ReferralRank[]> {
  const referrersUsersReferred = new Map<Address, number>();

  // counting users referred for each referrer
  const userMetadatas = await getAllUserMetadatas(rpc, kaminoMarket.programId);
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
      referrer: address(referrer),
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
 * @param kaminoMarket
 */
export async function getUserReferralRanking(
  connection: Rpc<GetProgramAccountsApi>,
  user: Address,
  kaminoMarket: KaminoMarket
): Promise<number | undefined> {
  const referralsRanking = await getReferralsRanking(connection, kaminoMarket);

  for (let index = 0; index < referralsRanking.length; index++) {
    if (user === referralsRanking[index].referrer) {
      return index + 1;
    }
  }
  return undefined;
}
