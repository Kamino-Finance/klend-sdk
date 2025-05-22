import { PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { ConfigType, isEmptyObject } from '../classes';
import { CDN_ENDPOINT, getApiEndpoint } from '../utils';
import { IBackOffOptions, backOff } from 'exponential-backoff';
import { PROGRAM_ID } from '../lib';

export type ApiFilterOptions = {
  isCurated?: boolean;
};

/**
 * Fetch config from the API
 * A good place to start to find active klend markets without expensive RPC calls
 *
 * @param programId - The program id to retrieve config for
 * @param source - CDN is a json file hosted in the cloud, API is a webserver
 * @param filterOptions - Config options to filter markets by
 */
export async function getMarketsFromApi(
  programId: PublicKey = PROGRAM_ID,
  source: 'API' | 'CDN' = 'CDN',
  filterOptions: ApiFilterOptions = {}
): Promise<ConfigType> {
  let unfilteredConfigs: ConfigType = {} as ConfigType;
  if (source === 'CDN') {
    unfilteredConfigs = (await backOff(() => axios.get(CDN_ENDPOINT), KAMINO_CDN_RETRY)).data[
      programId.toString()
    ] as ConfigType;
  }

  if (!unfilteredConfigs || isEmptyObject(unfilteredConfigs)) {
    const API_ENDPOINT = getApiEndpoint(programId);
    unfilteredConfigs = (await backOff(() => axios.get(API_ENDPOINT), KAMINO_API_RETRY)).data as ConfigType;
  }

  return unfilteredConfigs.filter((c) => {
    if (filterOptions.isCurated !== undefined) {
      return c.isCurated === filterOptions.isCurated;
    }
    return true;
  });
}

export const KAMINO_CDN_RETRY: Partial<IBackOffOptions> = {
  maxDelay: 1000,
  numOfAttempts: 3,
  startingDelay: 10,
  retry: (e: any, attemptNumber: number) => {
    console.warn(e);
    console.warn({
      attemptNumber,
      message: 'kamino CDN call failed, retrying with exponential backoff...',
    });
    return true;
  },
};

export const KAMINO_API_RETRY: Partial<IBackOffOptions> = {
  maxDelay: 1000,
  numOfAttempts: 3,
  startingDelay: 10,
  retry: (e: any, attemptNumber: number) => {
    console.warn(e);
    console.warn({
      attemptNumber,
      message: 'api.kamino.finance call failed, retrying with exponential backoff...',
    });
    return true;
  },
};
