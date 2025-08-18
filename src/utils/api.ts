import { Address } from '@solana/kit';
import axios from 'axios';
import { ConfigType, isEmptyObject } from '../classes';
import { CDN_ENDPOINT, getApiEndpoint } from '../utils';
import { IBackOffOptions, backOff } from 'exponential-backoff';
import { PROGRAM_ID } from '../lib';

export type ApiRequestOptions = {
  programId?: Address;
  source?: 'API' | 'CDN';
  apiBaseUrl?: string;
};

export type ApiFilterOptions = {
  isCurated?: boolean;
};

/**
 * Fetch config from the API
 * A good place to start to find active klend markets without expensive RPC calls
 *
 * @param programId - The program id to retrieve config for
 * @param source - CDN is a json file hosted in the cloud, API is a webserver
 * @param apiBaseUrl - Optional base URL for the API, if not provided, defaults to the standard API endpoint, not used for CDN
 * @param filterOptions - Config options to filter markets by
 */
export async function getMarketsFromApi(
  { programId = PROGRAM_ID, source = 'CDN', apiBaseUrl }: ApiRequestOptions = {},
  filterOptions: ApiFilterOptions = {}
): Promise<ConfigType> {
  let unfilteredConfigs: ConfigType = {} as ConfigType;
  if (source === 'CDN') {
    unfilteredConfigs = (await backOff(() => axios.get(`${CDN_ENDPOINT}/kamino_lend_config_v3.json`), KAMINO_CDN_RETRY))
      .data[programId.toString()] as ConfigType;
  }

  if (!unfilteredConfigs || isEmptyObject(unfilteredConfigs)) {
    const API_ENDPOINT = getApiEndpoint(programId, apiBaseUrl);
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
