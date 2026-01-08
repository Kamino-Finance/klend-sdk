export interface CdnResourcesResponse {
  'mainnet-beta': CdnResources;
}

export interface CdnResources {
  delegatedVaultFarms: DelegatedVaultFarm[];
}

export interface DelegatedVaultFarm {
  vault: string;
  farm: string;
}
