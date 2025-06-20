# Kamino Manager Guidelines

## 1. Kamino Manager CLI

### Installation Instructions

Ensure *yarn* is installed first [here](https://classic.yarnpkg.com/lang/en/docs/install/)

```shell
git clone git@github.com:Kamino-Finance/klend-sdk.git
cd klend-sdk
yarn
```

#### Requirements

In order to use the CLI, the following `.env` configuration is required (i.e. you need to create a `.env` file in the root of the project with the content below but replace the values of ADMIN and RPC with your own):

```
ADMIN="admin.json"
RPC="https://rpc.cluster"
KLEND_PROGRAM_ID_MAINNET="KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
KVAULT_PROGRAM_ID_MAINNET="KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd"
KLEND_PROGRAM_ID_STAGING="SLendK7ySfcEzyaFqy93gDnD3RtrpXJcnRwb6zFHJSh"
KVAULT_PROGRAM_ID_STAGING="stKvQfwRsQiKnLtMNVLHKS3exFJmZFsgfzBPWHECUYK"
```

- for the template you can copy `.env.example` to `.env` and then replace the ADMIN and RPC values `cp .env.example .env`

- **ADMIN** - path to a local private key file (it has to be a JSON file and have some SOL). If you don't have one create one. To create it you need to have Solana locally
  - Install Solana: guide: https://docs.solanalabs.com/cli/install or directly `sh -c "$(curl -sSfL https://release.solana.com/v1.18.18/install)"`. If it suggests a command involving `PATH` after installation, run it.
  - Restart the terminal you are using
  - Create new keypair: `solana-keygen new -o admin.json`
  - Get the pubkey: `solana-keygen pubkey admin.json`
  - Send some SOL to it
- **RPC** - the RPC url to use; If you don't have one you can use the default Solana one `https://api.mainnet-beta.solana.com` but it is strongly recommended to use a private one as this one is rate limited and has low success rate for landing transactions

### Kamino Lending

#### Create a new market

```
yarn kamino-manager create-market --staging --mode execute
```

- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**
- **staging** - is a boolean flag. If set, staging programs will be used
- **multisig** - address string to be used as admin PublicKey. To be used in conjunction with multisig mode

#### Add a new asset to market / Create new reserve

```
yarn kamino-manager add-asset-to-market --market market_address --mint <token_mint> --mint-program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --reserve-config-path ./configs/reserve_config_example.json --staging --mode execute
```

- **market** - address to create the reserve for
- **mint** - the liquidity mint to create the reserve for; e.g. if you want to create a reserve for USDC use the USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **mint-program-id** - the program id of the mint - `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` - spl token program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` - for token 2022 token program
- **reserve-config-path** - path to the reserve config to be used. A reserve config example can be found [here](https://github.com/Kamino-Finance/klend-sdk/blob/master/configs/reserve_config_example.json)
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**
- **staging** - is a boolean flag. If set, staging programs will be used
- **multisig** - address string to be used as admin PublicKey. To be used in conjunction with multisig mode

#### Download a reserve config

In order to update a reserve config, you need the latest reserve configuration, to modify. To get the latest, this command can be used:

```
yarn kamino-manager download-reserve-config --reserve reserve_address --staging
```

- **reserve** - address to download the reserve config for
- **staging** - is a boolean flag. If set, staging programs will be used

#### Update a reserve config

```
yarn kamino-manager update-reserve-config --reserve reserve_address --reserve-config-path ./configs/reserve_config_example.json --staging --update-entire-config --mode execute
```

- **reserve** - address to update the reserve config for
- **reserve-config-path** - the path to the config file to be used
- **update-entire-config** - wether to update the entrie reserve config or just the difference between current on-chain state and given config
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**
- **staging** - is a boolean flag. If set, staging programs will be used

A reserve config example can be found [here](https://github.com/Kamino-Finance/klend-sdk/blob/master/configs/reserve_config_example.json)

#### Download a lending market configuration

```
yarn kamino-manager download-lending-market-config --lending-market lending_market_address --staging
```

- **lending-market** - address to download the lending market config for
- **staging** - is a boolean flag. If set, staging programs will be used

#### Download a lending market together with all the associated reserves

```
yarn kamino-manager download-lending-market-config-and-all-reserves-configs --lending-market lending_market_address --staging
```

- **lending-market** - address to download the lending market config for
- **staging** - is a boolean flag. If set, staging programs will be used

#### Update a lending market

```
yarn kamino-manager update-lending-market-from-config --lending-market lending_market_address --staging --lending-market-config-path ./configs/lending_market_address/market-lending_market_address.json --mode inspect --staging
```

- **lending-market** - address of market to update the config for
- **lending-market-config-path** - the path to the config file to be used
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**
- **staging** - is a boolean flag. If set, staging programs will be used

#### Update a lending market owner

All markets should be owned by a multisig once they are publicly used and maintained.
However, to start of with, preparing the configuration and adding all the necessary reserves would take longer under a multisig.
In order to migrate from a hot wallet (private key on a local machine) you first need to set the lending_market_owner_cached to the new admin (ideally multisig) using the command above, followed by running the following command:

```
yarn kamino-manager update-lending-market-owner --lending-market lending_market_address --staging --mode multisig
```

**To note** this command can only be executed by the current market lending_market_owner_cached and it will set the lending_market_owner to that address.

### Kamino lending Vaults (kVaults)

#### Create a vault

```
yarn kamino-manager create-vault --mint token_mint --staging --mode execute
```

- **mint** - the liquidity mint to create the reserve for
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**
- **staging** - is a boolean flag. If set, staging programs will be used
- **multisig** - address string to be used as admin PublicKey. To be used in conjunction with multisig mode

#### Update vault reserve allocation

```
yarn kamino-manager update-vault-reserve-allocation --vault vault_address --reserve reserve_address --allocation-weight number --allocation-cap number --staging --mode execute
```

- **vault** - the vault address to add/update the reserve allocation for
- **reserve** - the reserve address to add/update the reserve allocation for
- **allocation-weight** - the allocation weight for given reserve; only relevant in relation with the other reserve allocation weights
- **allocation-cap** - the allocation cap in decimal (not lamports) for given reserve
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**
- **staging** - is a boolean flag. If set, staging programs will be used
- **multisig** - address string to be used as admin PublicKey. To be used in conjunction with multisig mode

#### Update vault pending admin

(note that this updates only the `pending_admin` field, to actually set the `admin` the `pending_admin` has to accept ownership [see command below])

```
yarn kamino-manager update-vault-pending-admin --vault <vault_address> --new-admin <new_admin_pubkey> --mode <mode>
```

- **vault** - the vault address to change the pending admin for
- **new-admin** - the new admin pubkey to set as pending admin
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**

#### Accept vault ownership

This is called by the `pending_admin` to accept the ownership of the vault where it is the `pending_admin`.

```
yarn kamino-manager accept-ownership --vault <vault_address> --mode <mode>
```

- **vault** - the vault address to change the pending admin for
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**

#### Update performance fee

```
yarn kamino-manager update-vault-perf-fee --vault <vault_address> --fee-bps <performance_fee_in_bps> --mode <mode>
```

- **vault** - the vault address to change the pending admin for
- **fee-bps** - the performance fee applied to all generalted yield, in basis points
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**

#### Update management fee

```
yarn kamino-manager update-vault-mgmt-fee --vault <vault_address> --fee-bps <yearly_mgmt_fee_in_bps> --mode <mode>
```

- **vault** - the vault address to change the pending admin for
- **fee-bps** - the yearly management fee, in basis points
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**

#### Give up pending fees

This instruction makes the vault manager to give up a part provided as parameter(or full) of the pending fees, which will become part of the vault so will be distributed to the holders of the vault.
This can be used also in the case where the pending fees get bigger than the total vault, so the manager give up the pending fees and the vault gets back to a "healthy" state.

```
yarn kamino-manager give-up-pending-fees --vault <vault_address> --max-amount-to-give-up <max_amount_to_give_up_in_tokens> --mode <mode>
```

- **vault** - the vault address to change the pending admin for
- **max-amount-to-give-up** - the amount in tokens to be given up from the pending fees
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**

#### Withdraw pending fees

```
yarn kamino-manager withdraw-pending-fees --vault <vault_address> --mode <mode>
```

- **vault** - the vault address to change the pending admin for
- **mode** - can have these values:
  - *inspect* - will print an url to the explorer txn inspection, where it can be simulated
  - *simulate* - will print the simulation outputs
  - *execute* - will execute the transaction
  - *multisig* - will print the bs58 transaction to be used within a multisig
  It is recommended to **1. inspect/simulate** and then **2. execute/multisig**

#### Get oracle mappings

This can be used to get scope oracle mappings to be used when configuring the reserve oracle config.

```
yarn kamino-manager get-oracle-mappings
```

#### Useful to know

**Exploring the created markets** on the webapp can be done by going to
<https://app.kamino.finance/?STAGING_PROGRAM&market=market_address> for the staging program
<https://app.kamino.finance/?market=market_address> for the prod program

**Creating a new keypair to use as an admin** can be achieved by running the following:

```
solana-keygen new -o path_to_private_key.json
```

make sure to keep the private key **private** and only shar ethe public key.
If you forget the publickey you can get it by running the following:

```
solana-keygen pubkey path_to_private_key.json
```

## 2. Kamino Manager Class

In order to use the kamino manager class, which provides a high-level interface
for the main actions in regards to managing a market or a vault, you will need to use
the kamino manager class.

#### Installation Instructions

Run one of the following commands within the project directory you want to use the manager class within

```shell
# npm
npm install @kamino-finance/klend-sdk

# yarn
yarn add @kamino-finance/klend-sdk
```

#### Getting Started

```ts
const connection = new anchor.web3.Connection("rpc.url");
const kaminoManager = new KaminoManager(connection, kLendProgramId, kVaultProgramId);
```

- kLendProgramId and kVaultProgramId can be undefined and default prod programs will be used
- programIds can be found [here](https://github.com/Kamino-Finance/klend-sdk/blob/master/.env.example)

#### Example Usage

For usage examples, a good starting place is [this](https://github.com/Kamino-Finance/klend-sdk/blob/master/tests/kamino_manager_tests/kamino_manager.test.ts) test file

## 3. Multisig management

For all the interactions and ownership of kVaults we recommend using [a Squads multisig](https://app.squads.so/squads) and a hardware wallet.

### Creating a new multisig

On the [Squads page](https://app.squads.so/squads) click on the `Create Squad` button and follow the instructions. You'll have to provide a name, the wallets of the other team members if you have any and a threshold (the number of signatures required to execute a transaction).
After the Squad is created on top left screen you can see its balance and address, the address is what will be the owner of the kVaults.

### Creating a new vault under a multisig

To have a strategy under multisig you can:

- Create the strategy with a hot wallet and then transfer the ownership to the multisig:
  - create the strategy with the hot wallet: `yarn kamino-manager create-vault --mint <token_mint> --mode execute`
  - set the pending admin to the multisig (run it with `--mode simulate` before so you ensure it does what is expected): `yarn kamino-manager update-vault-pending-admin --vault <vault_address> --new-admin <multisig_pubkey> --mode execute`
  - create the proposal for the multisig to accept membership using this command: `yarn kamino-manager accept-vault-ownership --vault <vault_pubkey> --mode multisig --multisig <multisig_pubkey>`and then propose and execute in the multisig

### Managing a vault under a multisig

For all actions that require admin permissions (updating reserves allocation, setting the performance and management fee, collect pending fees, give up fees) at the commands above you will need to add the `--multisig <multisig_pubkey>` flag and the command will return the base58 transaction to be proposed in the multisig.


## Troubleshooting

### Debugging transactions

#### Common error messages
- `Transaction failed: Error processing Instruction 0: custom program error: 0x1`: you don't have enough SOL in the admin wallet to pay for the transaction fees; you can check the transaction hash to see exactly how much SOL was needed
- `TransactionExpiredBlockheightExceededError: Signature <signature_value> has expired: block height exceeded.`: this has multiple potential causes:
  - the transaction was not submitted to the network in time because of the RPC/network being congested
  - you are using the wrong signer for the transaction
