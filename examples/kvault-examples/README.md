# Kvaults examples

## Setup

```bash
cd klend-sdk/examples
yarn install
export RPC=YOUR_RPC_URL_HERE
export KEYPAIR_FILE=YOUR_KEYPAIR_FILE_HERE
```

## Run examples

```bash
cd klend-sdk/examples
yarn tsx kvault-examples/<example_file>.ts
```

e.g. `yarn tsx kvault-examples/example_create_vault.ts`

### Atomic full withdrawal and Farms user-state closure

Set the vault address and run the example:

```bash
export VAULT_ADDRESS=YOUR_VAULT_ADDRESS_HERE
yarn run kvault:user_full_withdraw_and_close_user_state
```

The user must have staked shares in the vault farm. The vault must have enough liquidity for the full withdrawal.
The SDK collects claimable rewards before the full unstake. It then withdraws from the KVault and closes the shares
ATA. It closes the Farms user state last.

The SDK omits reward collection and user-state closure when the state is not closeable. For example, this occurs
when the farm has a cooldown or a reward is not claimable. The KVault withdrawal instructions remain available.

Submit all returned instruction arrays in the shown order and in one transaction. This makes the exit atomic.
The example first uses the vault lookup table. If the transaction still exceeds 1,232 bytes, the example creates
a supplemental lookup table for the transaction accounts and waits until that table is usable. The table setup uses
separate transactions, but the full exit and both account closures still execute atomically in one transaction.

### Direct atomic-close utility

Use the direct utility when you compose the full-withdrawal instructions yourself:

```bash
export VAULT_ADDRESS=YOUR_VAULT_ADDRESS_HERE
yarn run kvault:user_full_withdraw_with_atomic_close_helper
```

The example calls `getAtomicCloseEmptyUserStateIxsIfPossible` directly. It submits reward collection, the full
unstake, the Farms withdrawal, the KVault withdrawal, and both account closures in one transaction.

The vault must have enough liquidity for the full withdrawal. The example stops before submission when the Farms
user state cannot close atomically.

## Transactions troubleshooting

The examples are meant to show how to use the instructions returned by the SDK but they may not work straight forward on the mainnet. The common issues are:

- The transactions require a priority fee that is not set by SDK, so you need to add an ix to set priority fee
- The transactions need more compute units than default so you need an instruction to require more compute units

Both these instructions can be generated using `getComputeBudgetAndPriorityFeeIxns` function from the SDK
