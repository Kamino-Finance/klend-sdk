# Earn Vaults 12 - Create Vault Example

These examples demonstrate how to create a new Kamino Vault using the K-LEND SDK

## Prerequisites

- Node.js v22 or higher
- Yarn package manager
- A Solana keypair file (will be vault admin)
- SOL for transaction fees (approximately 0.02-0.05 SOL for vault creation)

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
cd examples/kvault-tutorial/earn-vaults-12-create-vault-example
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

`simpleExample.ts` demonstrates how to build vault creation instructions without signing or sending a transaction. This uses a noop signer and will output the instruction bundle without executing anything on-chain, which is useful for:
- Understanding what instructions are created
- Testing vault configuration parameters
- Development and debugging

To run:

```bash
yarn start
```

or

```bash
yarn tsx simpleExample.ts
```

### Advanced Example

`advancedExample.ts` demonstrates the complete flow of creating a vault, including:
- Loading your keypair from file
- Configuring vault parameters (fees, limits, etc.)
- Building and signing vault creation transaction
- Sending the transaction to the network
- Waiting for confirmation via HTTP polling
- Creating and populating the Lookup Table (LUT) in the background
- Displaying the vault address

To run:

```bash
yarn tsx advancedExample.ts
```

## Vault Configuration

The examples create a USDC vault with the following default configuration:

- **Token Mint**: USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
- **Performance Fee**: 15%
- **Management Fee**: 2%
- **Vault Name**: "MyCustomVault" (CUSTOMIZE THIS - must be unique)
- **Vault Token Symbol**: "USDC"
- **Vault Token Name**: "MyCustomVaultToken" (CUSTOMIZE THIS)
- **Min Deposit**: 1 USDC
- **Min Withdraw**: 1 USDC
- **Min Invest**: 1 USDC (vault starts investing immediately)
- **Min Invest Delay**: 150 slots
- **Unallocated Weight**: 500
- **Unallocated Cap**: 2 USDC

**IMPORTANT**: Make sure to customize the vault name and token name to make them unique for your vault.

You can modify these values in the examples as needed.

## Expected Output

### Simple Example
When running `yarn start` (simpleExample.ts), you should see:

```
Vault Address: <generated-vault-address>
Vault Creation Instructions: [Array of instructions]
```

### Advanced Example
When running `yarn tsx advancedExample.ts`, you should see:

```
Vault creation successful! Vault ID: <your-vault-address>
```

The LUT population happens silently in the background. You can verify your vault was created by checking it on Solscan or using the earn-vaults-13-get-all-vaults-example to see it in the list of all vaults.

## Lookup Table (LUT)

The vault creation process includes creating and populating a Lookup Table (LUT) for transaction optimization. The LUT population happens in the background after the vault is created, and the vault is functional immediately even if LUT population fails.

## Troubleshooting

#### Error: KEYPAIR_FILE environment variable does not exist

Ensure you've created a `.env` file in this directory with the `KEYPAIR_FILE` variable set.

#### Error: Wallet file not found

Check that the path in your `.env` file points to a valid keypair file.

#### Transaction fails with insufficient funds

Ensure your wallet has enough SOL for transaction fees (approximately 0.02-0.05 SOL for vault creation and LUT population).

#### Error: Vault name already exists

Vault names must be unique. Customize the `name` field in the `KaminoVaultConfig` to use a unique name for your vault.
