import { Address, getAddressEncoder, getProgramDerivedAddress, isNone, none, Option } from '@solana/kit';
import { KaminoMarket, KaminoObligation } from '../classes';
import { DEFAULT_PUBLIC_KEY } from './pubkey';

const addressEncoder = getAddressEncoder();

export type ObligationType = VanillaObligation | MultiplyObligation | LendingObligation | LeverageObligation;

export enum ObligationTypeTag {
  Vanilla = 0,
  Multiply = 1,
  Lending = 2,
  Leverage = 3,
}

export type InitObligationArgsModel = {
  tag: number;
  id: number;
  seed1: Address;
  seed2: Address;
};

export class VanillaObligation {
  readonly programId: Address;
  readonly id: number;
  static tag = 0;

  constructor(programId: Address, id?: number) {
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: VanillaObligation.tag,
      id: this.id,
      seed1: DEFAULT_PUBLIC_KEY,
      seed2: DEFAULT_PUBLIC_KEY,
    };

    return initObligationArgs;
  }

  toPda(market: Address, user: Address) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export class MultiplyObligation {
  readonly collToken: Address;
  readonly debtToken: Address;
  readonly programId: Address;
  readonly id: number;
  static tag = 1;

  constructor(collToken: Address, debtToken: Address, programId: Address, id?: number) {
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

  toPda(market: Address, user: Address) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export class LeverageObligation {
  readonly collToken: Address;
  readonly debtToken: Address;
  readonly programId: Address;
  readonly id: number;
  static tag = 3;

  constructor(collToken: Address, debtToken: Address, programId: Address, id?: number) {
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

  toPda(market: Address, user: Address) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export class LendingObligation {
  readonly token: Address;
  readonly programId: Address;
  readonly id: number;
  static tag = 2;

  constructor(token: Address, programId: Address, id?: number) {
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

  toPda(market: Address, user: Address) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export async function getObligationPdaWithArgs(
  market: Address,
  user: Address,
  args: InitObligationArgsModel,
  programId: Address
): Promise<Address> {
  const seeds = [
    Buffer.from([args.tag]),
    Buffer.from([args.id]),
    addressEncoder.encode(user),
    addressEncoder.encode(market),
    addressEncoder.encode(args.seed1),
    addressEncoder.encode(args.seed2),
  ];
  const [obligationAddress, _obligationAddressBump] = await getProgramDerivedAddress({
    seeds,
    programAddress: programId,
  });
  return obligationAddress;
}

export function getObligationType(
  kaminoMarket: KaminoMarket,
  obligationTag: ObligationTypeTag,
  mintAddress1: Option<Address> = none(),
  mintAddress2: Option<Address> = none()
): ObligationType {
  switch (obligationTag) {
    case VanillaObligation.tag: {
      return new VanillaObligation(kaminoMarket.programId);
    }
    case MultiplyObligation.tag: {
      if (isNone(mintAddress1)) {
        throw new Error(`Multiply obligation PDA requires mint address 1`);
      }
      if (isNone(mintAddress2)) {
        throw new Error(`Multiply obligation PDA requires mint address 2`);
      }
      return new MultiplyObligation(mintAddress1.value, mintAddress2.value, kaminoMarket.programId);
    }
    case LeverageObligation.tag: {
      if (isNone(mintAddress1)) {
        throw new Error(`Leverage obligation PDA requires mint address 1`);
      }
      if (isNone(mintAddress2)) {
        throw new Error(`Leverage obligation PDA requires mint address 2`);
      }
      return new LeverageObligation(mintAddress1.value, mintAddress2.value, kaminoMarket.programId);
    }
    case LendingObligation.tag: {
      if (isNone(mintAddress1)) {
        throw new Error(`Lending obligation PDA requires mint address 1`);
      }
      return new LendingObligation(mintAddress1.value, kaminoMarket.programId);
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
