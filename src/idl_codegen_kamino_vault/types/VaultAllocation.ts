import { PublicKey } from '@solana/web3.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from 'bn.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from '../types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from '@coral-xyz/borsh';

export interface VaultAllocationFields {
  reserve: PublicKey;
  targetAllocationWeight: BN;
  cTokenAllocation: BN;
  tokenTargetAllocation: BN;
  /** Maximum token invested in this reserve */
  tokenAllocationCap: BN;
}

export interface VaultAllocationJSON {
  reserve: string;
  targetAllocationWeight: string;
  cTokenAllocation: string;
  tokenTargetAllocation: string;
  /** Maximum token invested in this reserve */
  tokenAllocationCap: string;
}

export class VaultAllocation {
  readonly reserve: PublicKey;
  readonly targetAllocationWeight: BN;
  readonly cTokenAllocation: BN;
  readonly tokenTargetAllocation: BN;
  /** Maximum token invested in this reserve */
  readonly tokenAllocationCap: BN;

  constructor(fields: VaultAllocationFields) {
    this.reserve = fields.reserve;
    this.targetAllocationWeight = fields.targetAllocationWeight;
    this.cTokenAllocation = fields.cTokenAllocation;
    this.tokenTargetAllocation = fields.tokenTargetAllocation;
    this.tokenAllocationCap = fields.tokenAllocationCap;
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.publicKey('reserve'),
        borsh.u64('targetAllocationWeight'),
        borsh.u64('cTokenAllocation'),
        borsh.u64('tokenTargetAllocation'),
        borsh.u64('tokenAllocationCap'),
      ],
      property
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new VaultAllocation({
      reserve: obj.reserve,
      targetAllocationWeight: obj.targetAllocationWeight,
      cTokenAllocation: obj.cTokenAllocation,
      tokenTargetAllocation: obj.tokenTargetAllocation,
      tokenAllocationCap: obj.tokenAllocationCap,
    });
  }

  static toEncodable(fields: VaultAllocationFields) {
    return {
      reserve: fields.reserve,
      targetAllocationWeight: fields.targetAllocationWeight,
      cTokenAllocation: fields.cTokenAllocation,
      tokenTargetAllocation: fields.tokenTargetAllocation,
      tokenAllocationCap: fields.tokenAllocationCap,
    };
  }

  toJSON(): VaultAllocationJSON {
    return {
      reserve: this.reserve.toString(),
      targetAllocationWeight: this.targetAllocationWeight.toString(),
      cTokenAllocation: this.cTokenAllocation.toString(),
      tokenTargetAllocation: this.tokenTargetAllocation.toString(),
      tokenAllocationCap: this.tokenAllocationCap.toString(),
    };
  }

  static fromJSON(obj: VaultAllocationJSON): VaultAllocation {
    return new VaultAllocation({
      reserve: new PublicKey(obj.reserve),
      targetAllocationWeight: new BN(obj.targetAllocationWeight),
      cTokenAllocation: new BN(obj.cTokenAllocation),
      tokenTargetAllocation: new BN(obj.tokenTargetAllocation),
      tokenAllocationCap: new BN(obj.tokenAllocationCap),
    });
  }

  toEncodable() {
    return VaultAllocation.toEncodable(this);
  }
}
