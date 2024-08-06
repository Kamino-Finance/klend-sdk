import { PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { ConfigType, isEmptyObject } from '../classes';
import { CDN_ENDPOINT, getApiEndpoint } from '../utils';
import { IBackOffOptions, backOff } from 'exponential-backoff';
import { PROGRAM_ID } from '../lib';

/**
 * Fetch config from the API
 * A good place to start to find active klend markets without expensive RPC calls
 *
 * @param programId - The program id to retrieve config for
 * @param source - CDN is a json file hosted in the cloud, API is a webserver
 */
export async function getMarketsFromApi(
  programId: PublicKey = PROGRAM_ID,
  source: 'API' | 'CDN' = 'CDN'
): Promise<ConfigType> {
  let configs: ConfigType = {} as ConfigType;

  if (source === 'CDN') {
    configs = (await backOff(() => axios.get(CDN_ENDPOINT), KAMINO_CDN_RETRY)).data[programId.toString()] as ConfigType;
  }

  if (!configs || isEmptyObject(configs)) {
    const API_ENDPOINT = getApiEndpoint(programId);
    configs = (await backOff(() => axios.get(API_ENDPOINT), KAMINO_API_RETRY)).data as ConfigType;
  }

  return configs;
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
