async function getUserAllVaultsCumulativePositionsHistory(): Promise<void> {
  const ownerPubkey = 'AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As'; // user address

  const API_BASE_URL = 'https://api.kamino.finance';

  const params = new URLSearchParams({
    start: '1970-01-01T00:00:00.000Z', // or epoch ms string like "0"
    end: '2025-11-20T00:00:00.000Z',
  }).toString();

  const url = `${API_BASE_URL}/kvaults/users/${ownerPubkey}/metrics/history?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json(); // Response 200: array of metric points
  console.log(data);
}

getUserAllVaultsCumulativePositionsHistory().catch(console.error);
