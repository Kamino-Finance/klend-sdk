async function getVaultUserPnl(): Promise<void> {
  const kvaultPubkey = 'HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E'; // vault address
  const ownerPubkey = 'AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As'; // user address

  const API_BASE_URL = 'https://api.kamino.finance';

  const url = `${API_BASE_URL}/kvaults/${kvaultPubkey}/users/${ownerPubkey}/pnl`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json(); // Response 200: array of metric points
  console.log(data);
}

getVaultUserPnl().catch(console.error);
