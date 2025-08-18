import { CDN_ENDPOINT } from '../../src/utils/constants';

export interface AllKaminoResources {
  'mainnet-beta': KaminoResources;
  devnet: KaminoResources;
}

export interface KaminoResources {
  strategiesData: { [key: string]: KaminoResourceStrategy };
  tokens: KaminoResourcesTokens;
  multiply: { [key: string]: KaminoResourceMultiply };
  multiplyFeatured: KaminoResourceLeverage[];
  leverage: KaminoResourceLeverage[];
  repayWithCollLUTs: Record<string, string>;
  multiplyLUTs: Record<string, string[]>;
  multiplyLUTsPairs: Record<string, Record<string, string[]>>;
  leverageLUTs: Record<string, string[]>;
  deprecatedAssets: string[];
  extraFarms: ExtraFarm[];
}

export type KaminoResourcesTokens = { [key: string]: Token };

export interface KaminoResourceStrategy {
  meta: KaminoResourceStrategyMeta;
  strategy: string;
}

export interface KaminoResourceMultiply {
  tags: string[];
}

export interface KaminoResourceLeverage {
  header: string;
  collateral: string;
  debt: string;
  tags: string[];
}

export interface KaminoResourceStrategyMeta {
  title?: string;
  description?: string;
  url?: string;
  provider?: string;
  launchedOn?: Date;
  status?: number;
  vaultType?: number;
  categories?: string[];
  tags?: string[];
}

export interface ExtraFarm {
  market: string;
  debtMint: string;
  collMint: string;
  farm: string;
  rewardPayerTokenMint: string;
}

export interface Token {
  heading: string;
  links: Link[];
  text: string;
  oracle: string;
}

export interface Link {
  title: string;
  url: string;
}

export interface KaminoStatus {
  maintenance: {
    api: boolean;
  };
}

export async function getKaminoResources(): Promise<KaminoResources> {
  const url = `${CDN_ENDPOINT}/resources.json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text(); // Get the raw text response

    try {
      const data: AllKaminoResources = JSON.parse(text); // Parse the text as JSON
      return data['mainnet-beta'];
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      throw new Error('Invalid JSON in response');
    }
  } catch (error) {
    console.error('Error fetching Kamino resources:', error);
    throw error;
  }
}
