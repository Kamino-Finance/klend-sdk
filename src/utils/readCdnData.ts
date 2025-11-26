import { CDN_ENDPOINT } from './constants';

/**
 * CDN data structure containing Kamino resources for different networks
 */
export interface AllKaminoCdnData {
  'mainnet-beta': KaminoCdnData;
  devnet: KaminoCdnData;
}

/**
 * Kamino CDN data structure
 * This type can be extended with additional fields as needed
 */
export interface KaminoCdnData {
  /**
   * List of deprecated reserve addresses (pubkeys as strings)
   * Note: This field is named 'deprecatedAssets' in the CDN but represents deprecated reserves
   */
  deprecatedAssets: string[];
  // Additional fields can be added here as they become relevant
  [key: string]: unknown;
}

/**
 * Fetches Kamino CDN data from the resources endpoint
 * @returns Promise resolving to the CDN data for the specified cluster or undefined if fetching/parsing fails
 */
export async function fetchKaminoCdnData(): Promise<KaminoCdnData | undefined> {
  const url = `${CDN_ENDPOINT}/resources.json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    try {
      const data: AllKaminoCdnData = JSON.parse(text);
      return data['mainnet-beta'];
    } catch (parseError) {
      throw new Error('Invalid JSON in response');
    }
  } catch (error) {
    return undefined;
  }
}
