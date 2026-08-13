# Breaking Changes: `epic_fixed_rates_cherry_picked` vs `master`

This document lists all breaking changes for consumers upgrading from the current `master` to the `epic_fixed_rates_cherry_picked` branch.

---

## 1. Reserve lookups now use reserve address instead of mint

Because a market can now have multiple reserves for the same mint (float-rate + one or more fixed-rate), most methods that accepted a **mint address** now accept a **reserve address**.

### KaminoMarket

| Removed / Changed | Replacement |
|---|---|
| `getReserveByMint(mint)` | `getReservesByMint(mint)` (returns array), or `getFloatRateReserveByMint(mint)` for the float-rate reserve, or `getReserveByMintAndKind(mint, reserveKind)` |
| `getExistingReserveByMint(mint)` | `getExistingReservesByMint(mint)`, `getExistingFloatRateReserveByMint(mint)`, or `getExistingReserveByMintAndKind(mint, kind)` |
| `getReserveBySymbol(symbol)` | `getReservesBySymbol(symbol)` (returns array), or `getFloatRateReserveBySymbol(symbol)`, or `getReserveBySymbolAndKind(symbol, kind)` |
| `getExistingReserveBySymbol(symbol)` | `getExistingReservesBySymbol(symbol)`, `getExistingFloatRateReserveBySymbol(symbol)`, or `getExistingReserveBySymbolAndKind(symbol, kind)` |
| `getObligationDepositByWallet(owner, mint, type)` | `getObligationDepositByWallet(owner, depositReserveAddress, type)` |
| `getObligationBorrowByWallet(owner, mint, type)` | `getObligationBorrowByWallet(owner, borrowReserveAddress, type)` |
| `getMaxLeverageForPair(collMint, debtMint)` | `getMaxLeverageForPair(collReserveAddress, debtReserveAddress)` |
| `getMaxAndLiquidationLtvAndBorrowFactorForPair(collMint, debtMint)` | `getMaxAndLiquidationLtvAndBorrowFactorForPair(collReserveAddress, debtReserveAddress)` |
| `getReserveFarmInfo(mint, ...)` | `getReserveFarmInfo(reserveAddress, ...)` |

### KaminoObligation

| Removed / Changed | Replacement |
|---|---|
| `getDepositByMint(mint)` | `getDepositByReserve(reserveAddress)` or `getDepositsByMint(mint)` (returns array) |
| `getBorrowByMint(mint)` | `getBorrowByReserve(reserveAddress)` or `getBorrowsByMint(mint)` (returns array) |
| `getMaxBorrowAmount(market, mint, ...)` | `getMaxBorrowAmount(market, reserveAddress, ...)` |

---

## 2. `slot` is now a required parameter

Many methods that previously fetched the slot internally now require it as an explicit argument. This avoids redundant RPC calls and ensures consistent slot usage across operations.

### KaminoMarket

| Method | Change |
|---|---|
| `getAllObligationsForMarket(tag?)` | `getAllObligationsForMarket(slot, tag?)` — `slot` is now first param |
| `batchGetAllObligationsForMarket(tag?)` | `batchGetAllObligationsForMarket(slot, tag?)` |
| `getAllObligationsByTag(tag, market)` | `getAllObligationsByTag(tag, market, slot)` — `slot` added |
| `getAllObligationsByDepositedReserve(reserve)` | `getAllObligationsByDepositedReserve(reserve, slot)` |
| `getAllObligationsByBorrowedReserve(reserve)` | `getAllObligationsByBorrowedReserve(reserve, slot)` |
| `getAllUserObligations(user, commitment?, slot?)` | `getAllUserObligations(user, slot, commitment?)` — `slot` moved to 2nd param, now required |
| `getAllUserObligationsForReserve(user, reserve)` | `getAllUserObligationsForReserve(user, reserve, slot)` |
| `getUserObligationsByTag(tag, user)` | `getUserObligationsByTag(tag, user, slot)` |
| `getMultipleObligationsByAddress(addresses)` | `getMultipleObligationsByAddress(addresses, slot)` |
| `getNumberOfObligations()` | `getNumberOfObligations(slot)` |
| `getTotalProductTvl(productType)` | `getTotalProductTvl(productType, slot)` |

