use anchor_lang::{InstructionData, ToAccountMetas};
use kamino_lending::{
    utils::{maybe_null_pk, seeds::pda::lending_market_auth},
    Reserve,
};
use solana_sdk::{instruction::Instruction, pubkey::Pubkey};

pub fn refresh_reserve_ix(reserve_pubkey: Pubkey, reserve: &Reserve) -> Instruction {
    Instruction {
        program_id: kamino_lending::ID,
        data: kamino_lending::instruction::RefreshReserve {}.data(),
        accounts: kamino_lending::accounts::RefreshReserve {
            lending_market: reserve.lending_market,
            reserve: reserve_pubkey,
            pyth_oracle: maybe_null_pk(reserve.config.token_info.pyth_configuration.price),
            switchboard_price_oracle: maybe_null_pk(
                reserve
                    .config
                    .token_info
                    .switchboard_configuration
                    .price_aggregator,
            ),
            switchboard_twap_oracle: maybe_null_pk(
                reserve
                    .config
                    .token_info
                    .switchboard_configuration
                    .twap_aggregator,
            ),
            scope_prices: maybe_null_pk(reserve.config.token_info.scope_configuration.price_feed),
        }
        .to_account_metas(None),
    }
}

/// Creates a `DepositReserveLiquidity` instruction
///
/// # Arguments
///
/// * `reserve_pubkey` - The public key of the reserve to which liquidity is to be deposited
/// * `reserve` - A reference to the `Reserve` struct containing reserve details
/// * `deposit_amount` - The amount of liquidity to deposit
/// * `depositor` - The public key of the account initiating the deposit
///  (shall be the owner of the liquidity token account and signer of the transaction)
/// * `depositor_liquidity_token_account` - The public key of the token account from which liquidity will be taken
/// * `depositor_collateral_token_account` - The public key of the token account where the minted collateral will be sent
pub fn deposit_reserve_liquidity_ix(
    reserve_pubkey: Pubkey,
    reserve: &Reserve,
    deposit_amount: u64,
    depositor: Pubkey,
    depositor_liquidity_token_account: Pubkey,
    depositor_collateral_token_account: Pubkey,
) -> Instruction {
    Instruction {
        program_id: kamino_lending::ID,
        data: kamino_lending::instruction::DepositReserveLiquidity {
            liquidity_amount: deposit_amount,
        }
        .data(),
        accounts: kamino_lending::accounts::DepositReserveLiquidity {
            owner: depositor,
            reserve: reserve_pubkey,
            lending_market: reserve.lending_market,
            lending_market_authority: lending_market_auth(&reserve.lending_market),
            reserve_liquidity_mint: reserve.liquidity.mint_pubkey,
            reserve_liquidity_supply: reserve.liquidity.supply_vault,
            reserve_collateral_mint: reserve.collateral.mint_pubkey,
            user_source_liquidity: depositor_liquidity_token_account,
            user_destination_collateral: depositor_collateral_token_account,
            collateral_token_program: anchor_spl::token::ID,
            liquidity_token_program: reserve.liquidity.token_program,
            instruction_sysvar_account: solana_sdk::sysvar::instructions::id(),
        }
        .to_account_metas(None),
    }
}

/// Creates a `RedeemReserveCollateral` instruction
///
/// # Arguments
///
/// * `reserve_pubkey` - The public key of the reserve from which liquidity is to be withdrawn
/// * `reserve` - A reference to the `Reserve` struct containing reserve details
/// * `withdraw_amount` - The amount of collaterarl to withdraw.
/// * `withdrawer` - The public key of the account initiating the withdrawal
///   (shall be the owner of the collateral token account and signer of the transaction)
/// * `withdrawer_collateral_token_account` - The public key of the token account where the withdrawn collateral are taken from
/// * `withdrawer_liquidity_token_account` - The public key of the token account where the withdrawn liquidity will be sent
pub fn redeem_reserve_collateral_ix(
    reserve_pubkey: Pubkey,
    reserve: &Reserve,
    withdraw_amount: u64,
    withdrawer: Pubkey,
    withdrawer_collateral_token_account: Pubkey,
    withdrawer_liquidity_token_account: Pubkey,
) -> Instruction {
    Instruction {
        program_id: kamino_lending::ID,
        data: kamino_lending::instruction::RedeemReserveCollateral {
            collateral_amount: withdraw_amount,
        }
        .data(),
        accounts: kamino_lending::accounts::RedeemReserveCollateral {
            owner: withdrawer,
            reserve: reserve_pubkey,
            lending_market: reserve.lending_market,
            lending_market_authority: lending_market_auth(&reserve.lending_market),
            reserve_liquidity_mint: reserve.liquidity.mint_pubkey,
            reserve_liquidity_supply: reserve.liquidity.supply_vault,
            reserve_collateral_mint: reserve.collateral.mint_pubkey,
            user_source_collateral: withdrawer_collateral_token_account,
            user_destination_liquidity: withdrawer_liquidity_token_account,
            collateral_token_program: anchor_spl::token::ID,
            liquidity_token_program: reserve.liquidity.token_program,
            instruction_sysvar_account: solana_sdk::sysvar::instructions::id(),
        }
        .to_account_metas(None),
    }
}
