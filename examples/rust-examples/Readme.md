# KLend - Rust examples

This crate showcase basic logic to create instructions for the KLend program.

**Warning:** The examples do not implement any of the advanced logic required for real world usage, they are provided without any guarantee. For example there is no logic to select appropriate compute unit budget or cost and no retry logic implemented.

## Requirements and dependencies

The tool link directly to the smart contract code published on github. This implies locked dependencies and maximum rust version of the client:

- Rust 1.74.1
- Solana dependencies (program/sdk/client...) 1.17.18
- Anchor 0.29.0

## Mac OS users

If you are running on a Mac (Apple Silicon), you need to target `x86_64` to have the same default memory alignment than solana 1.17.x branch used by KLend. To do so you need:

1. Have Rosetta 2 installed.
2. Set the rust target of this repository (or your project) to `x86_64`. You can do so by running `rustup override set 1.74.1-x86_64-apple-darwin`

## Development state

These example are a work in progress.
At the moment only deposit of liquidity to mint ctokens and redeem of ctokens for liquidity are presented.
