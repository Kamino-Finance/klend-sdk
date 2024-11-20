import { PublicKey, Connection } from '@solana/web3.js';
import BN from 'bn.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from '@coral-xyz/borsh'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from '../types';

export const PYTH_RECEIVER_PROGRAM_ID = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ');

export interface PriceUpdateV2Fields {
  writeAuthority: PublicKey;
  verificationLevel: types.VerificationLevelKind;
  priceMessage: types.PriceFeedMessageFields;
  postedSlot: BN;
}

export interface PriceUpdateV2JSON {
  writeAuthority: string;
  verificationLevel: types.VerificationLevelJSON;
  priceMessage: types.PriceFeedMessageJSON;
  postedSlot: string;
}

export class PriceUpdateV2 {
  readonly writeAuthority: PublicKey;
  readonly verificationLevel: types.VerificationLevelKind;
  readonly priceMessage: types.PriceFeedMessage;
  readonly postedSlot: BN;

  // static readonly discriminator = Buffer.from([
  //   43, 242, 204, 202, 26, 247, 59, 127,
  // ])

  static readonly layout = borsh.struct([
    borsh.publicKey('writeAuthority'),
    borsh.u8('verificationLevel'),
    types.PriceFeedMessage.layout('priceMessage'),
    borsh.u64('postedSlot'),
  ]);

  constructor(fields: PriceUpdateV2Fields) {
    this.writeAuthority = fields.writeAuthority;
    this.verificationLevel = fields.verificationLevel;
    this.priceMessage = new types.PriceFeedMessage({ ...fields.priceMessage });
    this.postedSlot = fields.postedSlot;
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PYTH_RECEIVER_PROGRAM_ID
  ): Promise<PriceUpdateV2 | null> {
    const info = await c.getAccountInfo(address);

    if (info === null) {
      return null;
    }
    if (!info.owner.equals(programId)) {
      throw new Error("account doesn't belong to this program");
    }

    return this.decode(info.data);
  }

  static async fetchMultiple(
    c: Connection,
    addresses: PublicKey[],
    programId: PublicKey = PYTH_RECEIVER_PROGRAM_ID
  ): Promise<Array<PriceUpdateV2 | null>> {
    const infos = await c.getMultipleAccountsInfo(addresses);

    return infos.map((info) => {
      if (info === null) {
        return null;
      }
      if (!info.owner.equals(programId)) {
        throw new Error("account doesn't belong to this program");
      }

      return this.decode(info.data);
    });
  }

  static decode(data: Buffer): PriceUpdateV2 {
    const dec = PriceUpdateV2.layout.decode(data.slice(8));

    return new PriceUpdateV2({
      writeAuthority: dec.writeAuthority,
      verificationLevel: dec.verificationLevel,
      priceMessage: types.PriceFeedMessage.fromDecoded(dec.priceMessage),
      postedSlot: dec.postedSlot,
    });
  }

  toJSON(): PriceUpdateV2JSON {
    return {
      writeAuthority: this.writeAuthority.toString(),
      verificationLevel: this.verificationLevel.toJSON(),
      priceMessage: this.priceMessage.toJSON(),
      postedSlot: this.postedSlot.toString(),
    };
  }

  static fromJSON(obj: PriceUpdateV2JSON): PriceUpdateV2 {
    return new PriceUpdateV2({
      writeAuthority: new PublicKey(obj.writeAuthority),
      verificationLevel: types.VerificationLevel.fromJSON(obj.verificationLevel),
      priceMessage: types.PriceFeedMessage.fromJSON(obj.priceMessage),
      postedSlot: new BN(obj.postedSlot),
    });
  }
}
