import { PublicKey } from '@solana/web3.js';
import { KaminoMarket, KaminoObligation } from '../classes';

export type ObligationType = VanillaObligation | MultiplyObligation | LendingObligation;

export enum ObligationTypeTag {
  Vanilla = 0,
  Multiply = 1,
  Lending = 2,
  Leverage = 3,
}

export type InitObligationArgsModel = {
  tag: number;
  id: number;
  seed1: PublicKey;
  seed2: PublicKey;
};

export class VanillaObligation {
  readonly programId: PublicKey;
  readonly id: number;
  static tag = 0;

  constructor(programId: PublicKey, id?: number) {
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: VanillaObligation.tag,
      id: this.id,
      seed1: PublicKey.default,
      seed2: PublicKey.default,
    };

    return initObligationArgs;
  }

  toPda(market: PublicKey, user: PublicKey) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export class MultiplyObligation {
  readonly collToken: PublicKey;
  readonly debtToken: PublicKey;
  readonly programId: PublicKey;
  readonly id: number;
  static tag = 1;

  constructor(collToken: PublicKey, debtToken: PublicKey, programId: PublicKey, id?: number) {
    this.collToken = collToken;
    this.debtToken = debtToken;
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: MultiplyObligation.tag,
      id: this.id,
      seed1: this.collToken,
      seed2: this.debtToken,
    };

    return initObligationArgs;
  }

  toPda(market: PublicKey, user: PublicKey) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export class LeverageObligation {
  readonly collToken: PublicKey;
  readonly debtToken: PublicKey;
  readonly programId: PublicKey;
  readonly id: number;
  static tag = 3;

  constructor(collToken: PublicKey, debtToken: PublicKey, programId: PublicKey, id?: number) {
    this.collToken = collToken;
    this.debtToken = debtToken;
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: LeverageObligation.tag,
      id: this.id,
      seed1: this.collToken,
      seed2: this.debtToken,
    };

    return initObligationArgs;
  }

  toPda(market: PublicKey, user: PublicKey) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export class LendingObligation {
  readonly token: PublicKey;
  readonly programId: PublicKey;
  readonly id: number;
  static tag = 2;

  constructor(token: PublicKey, programId: PublicKey, id?: number) {
    this.token = token;
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: LendingObligation.tag,
      id: 0,
      seed1: this.token,
      seed2: this.token,
    };

    return initObligationArgs;
  }

  toPda(market: PublicKey, user: PublicKey) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export function getObligationPdaWithArgs(
  market: PublicKey,
  user: PublicKey,
  args: InitObligationArgsModel,
  programId: PublicKey
) {
  const seed = [
    Buffer.from([args.tag]),
    Buffer.from([args.id]),
    user.toBuffer(),
    market.toBuffer(),
    args.seed1.toBuffer(),
    args.seed2.toBuffer(),
  ];
  const [obligationAddress, _obligationAddressBump] = PublicKey.findProgramAddressSync(seed, programId);
  return obligationAddress;
}

export function getObligationType(
  kaminoMarket: KaminoMarket,
  obligationTag: ObligationTypeTag,
  mintAddress1: PublicKey = PublicKey.default,
  mintAddress2: PublicKey = PublicKey.default
): ObligationType {
  switch (obligationTag) {
    case VanillaObligation.tag: {
      return new VanillaObligation(kaminoMarket.programId);
    }
    case MultiplyObligation.tag: {
      return new MultiplyObligation(mintAddress1, mintAddress2, kaminoMarket.programId);
    }
    case LeverageObligation.tag: {
      return new LeverageObligation(mintAddress1, mintAddress2, kaminoMarket.programId);
    }
    case LendingObligation.tag: {
      return new LendingObligation(mintAddress1, kaminoMarket.programId);
    }
    default: {
      throw new Error('Invalid obligation type');
    }
  }
}

export function getObligationTypeFromObligation(
  kaminoMarket: KaminoMarket,
  obligation: KaminoObligation
): ObligationType {
  switch (obligation.obligationTag) {
    case VanillaObligation.tag: {
      return new VanillaObligation(kaminoMarket.programId);
    }
    case MultiplyObligation.tag: {
      return new MultiplyObligation(
        obligation.getDeposits()[0].mintAddress,
        obligation.getBorrows()[0].mintAddress,
        kaminoMarket.programId
      );
    }
    case LeverageObligation.tag: {
      return new LeverageObligation(
        obligation.getDeposits()[0].mintAddress,
        obligation.getBorrows()[0].mintAddress,
        kaminoMarket.programId
      );
    }
    case LendingObligation.tag: {
      return new LendingObligation(obligation.getDeposits()[0].mintAddress, kaminoMarket.programId);
    }
    default: {
      throw new Error('Invalid obligation type');
    }
  }
}
