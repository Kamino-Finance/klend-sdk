//! This example demonstrates how to deposit liquidity into a reserve (and mint collateral tokens)
//! and then redeem those collateral tokens back for the underlying asset.
//!
//! This example only performs a "dry_run" by simulating the transaction.
//!
//! Mandatory environment variables:
//! - `RPC_URL`: The URL of the Solana RPC endpoint.
//! - `USER_PUBKEY`: The public key of the user (in base58 format).
//! - `RESERVE_ADDRESS`: The address of the reserve to interact with.
//! - `DEPOSIT_AMOUNT`: The amount of liquidity to deposit into the reserve (in smallest unit, e.g., lamports for SOL).
//!
//! To run this example, use the command:
//! ```shell
//! # Set the environment variables accordingly
//! cargo run --example deposit_and_redeem
//! ```

use std::str::FromStr;

use anyhow::Result;
use base64::engine::{general_purpose::STANDARD as BS64, Engine};
use kamino_lending::Reserve;
use klend_client_examples::{
    instructions::{deposit_reserve_liquidity_ix, redeem_reserve_collateral_ix},
    states::read_zero_copy_account,
};
use solana_client::rpc_config::RpcSimulateTransactionConfig;
use solana_sdk::{
    commitment_config::CommitmentConfig, message::Message, pubkey::Pubkey, transaction::Transaction,
};

fn main() -> Result<()> {
    // Get environment variables
    let rpc_url =
        std::env::var("RPC_URL").map_err(|e| anyhow::anyhow!("Failed to get RPC_URL: {}", e))?;
    let user_pubkey_str = std::env::var("USER_PUBKEY")
        .map_err(|e| anyhow::anyhow!("Failed to get USER_PUBKEY: {}", e))?;
    let reserve_address = std::env::var("RESERVE_ADDRESS")
        .map_err(|e| anyhow::anyhow!("Failed to get RESERVE_ADDRESS: {}", e))?;
    let deposit_amount: u64 = std::env::var("DEPOSIT_AMOUNT")
        .map_err(|e| anyhow::anyhow!("Failed to get DEPOSIT_AMOUNT: {}", e))?
        .parse()
        .map_err(|e| anyhow::anyhow!("Failed to parse DEPOSIT_AMOUNT: {}", e))?;

    let reserve_pubkey = Pubkey::from_str(&reserve_address)?;
    let user_pubkey = Pubkey::from_str(&user_pubkey_str)?;

    // Note: use a sync client for convenience in examples, real world application usually prefer async clients
    let client = solana_client::rpc_client::RpcClient::new_with_commitment(
        rpc_url,
        CommitmentConfig::processed(),
    );

    // Get the reserve
    let reserve_account = client.get_account(&reserve_pubkey)?;
    let reserve: &Reserve = read_zero_copy_account(&reserve_account)?;

    // Prepare needed accounts
    let liquidity_token_program = reserve.liquidity.token_program;
    let user_liquidity_token_account =
        spl_associated_token_account::get_associated_token_address_with_program_id(
            &user_pubkey,
            &reserve.liquidity.mint_pubkey,
            &liquidity_token_program,
        );
    let user_collateral_token_account =
        spl_associated_token_account::get_associated_token_address_with_program_id(
            &user_pubkey,
            &reserve.collateral.mint_pubkey,
            &anchor_spl::token::ID,
        );

    // Prepare instructions
    let create_collateral_ata_ix =
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &user_pubkey,
            &user_pubkey,
            &reserve.collateral.mint_pubkey,
            &anchor_spl::token::ID,
        );

    let deposit_ix = deposit_reserve_liquidity_ix(
        reserve_pubkey,
        reserve,
        deposit_amount,
        user_pubkey,
        user_liquidity_token_account,
        user_collateral_token_account,
    );

    // Note: ideally, we should fetch the actual collateral balance but for simplicity,
    // we assume a rate of 0.8 since we want to deposit and redeem in the same transaction for this example
    let redeem_ix = redeem_reserve_collateral_ix(
        reserve_pubkey,
        reserve,
        deposit_amount * 8 / 10,
        user_pubkey,
        user_collateral_token_account,
        user_liquidity_token_account,
    );

    // Simulate transaction
    let tx = Transaction::new_unsigned(Message::new(
        &[create_collateral_ata_ix, deposit_ix, redeem_ix],
        Some(&user_pubkey),
    ));

    let simulation_result = client.simulate_transaction_with_config(
        &tx,
        RpcSimulateTransactionConfig {
            sig_verify: false,
            replace_recent_blockhash: true,
            ..Default::default()
        },
    )?;

    println!("Simulation result: {:#?}", simulation_result.value);
    let serialized_tx = tx.message.serialize();
    println!(
        "Serialized transaction (base64): {}",
        BS64.encode(serialized_tx)
    );

    Ok(())
}
