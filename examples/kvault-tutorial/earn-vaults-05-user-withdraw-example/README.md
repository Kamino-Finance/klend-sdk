# Earn Vaults 05 - User Withdraw Example

These examples demonstrate how to withdraw USDC from a Kamino Vault using the K-LEND SDK

## Prerequisites

- Node.js v22 or higher
- Yarn package manager
- A Solana keypair file
- Vault shares in your wallet to withdraw
- SOL for transaction fees

## Setup

### 1. Install dependencies

From the repository root, build the SDK:

```bash
cd /path/to/klend-sdk
yarn install
yarn build
```

Then install dependencies for this example:

```bash
cd examples/kvault-tutorial/earn-vaults-05-user-withdraw-example
yarn install
```

### 2. Configure environment variables

Create a `.env` file in this directory:

```bash
cp .env.example .env
```

Edit the `.env` file and set your keypair path:

```
KEYPAIR_FILE='/Users/yourusername/.config/solana/id.json'
```

### 3. Generate a keypair (if needed)

If you don't have a Solana keypair, create one using [Solana CLI](https://solana.com/docs/intro/installation).

```bash
solana-keygen new
```

Important: Save the seed phrase and fund the wallet with SOL before running the example.

## Running the Examples

This directory contains two examples:

### Simple Example

`simpleExample.ts` demonstrates how to build withdraw instructions without signing or sending a transaction. This uses a noop signer and will output the withdraw instruction bundle without executing anything on-chain, which is useful for:
- Understanding what instructions are created
- Testing without spending tokens

To run:

```bash
yarn tsx simpleExample.ts
```

### Advanced Example (Transaction Execution)

`advancedExample.ts` demonstrates the complete flow of withdrawing from a vault, this will:
- Load your keypair from file
- Connect to the USDC vault
- Build and sign a withdraw transaction for 1.0 share
- Send the transaction to the network
- Wait for confirmation (up to 30 seconds)
- Confirming via HTTP polling
- Display the transaction signature

To run:

```bash
yarn tsx advancedExample.ts
```

## Preset Values

`advancedExample.ts` is configured for:
- **Network**: Solana Mainnet (`https://api.mainnet-beta.solana.com`)
- **Vault**: `HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E` (USDC vault)
- **Amount**: 1.0 share

You can modify these values in `advancedExample.ts` as needed.

## Expected Output

```
Withdraw successful! Signature: Your_Transaction_Signature
```

You can view your transaction on Solscan:
```
https://solscan.io/tx/Your_Transaction_Signature
```

## Troubleshooting

#### Error: KEYPAIR_FILE environment variable does not exist

Ensure you've created a `.env` file in this directory with the `KEYPAIR_FILE` variable set.

#### Error: Wallet file not found

Check that the path in your `.env` file points to a valid keypair file.

#### Transaction fails with insufficient funds

Ensure your wallet has:
- Vault shares to withdraw
- Enough SOL for transaction fees (approximately 0.001 SOL)

#### Error: No instructions returned

Ensure you have vault shares deposited. You need to deposit first before you can withdraw.
