import { PublicKey, Connection } from '@solana/web3.js';
import BN from 'bn.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from '@coral-xyz/borsh'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from '../types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from '../programId';

export interface VaultStateFields {
  adminAuthority: PublicKey;
  baseVaultAuthority: PublicKey;
  baseVaultAuthorityBump: BN;
  tokenMint: PublicKey;
  tokenMintDecimals: BN;
  tokenVault: PublicKey;
  sharesMint: PublicKey;
  sharesMintDecimals: BN;
  tokenAvailable: BN;
  sharesIssued: BN;
  performanceFeeBps: BN;
  managementFeeBps: BN;
  pendingFees: BN;
  lastFeeChargeSlot: BN;
  prevAum: BN;
  vaultAllocationStrategy: Array<types.VaultAllocationFields>;
  padding: Array<BN>;
}

export interface VaultStateJSON {
  adminAuthority: string;
  baseVaultAuthority: string;
  baseVaultAuthorityBump: string;
  tokenMint: string;
  tokenMintDecimals: string;
  tokenVault: string;
  sharesMint: string;
  sharesMintDecimals: string;
  tokenAvailable: string;
  sharesIssued: string;
  performanceFeeBps: string;
  managementFeeBps: string;
  pendingFees: string;
  lastFeeChargeSlot: string;
  prevAum: string;
  vaultAllocationStrategy: Array<types.VaultAllocationJSON>;
  padding: Array<string>;
}

export class VaultState {
  readonly adminAuthority: PublicKey;
  readonly baseVaultAuthority: PublicKey;
  readonly baseVaultAuthorityBump: BN;
  readonly tokenMint: PublicKey;
  readonly tokenMintDecimals: BN;
  readonly tokenVault: PublicKey;
  readonly sharesMint: PublicKey;
  readonly sharesMintDecimals: BN;
  readonly tokenAvailable: BN;
  readonly sharesIssued: BN;
  readonly performanceFeeBps: BN;
  readonly managementFeeBps: BN;
  readonly pendingFees: BN;
  readonly lastFeeChargeSlot: BN;
  readonly prevAum: BN;
  readonly vaultAllocationStrategy: Array<types.VaultAllocation>;
  readonly padding: Array<BN>;

  static readonly discriminator = Buffer.from([228, 196, 82, 165, 98, 210, 235, 152]);

  static readonly layout = borsh.struct([
    borsh.publicKey('adminAuthority'),
    borsh.publicKey('baseVaultAuthority'),
    borsh.u64('baseVaultAuthorityBump'),
    borsh.publicKey('tokenMint'),
    borsh.u64('tokenMintDecimals'),
    borsh.publicKey('tokenVault'),
    borsh.publicKey('sharesMint'),
    borsh.u64('sharesMintDecimals'),
    borsh.u64('tokenAvailable'),
    borsh.u64('sharesIssued'),
    borsh.u64('performanceFeeBps'),
    borsh.u64('managementFeeBps'),
    borsh.u64('pendingFees'),
    borsh.u64('lastFeeChargeSlot'),
    borsh.u64('prevAum'),
    borsh.array(types.VaultAllocation.layout(), 10, 'vaultAllocationStrategy'),
    borsh.array(borsh.u128(), 256, 'padding'),
  ]);

  constructor(fields: VaultStateFields) {
    this.adminAuthority = fields.adminAuthority;
    this.baseVaultAuthority = fields.baseVaultAuthority;
    this.baseVaultAuthorityBump = fields.baseVaultAuthorityBump;
    this.tokenMint = fields.tokenMint;
    this.tokenMintDecimals = fields.tokenMintDecimals;
    this.tokenVault = fields.tokenVault;
    this.sharesMint = fields.sharesMint;
    this.sharesMintDecimals = fields.sharesMintDecimals;
    this.tokenAvailable = fields.tokenAvailable;
    this.sharesIssued = fields.sharesIssued;
    this.performanceFeeBps = fields.performanceFeeBps;
    this.managementFeeBps = fields.managementFeeBps;
    this.pendingFees = fields.pendingFees;
    this.lastFeeChargeSlot = fields.lastFeeChargeSlot;
    this.prevAum = fields.prevAum;
    this.vaultAllocationStrategy = fields.vaultAllocationStrategy.map((item) => new types.VaultAllocation({ ...item }));
    this.padding = fields.padding;
  }

