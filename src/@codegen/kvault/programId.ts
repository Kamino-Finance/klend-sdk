import { address, Address } from "@solana/kit"

// Program ID passed with the cli --program-id flag when running the code generator. Do not edit, it will get overwritten.
export const PROGRAM_ID_CLI = address(
  "KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd"
)

// This constant will not get overwritten on subsequent code generations and it's safe to modify it's value.
export const PROGRAM_ID: Address = PROGRAM_ID_CLI
