async function getUserVaultPositionHistory(): Promise<void> {
  const kvaultPubkey = 'A2wsxhA7pF4B2UKVfXocb6TAAP9ipfPJam6oMKgDE5BK';
  const ownerPubkey = 'Ej51XVghq4KyzVCBT7butTPqGjJFns7zSqUR8sH6GdAA'; // user

  const API_BASE_URL = 'https://api.kamino.finance';

  const params = new URLSearchParams({
    start: '1970-01-01T00:00:00.000Z', // or epoch ms string like "0"
    end: '2025-10-01T00:00:00.000Z',
  }).toString();

  const url = `${API_BASE_URL}/kvaults/${kvaultPubkey}/users/${ownerPubkey}/metrics/history?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json(); // Response 200: array of metric points
  console.log(data);
}

getUserVaultPositionHistory().catch(console.error);