  static async fetch(c: Connection, address: PublicKey, programId: PublicKey = PROGRAM_ID): Promise<VaultState | null> {
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
    programId: PublicKey = PROGRAM_ID
  ): Promise<Array<VaultState | null>> {
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

  static decode(data: Buffer): VaultState {
    if (!data.slice(0, 8).equals(VaultState.discriminator)) {
      throw new Error('invalid account discriminator');
    }

    const dec = VaultState.layout.decode(data.slice(8));

    return new VaultState({
      adminAuthority: dec.adminAuthority,
      baseVaultAuthority: dec.baseVaultAuthority,
      baseVaultAuthorityBump: dec.baseVaultAuthorityBump,
      tokenMint: dec.tokenMint,
      tokenMintDecimals: dec.tokenMintDecimals,
      tokenVault: dec.tokenVault,
      sharesMint: dec.sharesMint,
      sharesMintDecimals: dec.sharesMintDecimals,
      tokenAvailable: dec.tokenAvailable,
      sharesIssued: dec.sharesIssued,
      performanceFeeBps: dec.performanceFeeBps,
      managementFeeBps: dec.managementFeeBps,
      pendingFees: dec.pendingFees,
      lastFeeChargeSlot: dec.lastFeeChargeSlot,
      prevAum: dec.prevAum,
      vaultAllocationStrategy: dec.vaultAllocationStrategy.map(
        (item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) =>
          types.VaultAllocation.fromDecoded(item)
      ),
      padding: dec.padding,
    });
  }

  toJSON(): VaultStateJSON {
    return {
      adminAuthority: this.adminAuthority.toString(),
      baseVaultAuthority: this.baseVaultAuthority.toString(),
      baseVaultAuthorityBump: this.baseVaultAuthorityBump.toString(),
      tokenMint: this.tokenMint.toString(),
      tokenMintDecimals: this.tokenMintDecimals.toString(),
      tokenVault: this.tokenVault.toString(),
      sharesMint: this.sharesMint.toString(),
      sharesMintDecimals: this.sharesMintDecimals.toString(),
      tokenAvailable: this.tokenAvailable.toString(),
      sharesIssued: this.sharesIssued.toString(),
      performanceFeeBps: this.performanceFeeBps.toString(),
      managementFeeBps: this.managementFeeBps.toString(),
      pendingFees: this.pendingFees.toString(),
      lastFeeChargeSlot: this.lastFeeChargeSlot.toString(),
      prevAum: this.prevAum.toString(),
      vaultAllocationStrategy: this.vaultAllocationStrategy.map((item) => item.toJSON()),
      padding: this.padding.map((item) => item.toString()),
    };
  }

  static fromJSON(obj: VaultStateJSON): VaultState {
    return new VaultState({
      adminAuthority: new PublicKey(obj.adminAuthority),
      baseVaultAuthority: new PublicKey(obj.baseVaultAuthority),
      baseVaultAuthorityBump: new BN(obj.baseVaultAuthorityBump),
      tokenMint: new PublicKey(obj.tokenMint),
      tokenMintDecimals: new BN(obj.tokenMintDecimals),
      tokenVault: new PublicKey(obj.tokenVault),
      sharesMint: new PublicKey(obj.sharesMint),
      sharesMintDecimals: new BN(obj.sharesMintDecimals),
      tokenAvailable: new BN(obj.tokenAvailable),
      sharesIssued: new BN(obj.sharesIssued),
      performanceFeeBps: new BN(obj.performanceFeeBps),
      managementFeeBps: new BN(obj.managementFeeBps),
      pendingFees: new BN(obj.pendingFees),
      lastFeeChargeSlot: new BN(obj.lastFeeChargeSlot),
      prevAum: new BN(obj.prevAum),
      vaultAllocationStrategy: obj.vaultAllocationStrategy.map((item) => types.VaultAllocation.fromJSON(item)),
      padding: obj.padding.map((item) => new BN(item)),
    });
  }
}
