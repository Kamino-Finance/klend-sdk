use anchor_lang::{
    Discriminator,
    __private::bytemuck::{from_bytes, AnyBitPattern},
};
use anyhow::Result;
use solana_sdk::account::Account;

// utils
pub fn read_zero_copy_account<T: AnyBitPattern + Discriminator>(data: &Account) -> Result<&T> {
    if data.data.len() < T::discriminator().len() + std::mem::size_of::<T>() {
        anyhow::bail!("Account data too small");
    }
    if data.data[0..8] != T::discriminator() {
        anyhow::bail!("Discriminator mismatch");
    }
    Ok(from_bytes(&data.data[8..]))
}
