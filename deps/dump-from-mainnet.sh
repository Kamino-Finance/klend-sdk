#!/bin/bash

function dump {
  ## Programs

  ### scope
  solana program dump -u m "HFn8GnPADiny6XqUoWE8uRPPxb29ikn4yTuPa9MF2fWJ" "deps/programs/scope.so"
  ### klend
  solana program dump -u m "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD" "deps/programs/kamino_lending.so"
  ### farms
  solana program dump -u m "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr" "deps/programs/farms.so"

  ## dump latest idls to match the dumped program for the explorer

  ### scope
  solana account -u m -o "./deps/scope/idl-mainnet.json" --output json "AWUuZ6o4ZJX2fDqjUqDaA1pfHenZ6XEbmuTamMgM911E"
  ### klend
  solana account -u m -o "./deps/klend/idl-mainnet.json" --output json "8qLKwp1fk8WyqmzarkuMeZEX3AzL4VDSmA2UZTKT2aCJ"
  ### farms
  solana account -u m -o "./deps/farms/idl-mainnet.json" --output json "Ey7rZRLbKdhDqcUuSpAkApk3S3dK7RHoKPJST1RRVJAp"
}

dump
