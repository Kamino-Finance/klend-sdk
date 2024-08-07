# Kamino Lending SDK Typescript examples 

### Table of contents
- [How to run](#how-to-run)
    * [Setup](#setup)
- [Examples](#examples)
    + [Get loan LTV](#get-loan-ltv)
    + [Get loan value (deposited/borrowed/net value)](#get-loan-value--deposited-borrowed-net-value-)
    + [Get user loans](#get-user-loans)
    + [Get list of market reserves](#get-list-of-market-reserves)
    + [Get reserve APY (supply/borrow/rewards APY)](#get-reserve-apy--supply-borrow-rewards-apy-)
    + [Get reserve APY history](#get-reserve-apy-history)
    + [Get reserve caps](#get-reserve-caps)
    + [Get reserve total supplied and borrowed](#get-reserve-total-supplied-and-borrowed)


## How to run
Make sure to define the `RPC_ENDPOINT` environment variable with your RPC URL.


### Setup

```bash
cd klend-sdk/examples
yarn install
export RPC_ENDPOINT=YOUR_RPC_URL_HERE
```

## Examples

#### Get loan LTV
```bash
yarn run loan-ltv
```

#### Get loan value (deposited/borrowed/net value)
```bash
yarn run loan-value
```

#### Get user loans
```bash
yarn run user-loans
```

#### Get list of market reserves
```bash
yarn run market-reserves
```

#### Get reserve APY (supply/borrow/rewards APY)
```bash
yarn run reserve-apy
```

#### Get reserve rewards APY
```bash
yarn run reserve-rewards-apy
```

#### Get reserve APY history
```bash
yarn run reserve-apy-history
```

#### Get reserve caps
```bash
yarn run reserve-caps
```

#### Get reserve total supplied and borrowed
```bash
yarn run reserve-supply-borrow
```