---

## 3. KaminoAction — all builders now use a props object

Every static builder method on `KaminoAction` changed from positional arguments to a single props/options object. The `mint` parameter is replaced by `reserveAddress` in all cases.

| Method | Change summary |
|---|---|
| `KaminoAction.initialize(action, amount, mint, owner, market, obligation, ...)` | `KaminoAction.initialize({ action, amount, reserveAddress, owner, kaminoMarket, obligation, ... })` |
| `buildDepositTxns(market, amount, mint, owner, ...)` | `buildDepositTxns({ kaminoMarket, amount, reserveAddress, owner, ... })` |
| `buildBorrowTxns(market, amount, mint, owner, ...)` | `buildBorrowTxns({ kaminoMarket, amount, reserveAddress, owner, ... })` |
| `buildWithdrawTxns(market, amount, mint, owner, ...)` | `buildWithdrawTxns({ kaminoMarket, amount, reserveAddress, owner, ... })` |
| `buildRepayTxns(market, amount, mint, payer, ...)` | `buildRepayTxns({ kaminoMarket, amount, reserveAddress, payer, ... })` |
| `buildDepositAndBorrowTxns(market, depositAmount, depositMint, borrowAmount, borrowMint, ...)` | `buildDepositAndBorrowTxns({ kaminoMarket, depositAmount, depositReserveAddress, borrowAmount, borrowReserveAddress, ... })` |
| `buildDepositAndWithdrawV2Txns(...)` | `buildDepositAndWithdrawV2Txns({ ..., depositReserveAddress, withdrawReserveAddress, ... })` |
| `buildRepayAndWithdrawTxns(...)` | `buildRepayAndWithdrawTxns({ ..., repayReserveAddress, withdrawReserveAddress, ... })` |
| `buildRepayAndWithdrawV2Txns(...)` | `buildRepayAndWithdrawV2Txns({ ..., repayReserveAddress, withdrawReserveAddress, ... })` |
| `buildDepositReserveLiquidityTxns(...)` | `buildDepositReserveLiquidityTxns({ ..., reserveAddress, ... })` |
| `buildRedeemReserveCollateralTxns(...)` | `buildRedeemReserveCollateralTxns({ ..., reserveAddress, ... })` |
| `buildDepositObligationCollateralTxns(...)` | `buildDepositObligationCollateralTxns({ ..., reserveAddress, ... })` |
| `buildRefreshObligationTxns(...)` | `buildRefreshObligationTxns({ kaminoMarket, payer, obligation, ... })` |
| `buildRequestElevationGroupTxns(...)` | `buildRequestElevationGroupTxns({ kaminoMarket, owner, obligation, ... })` |
| `buildLiquidateObligationTxns(...)` | `buildLiquidateObligationTxns({ ..., repayReserveAddress, withdrawReserveAddress, ... })` |
| `buildWithdrawReferrerFeesTxns(...)` | `buildWithdrawReferrerFeesTxns({ kaminoMarket, reserveAddress, owner, ... })` |

The props types are exported from `src/classes/actionTypes.ts` (e.g. `BuildDepositTxnsProps`, `BuildBorrowTxnsProps`, etc.).

### New fields on KaminoAction

- `luts: Address[]` — lookup table addresses for the action
- `postLendingIxs` / `postLendingIxsLabels` — instructions to execute after the lending ix (e.g. `setBorrowOrder`, rollover config)

---

## 4. KaminoVaultClient / KaminoManager — deposit signature changes

Vault deposit methods now require `farmState` and `flcFarmState` as explicit (non-optional) params.

### KaminoVaultClient

