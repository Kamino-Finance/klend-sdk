export function getEnvOrThrow(envVarName: string) {
  if (envVarName in process.env) {
    return process.env[envVarName] as string;
  }
  throw Error(`${envVarName} environment variable does not exist`);
}

export type ExampleFlashBorrowType = 'coll' | 'debt';

export function getFlashBorrowTypeFromEnv(): ExampleFlashBorrowType | undefined {
  const value = process.env.FLASH_BORROW_TYPE;
  if (value === undefined || value === '') {
    return undefined;
  }
  if (value === 'coll' || value === 'debt') {
    return value;
  }
  throw new Error(`FLASH_BORROW_TYPE must be "coll" or "debt", got "${value}"`);
}
