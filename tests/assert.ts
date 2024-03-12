import { SwapInputs, fuzzyEq, sleep } from '../src';
import { AssertionError, assert } from 'chai';
import Decimal from 'decimal.js';

export async function waitUntilMatches(condition: () => Promise<void>, waitMillis: number = 10_000): Promise<void> {
  const endTime = Date.now() + waitMillis;
  let lastErr: any = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await condition();
    } catch (e) {
      lastErr = e;
    }
    if (Date.now() > endTime) {
      console.log(`Condition not met within ${waitMillis}ms!`);
      throw lastErr;
    }
    console.log('Condition not met, retrying...');
    await sleep(100);
  }
}

export function assertFuzzyEq(actual: Decimal.Value, expected: Decimal.Value, epsilon = 0.0001): void {
  if (!fuzzyEq(actual, expected, epsilon)) {
    throw new AssertionError(`Expected approx ${expected}, got ${actual} (epsilon=${epsilon})`);
  }
}

export function assertSwapInputsMatch(a: SwapInputs, b: SwapInputs): void {
  assert.equal(a.inputAmountLamports, b.inputAmountLamports);
  assert(a.inputMint.equals(b.inputMint));
  assert(a.outputMint.equals(b.outputMint));
}
