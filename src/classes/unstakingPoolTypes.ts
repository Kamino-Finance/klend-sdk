import { Instruction, KeyPairSigner } from '@solana/kit';

export type InitPoolIxs = {
  initPoolIxs: Instruction[];
  populateLUTIxs: Instruction[];
};

export type MintIxs = {
  // Should return unstake ticket creation ix + mint ix
  mintIxs: Instruction[];
  additionalSigners: KeyPairSigner[];
};
