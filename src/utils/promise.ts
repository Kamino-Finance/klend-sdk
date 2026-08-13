export async function raceSettledValues<T>(promises: Promise<T | undefined>[]): Promise<T | undefined> {
  const pendingResults = promises.map(settle);
  const rejectedReasons: unknown[] = [];

  while (pendingResults.length > 0) {
    const { index, result } = await Promise.race(
      pendingResults.map(async (pendingResult, index) => ({
        index,
        result: await pendingResult,
      }))
    );
    pendingResults.splice(index, 1);

    if (result.status === 'fulfilled') {
      if (result.value !== undefined) {
        return result.value;
      }
    } else {
      rejectedReasons.push(result.reason);
    }
  }

  if (rejectedReasons.length > 0) {
    throw rejectedReasons[0];
  }

  return undefined;
}

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason })
  );
}
