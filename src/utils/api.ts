import { Address } from '@solana/kit';
import axios from 'axios';
import { ConfigType, isEmptyObject } from '../classes';
import { CDN_ENDPOINT, getApiEndpoint } from '../utils';
import { IBackOffOptions, backOff } from 'exponential-backoff';
import { PROGRAM_ID } from '../lib';
import { Logger, LogLevel } from './Logger';

export type ApiRequestOptions = {
  programId?: Address;
  source?: 'API' | 'CDN';
  apiBaseUrl?: string;
};

export type ApiFilterOptions = {
  isCurated?: boolean;
};

export type ApiLoggerOptions = {
  logger?: Logger;
  errorLevel?: LogLevel;
};

export type MarketsApiRequest = {
  api?: ApiRequestOptions;
  filter?: ApiFilterOptions;
  log?: ApiLoggerOptions;
};

/**
 * Fetch config from the API
 * A good place to start to find active klend markets without expensive RPC calls
 *
 * @param programId - The program id to retrieve config for
 * @param source - CDN is a json file hosted in the cloud, API is a webserver
 * @param apiBaseUrl - Optional base URL for the API, if not provided, defaults to the standard API endpoint, not used for CDN
 * @param filterOptions - Config options to filter markets by
 * @param logger - pass a custom logger instance to log retries
 * @param errorLevel - retry log level, NONE for no logs
 */
export async function getMarketsFromApi({
  api: { programId = PROGRAM_ID, source = 'CDN', apiBaseUrl } = {},
  filter: filterOptions = {},
  log: { logger = console, errorLevel = LogLevel.WARN } = {},
}: MarketsApiRequest = {}): Promise<ConfigType> {
  let unfilteredConfigs: ConfigType = {} as ConfigType;
  if (source === 'CDN') {
    unfilteredConfigs = (
      await backOff(
        () => axios.get(`${CDN_ENDPOINT}/kamino_lend_config_v3.json`),
        getKaminoCdnRetry(logger, errorLevel)
      )
    ).data[programId.toString()] as ConfigType;
  }

  if (!unfilteredConfigs || isEmptyObject(unfilteredConfigs)) {
    const API_ENDPOINT = getApiEndpoint(programId, apiBaseUrl);
    unfilteredConfigs = (
      await backOff(() => axios.get(API_ENDPOINT), getKaminoApiRetry(logger, errorLevel, API_ENDPOINT))
    ).data as ConfigType;
  }

  return unfilteredConfigs.filter((c) => {
    if (filterOptions.isCurated !== undefined) {
      return c.isCurated === filterOptions.isCurated;
    }
    return true;
  });
}

function getKaminoCdnRetry(logger: Logger, errorLevel: LogLevel): Partial<IBackOffOptions> {
  return {
    maxDelay: 1000,
    numOfAttempts: 3,
    startingDelay: 10,
    retry: (e: any, attemptNumber: number) => {
      log(logger, errorLevel, `kamino CDN call #${attemptNumber} failed, retrying with exponential backoff...`, e);
      return true;
    },
  };
}

function getKaminoApiRetry(logger: Logger, errorLevel: LogLevel, apiUrl: string): Partial<IBackOffOptions> {
  return {
    maxDelay: 1000,
    numOfAttempts: 3,
    startingDelay: 10,
    retry: (e: any, attemptNumber: number) => {
      log(logger, errorLevel, `${apiUrl} call #${attemptNumber} failed, retrying with exponential backoff...`, e);
      return true;
    },
  };
}

function log(logger: Logger, errorLevel: LogLevel, msg: string, ...meta: any[]): void {
  if (errorLevel !== LogLevel.NONE) {
    logger[errorLevel](msg, ...meta);
  }
}
