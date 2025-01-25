import { PublicKey } from "@solana/web3.js"

// Program ID passed with the cli --program-id flag when running the code generator. Do not edit, it will get overwritten.
export const KVAULTS_PROGRAM_ID_CLI = new PublicKey(
  "kvauTFR8qm1dhniz6pYuBZkuene3Hfrs1VQhVRgCNrr"
)

// This constant will not get overwritten on subsequent code generations and it's safe to modify it's value.
export let KVAULTS_PROGRAM_ID: PublicKey = KVAULTS_PROGRAM_ID_CLI
export let PROGRAM_ID: PublicKey = KVAULTS_PROGRAM_ID_CLI

export const setKVaultsProgramId = (programId: PublicKey) => {
  KVAULTS_PROGRAM_ID = programId;
  PROGRAM_ID = programId;
}
