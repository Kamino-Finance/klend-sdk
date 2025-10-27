async function getAllVaults(): Promise<void> {
  const url = 'https://api.kamino.finance/kvaults/vaults';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  const vaults = await res.json(); // Response 200: array of vaults

  vaults.forEach((vault: any) => {
    console.log({
      address: vault.address,
      name: vault.state.name,
      tokenMint: vault.state.tokenMint,
      sharesIssued: vault.state.sharesIssued,
      tokenAvailable: vault.state.tokenAvailable,
    });
  });
}

getAllVaults().catch(console.error);