```typescript
// Before (master)
depositIxs(user, vault, tokenAmount, vaultReservesMap?, farmState?, payer?)

// After (epic)
depositIxs(user, vault, tokenAmount, vaultReservesMap, farmState: FarmState | null, flcFarmState: FarmState | null, payer?, memo?)
```

Same pattern applies to `KaminoManager.depositToVaultIxs(...)` and `KaminoVault.depositIxs(...)`.

### New vault methods

- `redeemInKindIxs(...)` — redeem vault shares for klend cTokens
- `withdrawAndRedeemInKindIfNeededIxs(...)` — instant withdraw + redeem-in-kind for the remainder
- `withdrawRedeemAndEnqueueIxs(...)` — full exit: withdraw + redeem + enqueue cTokens into klend withdraw queue
- `getMaxInstantWithdrawableAmount(...)` — query max instantly withdrawable amount
- `getWithdrawTicketsForUser(...)` — query pending withdrawal tickets

### New return fields

`WithdrawAndRedeemInKindIxs` and `WithdrawRedeemAndEnqueueIxs` now include `skippedShares: Decimal` — shares that couldn't be exited through either withdraw or redeem-in-kind.

---

## 5. New obligation types for fixed-rate

New `ObligationType` variants for fixed-rate obligations:

- `LendingObligationFixedRate`
- `LeverageObligationFixedRate`
- `MultiplyObligationFixedRate`

These use **reserve addresses** (not mints) as seeds, since multiple reserves can share the same mint.

---

## 6. Reserve kind system

New `ReserveKind` abstraction exported from `src/utils/ReserveKind.ts`:

- `FloatRateReserveKind` — standard variable-rate reserve (debtTermSeconds = 0)
- `FixedRateReserveKind(debtTermSeconds, borrowRateBps)` — fixed-term reserve
- `MaturityTimestampReserveKind(maturityTimestamp)` — maturity-timestamp reserve

Use `reserve.getKind()` to inspect a reserve's kind. Use the kind classes with `getReserveByMintAndKind(mint, kind)` to look up specific reserves.

---

## 7. New KaminoAction builders and features

### New builder methods

| Method | Description |
|---|---|
| `buildWithdrawFromObligationAndEnqueueTxns(props)` | Withdraw collateral + enqueue into klend's withdrawal queue |
| `buildDepositAndSetBorrowOrderTxns(props)` | Deposit + set a borrow order in a single action |
| `buildSetBorrowOrderIxs(owner, market, obligation, borrowOrder, ...)` | Set/cancel a borrow order on an obligation |
| `buildFillBorrowOrderIx(payer, market, obligation, reserve)` | Fill a borrow order |
| `buildEnqueueToWithdrawIx(owner, market, reserve, amount, ...)` | Enqueue a withdrawal request |
| `buildWithdrawQueuedLiquidityIx(payer, market, reserve, ticket, ...)` | Process a withdrawal ticket (permissionless) |
| `buildBorrowRolloverConfigIxs(props)` | Configure auto-rollover settings for fixed-rate borrows |

### Borrow order and rollover support

`buildBorrowTxns` and `buildDepositAndBorrowTxns` now accept an optional `rollOver: boolean` prop to automatically configure rollover for fixed-rate borrows.

### Obligation ownership transfer (klend v1.19.0)

- `buildInitiateObligationOwnershipTransferIx(...)` — current owner initiates
- `buildApproveObligationOwnershipTransferIx(...)` — global admin approves
- `buildAcceptObligationOwnershipIx(...)` — pending owner accepts (ownership transfers)
- `buildAbortObligationOwnershipTransferIx(...)` — current owner aborts while in Initiated state

---

## 8. KaminoReserve — new methods

