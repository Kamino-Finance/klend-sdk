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
// There are three levels of data you can request (and cache) about the lending market.
// 1. Initalize market with parameters and metadata
const market = await KaminoMarket.load(
  connection,
  new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF") // main market address. Defaults to 'Main' market
);
console.log(market.reserves.map((reserve) => reserve.config.loanToValueRatio));

// 2. Refresh reserves
await market.loadReserves();

const usdcReserve = market.getReserve("USDC");
console.log(usdcReserve?.stats.totalDepositsWads.toString());


// Refresh all cached data
market.refreshAll();

const obligation = market.getObligationByWallet("WALLET_PK");
console.log(obligation.stats.borrowLimit);
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
  const kaminoMarket = await KaminoMarket.load(env.provider.connection, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId);

  const obligation = await kaminoMarket!.getUserVanillaObligation(user);

  // to check the reserve is used in the obligation
  const isReservePartOfObligation = kaminoMarket!.isReserveInObligation(obligation, reserve);
```

### Getting a list of user obligations for a specific reserve 
```ts
  const kaminoMarket = await KaminoMarket.load(env.provider.connection, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId);

  const obligations = await kaminoMarket!.getAllUserObligationsForReserve(user, reserve);
```

### Getting a list of user obligations for a specific reserve with caching
1. Fetch all user obligations, this should be cached as it takes longer to fetch
```ts
  const kaminoMarket = await KaminoMarket.load(env.provider.connection, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS, programId); 

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
* npx tsx src/client.ts deposit --url <RPC> --owner ./keypair.json --token USDH --amount 10
* npx tsx src/client.ts deposit --url <RPC> --owner ./keypair.json --token SOL --amount 10

## Codegen
* Copy the new `idl` from the kamino-lending program to `src/idl.json`
* `yarn codegen`
