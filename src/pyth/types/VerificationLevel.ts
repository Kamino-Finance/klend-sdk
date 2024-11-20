import * as types from '../types';
import * as borsh from '@coral-xyz/borsh';

export type PartialFields = { numSignatures: number };
export type PartialValue = { numSignatures: number };

export interface PartialJSON {
  kind: 'Partial';
  value: { numSignatures: number };
}

export class Partial {
  static readonly discriminator = 1;
  static readonly kind = 'Partial';
  readonly discriminator = 1;
  readonly kind = 'Partial';
  readonly value: PartialValue;

  constructor(value: PartialFields) {
    this.value = { numSignatures: value.numSignatures };
  }

  toJSON(): PartialJSON {
    return {
      kind: 'Partial',
      value: {
        numSignatures: this.value.numSignatures,
      },
    };
  }

  toEncodable() {
    return {
      Partial: {
        numSignatures: this.value.numSignatures,
      },
    };
  }
}

export interface FullJSON {
  kind: 'Full';
}

export class Full {
  static readonly discriminator = 1;
  static readonly kind = 'Full';
  readonly discriminator = 1;
  readonly kind = 'Full';

  toJSON(): FullJSON {
    return {
      kind: 'Full',
    };
  }

  toEncodable() {
    return {
      Full: {},
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.VerificationLevelKind {
  if (typeof obj !== 'object') {
    throw new Error('Invalid enum object');
  }

  if ('Partial' in obj) {
    return new Partial({ numSignatures: obj.Partial.numSignatures });
  }
  if ('Full' in obj) {
    return new Full();
  }

  throw new Error('Invalid enum object');
}

export function fromJSON(obj: types.VerificationLevelJSON): types.VerificationLevelKind {
  switch (obj.kind) {
    case 'Partial': {
      return new Partial({ numSignatures: obj.value.numSignatures });
    }
    case 'Full': {
      return new Full();
    }
  }
  throw new Error('Invalid enum object');
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([borsh.struct([borsh.u8('numSignatures')], 'Partial'), borsh.struct([], 'Full')]);
  if (property !== undefined) {
    return ret.replicate(property);
  }
  return ret;
}