| Method | Description |
|---|---|
| `calculateBorrowAPRFixedRate()` | Returns the fixed borrow APR for a fixed-rate reserve (throws for float-rate) |
| `totalBorrowAPYFixedRate()` | Returns the fixed borrow APY (compounded from `calculateBorrowAPRFixedRate`) |
| `getKind(): ReserveKind` | Returns the reserve's kind (float, fixed-rate, or maturity-timestamp) |
| `getWithdrawTicketsForUser(user)` | Returns active withdrawal queue tickets for a user on this reserve |

---

## 9. KaminoObligation — new methods

| Method | Description |
|---|---|
| `calculateEarlyRepayPenalty(reserveAddress, market, currentSlot)` | Computes the early repay penalty for a fixed-term borrow, mirroring the on-chain `calculate_early_repay_penalty` logic |
| `getSimulatedObligationStatsForBorrowOrderFill(...)` | Simulates obligation stats after a borrow order is filled |
| `simulateObligationStats(...)` (static) | Core obligation simulation extracted as a static helper — can be used without an on-chain obligation |
| `simulateDepositChange(...)` / `simulateBorrowChange(...)` (static) | Simulation helpers refactored to static methods |

`getMaxWithdrawAmount()` is now withdrawal-queue aware.

---

## 10. CDN client changes

- `fetchKaminoCdnData()` (from `src/utils/readCdnData.ts`) is removed
- Replaced by `KaminoCdnClient` class in `src/classes/cdnClient.ts` with a module-level `kaminoCdn` singleton
- Types `AllKaminoCdnData`, `KaminoCdnData` are now exported from `src/classes/cdnClient.ts`

---

## 11. New WebSocket subscription infrastructure

New classes for real-time account monitoring (non-breaking, additive):

- `AccountSubscriptionManager` — generic WebSocket subscription manager
- `ObligationListener`, `ReserveListener`, `BalanceListener` — domain-specific listeners
- `BorrowOrderFillListener` — listens for borrow order fill events

---

## 12. Token-2022 ScaledUiAmountConfig support

`KaminoReserve` now has:

- `getScaledUiAmountMultiplier()` — returns the Token-2022 ScaledUiAmountConfig multiplier (1 for standard mints)
- `getScaledBorrowedAmount()`, `getScaledLiquidityAvailableAmount()`, `getScaledTotalSupply()`, etc. — display-oriented getters that apply the multiplier

New utility `fetchScaledUiAmountMultipliers(rpc, mintAddresses)` exported from `src/utils/scaledUiAmount.ts`.

---

## Migration cheat sheet

```typescript
// Reserve lookup: mint → reserve address
// Before:
const reserve = market.getReserveByMint(usdcMint);
// After (float-rate):
const reserve = market.getFloatRateReserveByMint(usdcMint);
// After (specific kind):
const reserve = market.getReserveByMintAndKind(usdcMint, new FixedRateReserveKind(termSeconds, rateBps));

// KaminoAction builders: positional args → props object
// Before:
const axn = await KaminoAction.buildDepositTxns(market, amount, mint, owner, obligation, useV2, ...);
// After:
const axn = await KaminoAction.buildDepositTxns({
  kaminoMarket: market,
  amount,
  reserveAddress: reserve.address,
  owner,
  obligation,
  useV2Ixs: true,
});

// Obligation lookups: mint → reserve address
// Before:
obligation.getDepositByMint(mint);
obligation.getBorrowByMint(mint);
// After:
obligation.getDepositByReserve(reserveAddress);
obligation.getBorrowByReserve(reserveAddress);
// Or if you still need by-mint (returns array now):
obligation.getDepositsByMint(mint);
obligation.getBorrowsByMint(mint);

// Slot is now required on bulk queries:
// Before:
const obligations = await market.getAllObligationsForMarket();
// After:
const slot = await rpc.getSlot().send();
const obligations = await market.getAllObligationsForMarket(slot);

// Vault deposits: optional farm → required null
// Before:
await manager.depositToVaultIxs(user, vault, amount);
// After:
const reserves = await manager.loadVaultReserves(vaultState);
await manager.depositToVaultIxs(user, vault, amount, reserves, farmState, null);
```