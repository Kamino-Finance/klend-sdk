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

## FAQ

## Client 
* npx ts-node src/client.ts deposit --url <RPC> --owner ./keypair.json --token USDH --amount 10
* npx ts-node src/client.ts deposit --url <RPC> --owner ./keypair.json --token SOL --amount 10

## Codegen 
* Copy the new `idl` from the kamino-lending program to `src/idl.json`
* `yarn codegen`

## Setup localnet 
* Ensure `deps` contains the correct `.so` you want to test against. Either build it from the main repo or dump it from mainnet
* `yarn start-validator`

## Run tests
* `yarn start-validator-and-test`
* Or, if the local validator is already running, `yarn test`

## TODO: 

Better sdk documentation

## Sync with smart contracts 
* Copy the program .so, idl and codegen
```sh
$ yarn
$ cp ../kamino-lending/target/deploy/kamino_lending.so deps/programs/kamino_lending.so
$ cp ../kamino-lending/target/idl/kamino_lending.json src/idl.json
$ yarn codegen
```
