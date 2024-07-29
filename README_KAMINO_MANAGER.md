## Kamino Manager CLI

In order to use the CLI, the followign `.env` configuration is required:
```
ADMIN="../staging_owner.json"
RPC="https://rpc.ironforge.network/mainnet?apiKey=01HVK9A9XRZWKKDZMDDD94R5J6"
KLEND_PROGRAM_ID_MAINNET="KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
KVAULT_PROGRAM_ID_MAINNET="kvauTFR8qm1dhniz6pYuBZkuene3Hfrs1VQhVRgCNrr"
KLEND_PROGRAM_ID_STAGING="SLendK7ySfcEzyaFqy93gDnD3RtrpXJcnRwb6zFHJSh"
KVAULT_PROGRAM_ID_STAGING="STkvh7ostar39Fwr4uZKASs1RNNuYMFMTsE77FiRsL2"
```

#### Create a new market
`npx ts-node src/client_kamino_manager.ts create-market --staging`

- bs58 - is a boolean flag. If set it will print the bs58 txn instead of executing. Should be used for multisig
- staging - is a boolean flag. If set, staging programs will be used
- multisig - address string to be used as admin PublicKey. To be used in conjunction with bs58 flag

#### Add a new asset to market / Create new reserve
`npx ts-node src/client_kamino_manager.ts add-asset-to-market --market market_address --mint token_mint --mint-program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --reserve-config-path ./configs/reserve_config_example.json --staging`

- market - address to create the reserve for
- mint - the liquidity mint to create the reserve for
- mint-program-id - the program id of the mint - `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` - spl token program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` - for token 2022 token program
- bs58 - is a boolean flag. If set it will print the bs58 txn instead of executing. Should be used for multisig
- staging - is a boolean flag. If set, staging programs will be used
- multisig - address string to be used as admin PublicKey. To be used in conjunction with bs58 flag

#### Update a reserve config
`npx ts-node src/client_kamino_manager.ts update-reserve-config --reserve reserve_address --reserve-config-path ./configs/reserve_config_example.json --staging --update-entire-config`

- reserve - address to update the reserve config for
- reserve-config-path - the path to the config file to be used
- update-entire-config - wether to update the entrie reserve config or just the difference between current on-chain state and given config
- bs58 - is a boolean flag. If set it will print the bs58 txn instead of executing. Should be used for multisig
- staging - is a boolean flag. If set, staging programs will be used

#### Download a reserve config

In order to update a reserve config, you need the latest reserve configuration, to modify. To get the latest, this command can be used:

`npx ts-node src/client_kamino_manager.ts download-reserve-config --reserve reserve_address --staging`

- reserve - address to update the reserve config for
- staging - is a boolean flag. If set, staging programs will be used

#### Create a vault 
`npx ts-node src/client_kamino_manager.ts create-vault --mint token_mint --staging`

- mint - the liquidity mint to create the reserve for
- bs58 - is a boolean flag. If set it will print the bs58 txn instead of executing. Should be used for multisig
- staging - is a boolean flag. If set, staging programs will be used
- multisig - address string to be used as admin PublicKey. To be used in conjunction with bs58 flag

#### Update vault reserve allocation
`npx ts-node src/client_kamino_manager.ts update-vault-reserve-allocation --vault vault_address --reserve reserve_address --allocation-weight number --allocation-cap number --staging`

- vault - the vault address to add/update the reserve allocation for
- reserve - the reserve address to add/update the reserve allocation for
- allocation-weight - the allocation weight for given reserve; only relevant in relation with the other reserve allocation weights
- allocation-cap - the allocation cap in decimal (not lamports) for given reserve
- bs58 - is a boolean flag. If set it will print the bs58 txn instead of executing. Should be used for multisig
- staging - is a boolean flag. If set, staging programs will be used
- multisig - address string to be used as admin PublicKey. To be used in conjunction with bs58 flag

#### Get oracle mappings 
This can be used to get scope oracle mappings to be used when configuring the reserve oracle config.
`npx ts-node src/client_kamino_manager.ts get-oracle-mappings`