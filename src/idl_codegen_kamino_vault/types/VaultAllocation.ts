import { PublicKey } from '@solana/web3.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from 'bn.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from '../types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from '@coral-xyz/borsh';

export interface VaultAllocationFields {
  reserve: PublicKey;
  targetAllocationWeight: BN;
  /** Maximum token invested in this reserve */
  tokenAllocationCap: BN;
  configPadding: Array<BN>;
  cTokenAllocation: BN;
  tokenTargetAllocation: BN;
  statePadding: Array<BN>;
}

export interface VaultAllocationJSON {
  reserve: string;
  targetAllocationWeight: string;
  /** Maximum token invested in this reserve */
  tokenAllocationCap: string;
  configPadding: Array<string>;
  cTokenAllocation: string;
  tokenTargetAllocation: string;
  statePadding: Array<string>;
}

export class VaultAllocation {
  readonly reserve: PublicKey;
  readonly targetAllocationWeight: BN;
  /** Maximum token invested in this reserve */
  readonly tokenAllocationCap: BN;
  readonly configPadding: Array<BN>;
  readonly cTokenAllocation: BN;
  readonly tokenTargetAllocation: BN;
  readonly statePadding: Array<BN>;

  constructor(fields: VaultAllocationFields) {
    this.reserve = fields.reserve;
    this.targetAllocationWeight = fields.targetAllocationWeight;
    this.tokenAllocationCap = fields.tokenAllocationCap;
    this.configPadding = fields.configPadding;
    this.cTokenAllocation = fields.cTokenAllocation;
    this.tokenTargetAllocation = fields.tokenTargetAllocation;
    this.statePadding = fields.statePadding;
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.publicKey('reserve'),
        borsh.u64('targetAllocationWeight'),
        borsh.u64('tokenAllocationCap'),
        borsh.array(borsh.u128(), 64, 'configPadding'),
        borsh.u64('cTokenAllocation'),
        borsh.u64('tokenTargetAllocation'),
        borsh.array(borsh.u128(), 64, 'statePadding'),
      ],
      property
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new VaultAllocation({
      reserve: obj.reserve,
      targetAllocationWeight: obj.targetAllocationWeight,
      tokenAllocationCap: obj.tokenAllocationCap,
      configPadding: obj.configPadding,
      cTokenAllocation: obj.cTokenAllocation,
      tokenTargetAllocation: obj.tokenTargetAllocation,
      statePadding: obj.statePadding,
    });
  }

  static toEncodable(fields: VaultAllocationFields) {
    return {
      reserve: fields.reserve,
      targetAllocationWeight: fields.targetAllocationWeight,
      tokenAllocationCap: fields.tokenAllocationCap,
      configPadding: fields.configPadding,
      cTokenAllocation: fields.cTokenAllocation,
      tokenTargetAllocation: fields.tokenTargetAllocation,
      statePadding: fields.statePadding,
    };
  }

  toJSON(): VaultAllocationJSON {
    return {
      reserve: this.reserve.toString(),
      targetAllocationWeight: this.targetAllocationWeight.toString(),
      tokenAllocationCap: this.tokenAllocationCap.toString(),
      configPadding: this.configPadding.map((item) => item.toString()),
      cTokenAllocation: this.cTokenAllocation.toString(),
      tokenTargetAllocation: this.tokenTargetAllocation.toString(),
      statePadding: this.statePadding.map((item) => item.toString()),
    };
  }

  static fromJSON(obj: VaultAllocationJSON): VaultAllocation {
    return new VaultAllocation({
      reserve: new PublicKey(obj.reserve),
      targetAllocationWeight: new BN(obj.targetAllocationWeight),
      tokenAllocationCap: new BN(obj.tokenAllocationCap),
      configPadding: obj.configPadding.map((item) => new BN(item)),
      cTokenAllocation: new BN(obj.cTokenAllocation),
      tokenTargetAllocation: new BN(obj.tokenTargetAllocation),
      statePadding: obj.statePadding.map((item) => new BN(item)),
    });
  }

  toEncodable() {
    return VaultAllocation.toEncodable(this);
  }
}
