# Kamino Lending SDK Typescript examples

### Table of contents

- [How to run](#how-to-run)
  - [Setup](#setup)
- [Examples](#examples)
  - [Get loan LTV](#get-loan-ltv)
  - [Get loan value (deposited/borrowed/net value)](#get-loan-value-depositedborrowednet-value)
  - [Get user loans](#get-user-loans)
  - [Get list of market reserves](#get-list-of-market-reserves)
  - [Get reserve APY (supply/borrow/rewards APY)](#get-reserve-apy-supplyborrowrewards-apy)
  - [Get reserve rewards APY](#get-reserve-rewards-apy)
  - [Get reserve APY history](#get-reserve-apy-history)
  - [Get reserve caps](#get-reserve-caps)les
  - [Get reserve total supplied and borrowed](#get-reserve-total-supplied-and-borrowed)
  - [Deposit in reserve to mint ctokens](#deposit-in-reserve-to-mint-ctokens)
  - [Burn ctokens to redeem tokens from reserve](#burn-ctokens-to-redeem-tokens-from-reserve)
  - [Deposit in obligation](#deposit-in-obligation)
  - [Borrow tokens from reserve](#borrow-from-single-reserve)
  - [Harvest farm rewards](#harvest-farm-rewards)
  - [Get obligations based on reserve filter](#get-obligations-based-on-reserve-filter)
  - [Inspect an obligation for swap examples](#inspect-an-obligation-for-swap-examples)
  - [Swap collateral in an existing obligation](#swap-collateral-in-an-existing-obligation)
  - [Swap debt in an existing obligation](#swap-debt-in-an-existing-obligation)
  - [Kvault examples](#kvault-examples)

## How to run

Make sure to define the `RPC` environment variable with your RPC URL.

### Setup

```bash
# 1) Build the SDK at the repo root FIRST. The examples consume it via "link:../" → dist/, so without a fresh
#    build they link stale/published code (e.g. they won't see unreleased changes).
cd klend-sdk
yarn build

# 2) Install example deps and configure the environment.
cd examples
yarn install
export RPC=YOUR_RPC_URL_HERE
```

> **Note:** the examples do **not** auto-load a `.env` file (there is no `dotenv` / `tsx --env-file` in the run
> scripts). Provide configuration either by exporting environment variables (`RPC`/`RPC_ENDPOINT`,
> and `KEYPAIR_FILE` for examples that send transactions) or by passing the equivalent CLI flags (`--rpc`,
> `--keypair`). The repo-root `.env.example` is for the test/dump tooling, not these examples.

## Examples

### Get loan info deposits / borrows

```bash
yarn tsx-node ./example_loan_info.ts
```

### Get loan value (deposited/borrowed/net value)

```bash
yarn run loan-value
```

### Get loan LTV

```bash
yarn run loan-ltv
```

### Get user loans

```bash
yarn run user-loans
```

### Get list of market reserves

```bash
yarn run market-reserves
```

### Get reserve APY (supply/borrow/rewards APY)

```bash
yarn run reserve-apy
```

### Get reserve rewards APY

```bash
yarn run reserve-rewards-apy
```

### Get reserve APY history

```bash
yarn run reserve-apy-history
```

### Get reserve caps

```bash
yarn run reserve-caps
```

### Get reserve total supplied and borrowed

```bash
yarn run reserve-supply-borrow
```

### Deposit in reserve to mint ctokens

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn run deposit-mint-ctokens
```

### Burn ctokens to redeem tokens from reserve

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn run burn-ctokens-redeem
```

### Deposit in obligation

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn run deposit-obligation
```

### Borrow from single reserve

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn run borrow-tokens
```

### Harvest farm rewards

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn run harvest-farm-reward
```

### Deposit multiply/leverage

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn multiply-deposit
```

### Withdraw multiply/leverage

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn multiply-withdraw
```

### Adjust multiply/leverage

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
yarn multiply-adjust
```

### Get multiply/leverage Loan info and PNL

```bash
yarn multiply-loan-info-and-pnl
```

### Get obligations based on reserve filter

```bash
yarn run get-obligations-based-on-reserve-filter
```

### Swap collateral from one token to another (print simulation)

```bash
export KEYPAIR_FILE=YOUR_PATH_TO_YOUR_KEYPAIR_FILE
tsx example_swap_coll_simulation.ts
```

### Inspect an obligation

```bash
yarn obligation-info -- \
  --rpc "$RPC" \
  --keypair /path/to/keypair.json \
  --obligation OBLIGATION_ADDRESS
```

### Swap collateral in an existing obligation

These examples route swaps with KSwap. They use the KLend market LUT, the user LUT, swap pair LUTs from the Kamino API, find-minimal LUTs, and any manual `--lookup-table` values. With `--send`, the user LUT is created or extended in setup transactions before the swap transaction.

Dry-run simulation:

```bash
yarn swap-collateral -- \
  --rpc "$RPC" \
  --keypair /path/to/keypair.json \
  --obligation OBLIGATION_ADDRESS \
  --source-coll-reserve SOURCE_COLL_RESERVE \
  --target-coll-reserve TARGET_COLL_RESERVE \
  --amount 1.0 \
  --slippage-bps 100
```

Via debt flash borrow:

```bash
yarn swap-collateral -- \
  --rpc "$RPC" \
  --keypair /path/to/keypair.json \
  --obligation OBLIGATION_ADDRESS \
  --source-coll-reserve SOURCE_COLL_RESERVE \
  --target-coll-reserve TARGET_COLL_RESERVE \
  --debt-reserve DEBT_RESERVE \
  --flash-borrow-token debt \
  --amount 1.0 \
  --slippage-bps 100
```

Append `--send` to broadcast after reviewing the simulation output.

### Swap debt in an existing obligation

These examples route swaps with KSwap. They use the KLend market LUT, the user LUT, swap pair LUTs from the Kamino API, find-minimal LUTs, and any manual `--lookup-table` values. With `--send`, the user LUT is created or extended in setup transactions before the swap transaction.

Dry-run simulation:

```bash
yarn swap-debt -- \
  --rpc "$RPC" \
  --keypair /path/to/keypair.json \
  --obligation OBLIGATION_ADDRESS \
  --source-debt-reserve SOURCE_DEBT_RESERVE \
  --target-debt-reserve TARGET_DEBT_RESERVE \
  --flash-borrow-token targetDebt \
  --amount 10 \
  --slippage-bps 100
```

Append `--send` to broadcast after reviewing the simulation output.

#### Swap debt of a multiply obligation (full or partial)

A multiply obligation's PDA is derived from `(collateral mint, debt mint)`, so its debt cannot be changed in place. `getSwapDebtIxs` detects the variable-rate Multiply (and Leverage) tag automatically and migrates the position into an obligation of the **same type** seeded with the new debt. Run it right after `yarn multiply-deposit`, which creates the JLP/USDC position this example swaps to JLP/USDG.

- **Full swap** (`--portion 100`, the default): repays the whole old debt, withdraws all collateral, empties the old obligation, and creates the new `(collateral, new debt)` obligation. Its elevation group is auto-selected for the pair (highest-LTV common multiply group, else group 0).
- **Partial swap** (`--portion <100`): repays that fraction of the old debt and moves the **same fraction of the collateral**, so the LTV is preserved on both sides. The old obligation stays alive (smaller); the target `(collateral, new debt)` obligation is **created if it does not exist, or grown if it already does**. A new target auto-selects its elevation group; an existing target keeps its current group (no silent regroup). A partial that would leave either obligation below the market's minimum net value, or the target above its max LTV, is rejected (no silent clamp).

```bash
yarn swap-debt-multiply -- \
  --rpc "$RPC" \
  --keypair /path/to/keypair.json \
  --obligation MULTIPLY_OBLIGATION_ADDRESS \
  --source-debt-reserve SOURCE_DEBT_RESERVE \
  --target-debt-reserve TARGET_DEBT_RESERVE \
  --flash-borrow-token sourceDebt \
  --portion 50 \
  --slippage-bps 100
```

Defaults target the JLP market: source debt = JLP-market USDC reserve, target debt = JLP-market USDG reserve. `--flash-borrow-token` selects which debt the flash loan is taken in: `sourceDebt` (default) flash-borrows the old debt and swaps late; `targetDebt` flash-borrows the new debt and swaps early — pick whichever reserve has deeper flash-loan liquidity. Both yield the same end position. The example prints a per-obligation **preview** (projected deposits/borrows, LTV, net value for both the old and new obligation) before simulating. Append `--send` to broadcast after reviewing the simulation output.

You can compute that preview yourself without building a transaction via `getSwapDebtObligationsPreview({ market, obligation, sourceDebtReserveAddress, targetDebtReserveAddress, sourceDebtSwapAmount, isClosingSourceDebt, slot: currentLedgerInstant.slot, currentLedgerInstant, referrer, slippagePct })`, which returns `{ old, new, moved }` — the projected `ObligationStats` (and deposits/borrows) for both obligations plus the moved amounts. Fetch `currentLedgerInstant` once with `getCurrentLedgerInstant(rpc, commitment)` using the same commitment as the loaded market/obligation state, then reuse it for the selector, preview, and transaction builder. It shares the SDK's exact sizing, so the previewed repay/collateral match execution (the new-debt borrow is an oracle-price estimate that the live swap quote refines).

### Kvault examples

See [kvault-examples/README.md](./kvault-examples/README.md) for vault-specific examples.
