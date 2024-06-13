#!/bin/bash

function print_args {

  # kamino
  echo "--account GKnHiWh3RRrE1zsNzWxRkomymHc374TvJPSTv2wPeYdB deps/kamino/global-config.json"
  # mainnet version may be out-of-sync with the localnet .so, but to dump the mainnet idl run: `solana account -u m -o "./deps/kamino/idl.json" --output json "7CCg9Pt2QofuDhuMRegeQAmB6CGGozx8E3x8mbZ18m3H"` and update the owner in the json to "E6qbhrt4pFmCotNUSSEh6E5cRQCEJpMcd79Z56EG9KY"
  echo "--account Fh5hZtAxz2iRXhJEkiEEmXDwg9WsytFNsv36UkAbp47n deps/kamino/idl.json" # Add IDL to improve solana explorer ux - use the latest idl to match the dumped program

  # klend
  echo "--account 8qLKwp1fk8WyqmzarkuMeZEX3AzL4VDSmA2UZTKT2aCJ deps/klend/idl-mainnet.json" # Add IDL to improve solana explorer ux - use the latest idl to match the dumped program

  # pyth
  echo "--account Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD deps/pyth/Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD.json"

  # address lookup table
  echo "--account 33EucPaS4a588jJJn1Ld3Ka9ye15VpgRLvjVTEPtZLCa deps/lookup/33EucPaS4a588jJJn1Ld3Ka9ye15VpgRLvjVTEPtZLCa.json"

  # switchboard
  echo "--account Fi8vncGpNKbq62gPo56G4toCehWNy77GgqGkTaAF5Lkk deps/switchboard/idl.json" # required by switchboard sdk
  echo "--account 2bpwkRWDEXHWYNBDddKssz6te82zCqwLR8qhR2acUtep deps/switchboard/2bpwkRWDEXHWYNBDddKssz6te82zCqwLR8qhR2acUtep.json"
  echo "--account GeKKsopLtKy6dUWfJTHJSSjFTuMagFmKyuq2FHUWDkhU deps/switchboard/kUSDH-USDC_orca.json"

  # fake pyth
  echo "--account H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG deps/prices/H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG.json"
  echo "--account E4v1BBgoso9s64TQvmyownAVJbhbEPGyzA3qn4n46qj9 deps/prices/E4v1BBgoso9s64TQvmyownAVJbhbEPGyzA3qn4n46qj9.json"
  echo "--account Bt1hEbY62aMriY1SyQqbeZbm8VmSbQVGBFzSzMuVNWzN deps/prices/Bt1hEbY62aMriY1SyQqbeZbm8VmSbQVGBFzSzMuVNWzN.json"
  echo "--account 5EFzYTGXnK2h6XJFZ4Mwc9sp7unoGsLLmYszZ3tmyMbi deps/prices/sol-20usd.json"
  echo "--account 1111111ogCyDbaRMvkdsHB3qfdyFYaG1WtRUAfdh deps/prices/sol-2usd.json"
  echo "--account 1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM deps/prices/sol-1usd.json"
  echo "--account 111111193m4hAxmCcGXMfnjVPfNhWSjb69sDgffKu deps/prices/stsol-20usd.json"
  echo "--account EFzHrtRNoeLiAwd6rRWfeMuEup19UC9UB4rcky8kXsgV deps/prices/usdc-1usd.json"
  echo "--account JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB deps/prices/eth_usd.json"
  echo "--account GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU deps/prices/btc_usd.json"
  echo "--account 3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL deps/prices/usdt_usd.json"

  # farms
  echo "--account 6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL deps/farms/6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL.json"
  echo "--account Ey7rZRLbKdhDqcUuSpAkApk3S3dK7RHoKPJST1RRVJAp deps/farms/idl-mainnet.json" # Add IDL to improve solana explorer ux - use the latest idl to match the dumped program

  # scope
  echo "--account AWUuZ6o4ZJX2fDqjUqDaA1pfHenZ6XEbmuTamMgM911E deps/scope/idl-mainnet.json"     # Add IDL to improve solana explorer ux - use the latest idl to match the dumped program
  echo "--account AdTiP7QyjUyv6crF4H8z7fxJKU7Z5eCAGvJN1Y55cXxb deps/scope/hubble_config.json"   # Hubble feed config
  echo "--account Chpu5ZgfWX5ZzVpUx9Xvv4WPM75Xd7zPJNDPsFnCpLpk deps/scope/oracle_mappings.json" # Oracle mapping
  echo "--account GbpsVomudPRRwmqfTmo3MYQVTikPG6QXxqpzJexA1JRb deps/scope/oracle_twaps.json"    # Oracle twaps
  echo "--account 7GPTptkZg7DXkNhTTKcEND3zADkgu8ZM31PkAMXgq1Yd deps/scope/mints_to_scope_chain.json"

  # jlp
  echo "--account 5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq deps/scope/jlp_pool.json"
  echo "--account 7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz deps/scope/jlp_custody_1.json"
  echo "--account AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn deps/scope/jlp_custody_2.json"
  echo "--account 5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm deps/scope/jlp_custody_3.json"
  echo "--account G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa deps/scope/jlp_custody_4.json"
  echo "--account 4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk deps/scope/jlp_custody_5.json"
  echo "--account 27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4 deps/scope/jlp_mint.json"

  #jitosol spl
  echo "--account Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb deps/scope/jitosol_spl_stake.json"

  # programs
  echo "--bpf-program E6qbhrt4pFmCotNUSSEh6E5cRQCEJpMcd79Z56EG9KY ./deps/programs/kamino.so" # built with localnet and integration_test features
  echo "--bpf-program HFn8GnPADiny6XqUoWE8uRPPxb29ikn4yTuPa9MF2fWJ ./deps/programs/scope.so"
  echo "--bpf-program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD ./deps/programs/kamino_lending.so"
  echo "--bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s ./deps/programs/metaplex.so"
  echo "--bpf-program devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH ./deps/programs/raydium.so" # taken from hubble-common
  echo "--bpf-program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc ./deps/programs/whirlpool.so"
  echo "--bpf-program FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr ./deps/programs/farms.so"

  # scope
  echo "--clone 3NJYftD5sjVfxSnUdZ1wVML8f3aC6mp1CXCL6L7TnU8C -u m"

  # options
  echo "--reset --quiet"
}

print_args
