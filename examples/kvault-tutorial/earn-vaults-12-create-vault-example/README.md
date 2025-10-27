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

This directory contains three examples:

### Simple Example

`simpleExample.ts` demonstrates how to build vault creation instructions without signing or sending a transaction. This uses a noop signer and will output the instruction bundle without executing anything on-chain, which is useful for:
- Understanding what instructions are created
- Testing vault configuration parameters
- Development and debugging

To run:

```bash
yarn tsx simpleExample.ts
```

### Advanced Example (index.ts)

`index.ts` (or `advancedExample.ts`) demonstrates the complete flow of creating a vault, including:
- Loading your keypair from file
- Configuring vault parameters (fees, limits, etc.)
- Building and signing vault creation transaction
- Sending the transaction to the network
- Waiting for confirmation via HTTP polling
- Creating and populating the Lookup Table (LUT) in the background
- Displaying the vault address and transaction signatures

To run:

```bash
yarn start
```

or

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
- **Vault Token Name**: "My USDC Vault" (CUSTOMIZE THIS)
- **Min Deposit**: 1 USDC
- **Min Withdraw**: 1 USDC
- **Min Invest**: 4 USDC
- **Min Invest Delay**: 150 slots
- **Unallocated Weight**: 500
- **Unallocated Cap**: 2 USDC

**IMPORTANT**: Make sure to customize the vault name and token name to make them unique for your vault.

You can modify these values in the examples as needed.

## Expected Output

When running the advanced example, you should see output similar to:

```
🏦 Starting Kamino Vault Creation...

📍 Admin address: YourAddress...
🔨 Generating vault instructions...
✅ Vault instructions created
📍 Vault address: NewVaultAddress...
📦 Total instructions: 5
⏳ Getting fresh blockhash...
🌐 Blockhash: abc12345...
📊 Last valid height: 123456789
🔨 Building transaction...
✍️  Signing transaction...
✅ Transaction signed
📝 Transaction signature: YourSignature...
📤 Sending transaction (skipPreflight: true, maxRetries: 3)...
✅ Transaction sent successfully
⏳ Waiting for transaction confirmation...
✅ Transaction confirmed!
🎉 Vault created successfully!
🔗 Explorer: https://solscan.io/tx/YourSignature
🏦 Vault ID: YourVaultAddress

🔄 Starting LUT population (background)...
...
✅ LUT populated successfully!
```

You can view your transaction on Solscan using the provided URL.

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

## Next Steps

After creating your vault, you can:
- Use earn-vaults-04 example to deposit into your vault
- Use earn-vaults-05 example to withdraw from your vault
- Configure vault strategies and allocations
- Add markets to your vault for yield generation
