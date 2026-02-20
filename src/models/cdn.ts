export interface CdnResourcesResponse {
  'mainnet-beta': CdnResources;
}

export interface CdnResources {
  delegatedVaultFarms: DelegatedVaultFarm[];
  riskManagers: Record<string, RiskManagerInfo[]>;
}

export interface DelegatedVaultFarm {
  vault: string;
  farm: string;
}

export interface RiskManagerInfo {
  name: string;
  description: string;
  logoURL?: string;
  siteURL?: string;
  tags: string[];
}
