import { Address, getAddressEncoder, getProgramDerivedAddress, isNone, none, Option } from '@solana/kit';
import { KaminoMarket, KaminoObligation } from '../classes';
import { DEFAULT_PUBLIC_KEY } from './pubkey';

const addressEncoder = getAddressEncoder();

export type ObligationType =
  | VanillaObligation
  | MultiplyObligation
  | LendingObligation
  | LeverageObligation
  | MultiplyObligationFixedRate
  | LendingObligationFixedRate
  | LeverageObligationFixedRate;

export enum ObligationTypeTag {
  Vanilla = 0,
  Multiply = 1,
  Lending = 2,
  Leverage = 3,
  MultiplyFixedRate = 4,
  LendingFixedRate = 5,
  LeverageFixedRate = 6,
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

export class MultiplyObligationFixedRate {
  readonly collReserveAddress: Address;
  readonly debtReserveAddress: Address;
  readonly programId: Address;
  readonly id: number;
  static tag = 4;

  constructor(collReserveAddress: Address, debtReserveAddress: Address, programId: Address, id?: number) {
    this.collReserveAddress = collReserveAddress;
    this.debtReserveAddress = debtReserveAddress;
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: MultiplyObligationFixedRate.tag,
      id: this.id,
      seed1: this.collReserveAddress,
      seed2: this.debtReserveAddress,
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

export class LeverageObligationFixedRate {
  readonly collReserveAddress: Address;
  readonly debtReserveAddress: Address;
  readonly programId: Address;
  readonly id: number;
  static tag = 6;

  constructor(collReserveAddress: Address, debtReserveAddress: Address, programId: Address, id?: number) {
    this.collReserveAddress = collReserveAddress;
    this.debtReserveAddress = debtReserveAddress;
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: LeverageObligationFixedRate.tag,
      id: this.id,
      seed1: this.collReserveAddress,
      seed2: this.debtReserveAddress,
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
      id: this.id,
      seed1: this.token,
      seed2: this.token,
    };

    return initObligationArgs;
  }

  toPda(market: Address, user: Address) {
    return getObligationPdaWithArgs(market, user, this.toArgs(), this.programId);
  }
}

export class LendingObligationFixedRate {
  readonly reserveAddress: Address;
  readonly programId: Address;
  readonly id: number;
  static tag = 5;

  constructor(reserveAddress: Address, programId: Address, id?: number) {
    this.reserveAddress = reserveAddress;
    this.programId = programId;
    this.id = id ?? 0;
  }

  toArgs() {
    const initObligationArgs: InitObligationArgsModel = {
      tag: LendingObligationFixedRate.tag,
      id: this.id,
      seed1: this.reserveAddress,
      seed2: this.reserveAddress,
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

/**
 * Resolves the {@link ObligationType} subclass for the given tag.
 *
 * **Reserve-addresses only** (a single mint can map to a float-rate reserve plus multiple
 * fixed-rate reserves — mint alone is ambiguous). Variable-rate tags (1/2/3) derive their
 * mint seeds from the supplied reserve address via {@link KaminoMarket.getExistingReserveByAddress};
 * fixed-rate tags (4/5/6) use the reserve address directly as the seed.
 *
 * @param reserveAddress1 deposit/collateral reserve. Required for every non-Vanilla tag.
 * @param reserveAddress2 borrow/debt reserve. Required for Multiply/Leverage (variable and fixed-rate).
 */
export function getObligationType(
  kaminoMarket: KaminoMarket,
  obligationTag: ObligationTypeTag,
  reserveAddress1: Option<Address> = none(),
  reserveAddress2: Option<Address> = none()
): ObligationType {
  switch (obligationTag) {
    case VanillaObligation.tag: {
      return new VanillaObligation(kaminoMarket.programId);
    }
    case MultiplyObligation.tag: {
      if (isNone(reserveAddress1)) {
        throw new Error('MultiplyObligation PDA requires reserve address 1 (collateral)');
      }
      if (isNone(reserveAddress2)) {
        throw new Error('MultiplyObligation PDA requires reserve address 2 (debt)');
      }
      const collMint = kaminoMarket
        .getExistingReserveByAddress(reserveAddress1.value, 'Multiply collateral')
        .getLiquidityMint();
      const debtMint = kaminoMarket
        .getExistingReserveByAddress(reserveAddress2.value, 'Multiply debt')
        .getLiquidityMint();
      return new MultiplyObligation(collMint, debtMint, kaminoMarket.programId);
    }
    case LeverageObligation.tag: {
      if (isNone(reserveAddress1)) {
        throw new Error('LeverageObligation PDA requires reserve address 1 (collateral)');
      }
      if (isNone(reserveAddress2)) {
        throw new Error('LeverageObligation PDA requires reserve address 2 (debt)');
      }
      const collMint = kaminoMarket
        .getExistingReserveByAddress(reserveAddress1.value, 'Leverage collateral')
        .getLiquidityMint();
      const debtMint = kaminoMarket
        .getExistingReserveByAddress(reserveAddress2.value, 'Leverage debt')
        .getLiquidityMint();
      return new LeverageObligation(collMint, debtMint, kaminoMarket.programId);
    }
    case LendingObligation.tag: {
      if (isNone(reserveAddress1)) {
        throw new Error('LendingObligation PDA requires reserve address');
      }
      const mint = kaminoMarket.getExistingReserveByAddress(reserveAddress1.value, 'Lending').getLiquidityMint();
      return new LendingObligation(mint, kaminoMarket.programId);
    }
    case LendingObligationFixedRate.tag: {
      if (isNone(reserveAddress1)) {
        throw new Error('LendingObligationFixedRate PDA requires reserve address');
      }
      return new LendingObligationFixedRate(reserveAddress1.value, kaminoMarket.programId);
    }
    case MultiplyObligationFixedRate.tag: {
      if (isNone(reserveAddress1)) {
        throw new Error('MultiplyObligationFixedRate PDA requires reserve address 1 (collateral)');
      }
      if (isNone(reserveAddress2)) {
        throw new Error('MultiplyObligationFixedRate PDA requires reserve address 2 (debt)');
      }
      return new MultiplyObligationFixedRate(reserveAddress1.value, reserveAddress2.value, kaminoMarket.programId);
    }
    case LeverageObligationFixedRate.tag: {
      if (isNone(reserveAddress1)) {
        throw new Error('LeverageObligationFixedRate PDA requires reserve address 1 (collateral)');
      }
      if (isNone(reserveAddress2)) {
        throw new Error('LeverageObligationFixedRate PDA requires reserve address 2 (debt)');
      }
      return new LeverageObligationFixedRate(reserveAddress1.value, reserveAddress2.value, kaminoMarket.programId);
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
    case LendingObligationFixedRate.tag: {
      return new LendingObligationFixedRate(obligation.getDeposits()[0].reserveAddress, kaminoMarket.programId);
    }
    case MultiplyObligationFixedRate.tag: {
      return new MultiplyObligationFixedRate(
        obligation.getDeposits()[0].reserveAddress,
        obligation.getBorrows()[0].reserveAddress,
        kaminoMarket.programId
      );
    }
    case LeverageObligationFixedRate.tag: {
      return new LeverageObligationFixedRate(
        obligation.getDeposits()[0].reserveAddress,
        obligation.getBorrows()[0].reserveAddress,
        kaminoMarket.programId
      );
    }
    default: {
      throw new Error('Invalid obligation type');
    }
  }
}
