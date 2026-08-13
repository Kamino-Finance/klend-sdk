# klend-sdk

TypeScript SDK for the Kamino Lend and Kamino Vault Solana programs: building, reading, and managing markets, reserves, obligations, and vaults.

## Language

### Lookup tables

**Market Lookup Table**:
A client-owned Address Lookup Table aggregating a lending market's stable accounts (global config, market, market owner, lending-market authority, and the SPL Token + Associated Token programs) plus every reserve's linked accounts (vaults, mints, farms, oracles). The klend program id is deliberately excluded, since a versioned tx's invoked program must be a static key and cannot be resolved from a LUT. The market account has no on-chain field for it, so the caller creates it, keeps its address, and passes it back to extend it.
_Avoid_: market LUT (in prose), lending-market ALT

**Vault Lookup Table**:
A Kamino Vault's Address Lookup Table, whose address is stored on-chain in `vaultState.vaultLookupTable` and set via `updateVaultConfig`. Reconciled against that on-chain address, in contrast to a Market Lookup Table which has no on-chain home.
_Avoid_: vault LUT (in prose)
