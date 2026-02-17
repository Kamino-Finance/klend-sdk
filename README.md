## Installation

```shell
# npm
npm install @kamino-finance/klend-sdk

# yarn
yarn add @kamino-finance/klend-sdk
```

# Kamino Lending Typescript SDK

This is the Kamino Lending Typescript SDK to interact with the Kamino Lend smart contract

## Basic usage

### Reading data

```typescript
import {
  KaminoMarket,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';
import {
  address,
  createDefaultRpcTransport,
  createRpc,
  createSolanaRpcApi,
  DEFAULT_RPC_CONFIG,
} from '@solana/kit';

// Create an RPC client
const api = createSolanaRpcApi({ ...DEFAULT_RPC_CONFIG, defaultCommitment: 'processed' });
const rpc = createRpc({ api, transport: createDefaultRpcTransport({ url: 'YOUR_RPC_URL' }) });

// Get slot duration (required parameter)
const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

// Load the market
const market = await KaminoMarket.load(
  rpc,
  address("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"), // main market address
  slotDuration
);
console.log(market.reserves.map((reserve) => reserve.state.config.loanToValuePct));

// Refresh reserves
await market.loadReserves();

const usdcReserve = market.getReserve("USDC");
console.log(usdcReserve?.getTotalSupply().toString());

// Refresh all cached data
await market.refreshAll();

const obligation = await market.getObligationByWallet(address("WALLET_ADDRESS"));
console.log(obligation?.refreshedStats.borrowLimit.toString());
```

### Perform lending action

```typescript
import { KaminoAction, VanillaObligation, PROGRAM_ID } from '@kamino-finance/klend-sdk';

const kaminoAction = await KaminoAction.buildDepositTxns(
  kaminoMarket,
  amountBase,
  reserveMint, // Address of the token mint
  walletSigner,
  new VanillaObligation(PROGRAM_ID),
);

// Get the instructions from the action
console.log('Setup instructions:', kaminoAction.setupIxsLabels);
console.log('Lending instructions:', kaminoAction.lendingIxsLabels);
```

### Getting a vanilla obligation for a user
```ts
const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, slotDuration, programId);

const obligation = await kaminoMarket!.getUserVanillaObligation(user);

// to check the reserve is used in the obligation
const isReservePartOfObligation = kaminoMarket!.isReserveInObligation(obligation, reserve);
```

### Getting a list of user obligations for a specific reserve
```ts
const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, slotDuration, programId);

const obligations = await kaminoMarket!.getAllUserObligationsForReserve(user, reserve);
```

### Getting a list of user obligations for a specific reserve with caching
1. Fetch all user obligations, this should be cached as it takes longer to fetch
```ts
const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, slotDuration, programId);

const allUserObligations = await kaminoMarket!.getAllUserObligations(user);
```

```ts
allUserObligations.forEach(obligation  => {
  if (obligation !== null) {
    for (const deposits of obligation.deposits.keys()) {
      if (deposits.equals(reserve)) {
        finalObligations.push(obligation);
      }
    }
    for (const borrows of obligation.borrows.keys()) {
      if (borrows.equals(reserve)) {
        finalObligations.push(obligation);
      }
    }
  }
});
```

## CLI

### Depositing

```sh
yarn cli deposit --url <RPC> --owner ./keypair.json --token USDH --amount 10
yarn cli deposit --url <RPC> --owner ./keypair.json --token SOL --amount 10
```

### Printing all lending markets

The following will **print all lending markets' raw account data JSONs**:

```sh
yarn cli print-all-lending-market-accounts --rpc <RPC>
```

The output is a stream of consecutive JSON documents, which makes it appropriate for further processing using `jq`. Use
`yarn`'s `-s` option to skip the yarn version metadata from garbling the JSON output - e.g. the following will **print
the autodeleverage enabled flag of every market, one per line**:

```sh
yarn -s cli print-all-lending-market-accounts --rpc <RPC> | jq '.autodeleverageEnabled'
```

### Printing all reserves

The following will **print all reserves' raw account data JSONs**:

```sh
yarn cli print-all-reserve-accounts --rpc <RPC>
```

The output is a stream of consecutive JSON documents, which makes it appropriate for further processing using `jq`. Use
`yarn`'s `-s` option to skip the yarn version metadata from garbling the JSON output - e.g. the following will **print
the last update slot of every reserve, one per line**:

```sh
yarn -s cli print-all-reserve-accounts --rpc <RPC> | jq '.lastUpdate.slot'
```

### Printing all obligations

The following will **print all obligations' raw account data JSONs**:

```sh
yarn cli print-all-obligation-accounts --rpc <RPC>
```

The output is a stream of consecutive JSON documents, which makes it appropriate for further processing using `jq`, with
the following gotchas:
- use `yarn`'s `-s` option to skip the yarn version metadata from garbling the JSON output,
- use `jq`'s `--stream` mode to avoid buffering the entire output.

With this in mind, the following will **print the last update slot of every obligation, one per line**:

```sh
yarn -s cli print-all-obligation-accounts --rpc <RPC> | jq -cn --stream 'fromstream(1|truncate_stream(inputs)) | .lastUpdate.slot'
```

## Codegen
* Copy the new `idl` from the kamino-lending program to `src/idl.json`
* `yarn codegen`
