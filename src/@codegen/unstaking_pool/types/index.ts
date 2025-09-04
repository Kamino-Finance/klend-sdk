import * as PoolConfigField from "./PoolConfigField"

export { PoolConfigField }

export type PoolConfigFieldKind =
  | PoolConfigField.ActionAuthority
  | PoolConfigField.LookupTable
  | PoolConfigField.PendingAdmin
export type PoolConfigFieldJSON =
  | PoolConfigField.ActionAuthorityJSON
  | PoolConfigField.LookupTableJSON
  | PoolConfigField.PendingAdminJSON
