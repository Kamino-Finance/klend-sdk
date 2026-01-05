export function checkThat(evaluationResult: boolean, message: string = 'precondition failed'): void {
  if (!evaluationResult) {
    throw new Error(message);
  }
}

export function checkDefined<T>(value: T | undefined, message: string = 'value undefined'): T {
  checkThat(value !== undefined, message);
  return value as T;
}

export function checkNotNull<T>(value: T | null, message: string = 'value null'): T {
  checkThat(value !== null, message);
  return value as T;
}

export function getSingleElement<T>(iterable: Iterable<T>, nameWithinMessage: string = 'element'): T {
  const nothingReturnedMarker = {};
  let single: T | {} = nothingReturnedMarker;
  for (const element of iterable) {
    if (single === nothingReturnedMarker) {
      single = element;
    } else {
      throw new Error(`exactly one ${nameWithinMessage} expected, but multiple found`);
    }
  }
  if (single === nothingReturnedMarker) {
    throw new Error(`exactly one ${nameWithinMessage} expected, but none found`);
  }
  return single as T;
}
