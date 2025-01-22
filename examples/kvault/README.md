# Kvaults examples

## Setup

```bash
cd klend-sdk/examples
yarn install
export RPC_ENDPOINT=YOUR_RPC_URL_HERE
export KEYPAIR_FILE=YOUR_KEYPAIR_FILE_HERE
```

## Run examples

```bash
cd klend-sdk/examples
yarn ts-node kvault/<example_file>.ts
```

e.g. `yarn ts-node kvault/example_create_vault.ts`

## Transactions troubleshooting

The examples are meant to show how to use the instructions returned by the SDK but they may not work straight forward on the mainnet. The common issues are:

- The transactions require a priority fee that is not set by SDK, so you need to add an ix to set priority fee
- The transactions need more compute units than default so you need an instruction to require more compute units

Both these instructions can be generated using `getComputeBudgetAndPriorityFeeIxns`
function from the SDK
