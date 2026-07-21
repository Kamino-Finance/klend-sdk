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
import { address, createDefaultRpcTransport, createRpc, createSolanaRpcApi, DEFAULT_RPC_CONFIG } from '@solana/kit';
import { KaminoMarket, DEFAULT_RECENT_SLOT_DURATION_MS } from '@kamino-finance/klend-sdk';

const rpc = createRpc({
  api: createSolanaRpcApi({ ...DEFAULT_RPC_CONFIG, defaultCommitment: 'processed' }),
  transport: createDefaultRpcTransport({ url: 'https://api.mainnet-beta.solana.com' }),
});

// 1. Initialize market with parameters and metadata
const market = await KaminoMarket.load(
  rpc,
  address('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'), // main market address
  DEFAULT_RECENT_SLOT_DURATION_MS
);
if (!market) {
  throw new Error('Kamino market not found');
}
console.log(market.reserves.map((reserve) => reserve.stats.loanToValue));

// 2. Refresh reserves
await market.loadReserves();

const usdcReserve = market.getReserve('USDC');
console.log(usdcReserve?.stats.totalDepositsWads.toString());

// Refresh all cached data
market.refreshAll();

const obligation = market.getObligationByWallet(address('WALLET_PK'));
console.log(obligation?.refreshedStats.borrowLimit);
```

### Perform lending action

```typescript
const kaminoAction = await KaminoAction.buildDepositTxns(
  kaminoMarket,
  amountBase,
  symbol,
  new VanillaObligation(PROGRAM_ID),
);

const env = await initEnv('mainnet-beta');
await sendTransactionFromAction(env, sendTransaction); // sendTransaction from wallet adapter or custom
```

### Getting a vanilla obligation for a user
```ts
  const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId);

  const obligation = await kaminoMarket!.getUserVanillaObligation(userAddress);

  // to check the reserve is used in the obligation
  const isReservePartOfObligation = kaminoMarket!.isReserveInObligation(obligation, reserve);
```

### Getting a list of user obligations for a specific reserve 
```ts
  const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId);

  const obligations = await kaminoMarket!.getAllUserObligationsForReserve(userAddress, reserve);
```

### Getting a list of user obligations for a specific reserve with caching
1. Fetch all user obligations, this should be cached as it takes longer to fetch
```ts
  const kaminoMarket = await KaminoMarket.load(rpc, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId); 

  const allUserObligations = await kaminoMarket!.getAllUserObligations(userAddress);
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

