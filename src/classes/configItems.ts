import { struct, Layout } from '@coral-xyz/borsh';
import { blobEquals, orThrow, toJson } from './utils';
import { Buffer } from 'buffer';

/**
 * An object literal specifying *all* "update mode" enum values (of type {@code M}) and their corresponding config items
 * (belonging to a top-level config struct {@code C}).
 *
 * An instance of this type is needed to construct a {@link ConfigUpdater}, as shown below.
 *
 * @example
 * ```
 * // Define the updater using a "map" - the line below would NOT compile if you forgot about any `StarWarsUpdateMode`:
 * const STAR_WARS_UPDATER = new ConfigUpdater(StarWarsUpdateMode.fromDecoded, StarWars, (config) => ({
 *   [StarWarsUpdateMode.ANewHope.kind]: config.aNewHope,
 *   [StarWarsUpdateMode.TheEmpireStrikesBack.kind]: config.theEmpireStrikesBack,
 *   [StarWarsUpdateMode.ReturnOfTheJedi.kind]: config.returnOfTheJedi,
 * }));
 * ```
 */
export type ConfigItemMap<M extends BorshEnum, C> = BorshEnumMap<M, SingleOrArray<ConfigItem<C, any>>>;

/**
 * As advertised.
 */
export type SingleOrArray<T> = T | T[];

/**
 * A set of everything required to create an update ix for a single config item of type {@code A} belonging to a
 * config object of type {@code C}.
 */
export type ConfigItem<C, A> = {
  readonly __layout: Layout<A>;
  readonly __getter: Getter<C, A>;
};

/**
 * A {@link ConfigItem} representing a borsh structure.
 *
 * Such structure may be used:
 * - either directly (i.e. a borsh-serialized "fat" config item, e.g. `ReserveConfig.borrowRateCurve`),
 * - or just to access its fields (e.g. `ReserveConfig.tokenInfo.pythConfiguration.price`).
 */
export type StructConfigItem<C, A extends Record<string, any>> = ConfigItem<C, A> & {
  [K in keyof A]: A[K] extends object ? StructConfigItem<C, A[K]> : ConfigItem<C, A>;
};

/**
 * A syntactic sugar allowing for auto-completion of values within {@link ConfigItemMap}.
 */
export type AnyConfigItem<C, A> = A extends Record<string, any> ? StructConfigItem<C, A> : ConfigItem<C, A>;

/**
 * A composite {@link ConfigItem}, allowing to encode multiple fields together.
 *
 * @example
 * ```
 *   ...
 *   [CartoonsUpdateMode.UpdateTomAndJerry.discriminator]: new CompositeConfigItem(
 *     CARTOONS.value().characters.cats.tom,
 *     CARTOONS.value().characters.rodents.jerry
 *   ),
 *   ...
 * ```
 */
export class CompositeConfigItem<C> implements ConfigItem<C, Record<string, any>> {
  readonly __layout: Layout<Record<string, any>>;
  readonly __getter: Getter<C, Record<string, any>>;

  constructor(...components: AnyConfigItem<C, any>[]) {
    this.__layout = struct<any>(components.map((component, index) => component.__layout.replicate(index.toString())));
    this.__getter = (config) =>
      Object.fromEntries(components.map((component, index) => [index.toString(), component.__getter(config)]));
  }
}

/**
 * Creates an array of config items - one per each element of the given array.
 *
 * An example use-case is `LendingMarket.elevationGroups[]`: to update all of them, we need N ixs:
 * - `updateLendingMarket(mode = ElevationGroup, value = elevationGroups[0])`
 * - `updateLendingMarket(mode = ElevationGroup, value = elevationGroups[1])`
 * - `updateLendingMarket(mode = ElevationGroup, value = elevationGroups[2])`
 * ...
 *
 * So: conceptually, the *array* is not "a config item". Each *slot* in that array is its own config item.
 */
export function arrayElementConfigItems<C, A>(arrayConfigItem: ConfigItem<C, A[]>): ConfigItem<C, A>[] {
  const arrayGetter = arrayConfigItem.__getter;
  const wrappedSequenceLayout = arrayConfigItem.__layout as any;
  const sequenceLayout = wrappedSequenceLayout.layout?.fields?.[0];
  if (sequenceLayout === undefined) {
    throw new Error(`unexpected layout of the input array config item: ${toJson(wrappedSequenceLayout, true)}`);
  }
  return new Array(sequenceLayout.count)
    .fill(sequenceLayout.elementLayout as Layout<A>)
    .map((elementLayout, index) => ({
      __layout: elementLayout,
      __getter: (config) => arrayGetter(config)[index],
    }));
}

/**
 * A constructor reference of a borsh structure.
 */
export interface BorshStructClass<C> {
  new (...args: any[]): C;
  layout: any;
}

/**
 * A missing common type for borsh enums, which borsh should really have provided itself.
 */
export interface BorshEnum {
  kind: string;
}

/**
 * A part of a {@link ConfigUpdater} responsible for a single config item.
 */
export class ConfigItemUpdater<C, A> {
  constructor(private readonly item: ConfigItem<C, A>) {}

  /**
   * Returns a serialized value of the specific config item extracted from the given top-level {@code newConfig}, or
   * `undefined` if the value has not changed from the given {@code currentConfig}.
   */
  encodeUpdatedItemFrom(currentConfig: C | undefined, newConfig: C): Uint8Array | undefined {
    const getter = this.item.__getter;
    const newItemValue = this.encodeItem(getter(newConfig));
    if (currentConfig === undefined) {
      return newItemValue;
    }
    if (blobEquals(newItemValue, this.encodeItem(getter(currentConfig)))) {
      return undefined;
    }
    return newItemValue;
  }

  /**
   * Borsh-serializes the given value.
   *
   * Only exposed for some legacy callers which still construct the update ixs manually (in tests).
   */
  encodeItem(item: A): Uint8Array {
    return encodeUsingLayout(this.item.__layout, item);
  }
}

/**
 * A resolver of config item changes.
 */
export class ConfigUpdater<M extends BorshEnum, C> {
  private readonly itemUpdaters: Map<M['kind'], [M, ConfigItemUpdater<C, any>[]]>;

  /**
   * A resolving constructor.
   *
   * The inputs:
   * - `fromDecoded`: a reference to the codegen'ed enum-decoding function, e.g. `UpdateConfigMode.fromDecoded`. Needed
   *   to turn the `<enumClass>.kind` strings into enums (i.e. instances of `M`).
   * - `configClass`: a reference to the codegen'ed top-level config class, e.g. `ReserveConfig`. Need to create a
   *    completion helper for the `itemMapBuilder`.
   * - `itemMapBuilder`: a function building a {@link ConfigItemMap} using the completion helper provided as its
   *    argument, e.g. `(config) => ({[UpdateLendingMarketMode.UpdateImmutableFlag.kind]: config.immutable, ...})`.
   *
   * See the usage example at {@link ConfigItemMap}.
   */
  constructor(
    fromDecoded: (mode: any) => M,
    configClass: BorshStructClass<C>,
    itemMapBuilder: (config: AnyConfigItem<C, C>) => ConfigItemMap<M, C>
  ) {
    this.itemUpdaters = new Map(
      Object.entries(itemMapBuilder(wrap(configClass))).map(([kind, itemOrArray]) => [
        kind,
        [
          fromDecoded({ [kind]: {} }),
          toArray(itemOrArray as SingleOrArray<ConfigItem<C, any>>).map((item) => new ConfigItemUpdater(item)),
        ],
      ])
    );
  }

  /**
   * Returns all changes between the given current and new configs - in particular, this will be *all* supported fields'
   * changes if the previous config does not exist.
   *
   * Please note that more than one {@link EncodedConfigUpdate}s can be associated with a single `M` enum value (in
   * cases where e.g. an array property is updated by individual updates of its elements).
   */
  encodeAllUpdates(currentConfig: C | undefined, newConfig: C): EncodedConfigUpdate<M>[] {
    const updates: EncodedConfigUpdate<M>[] = [];
    for (const [mode, itemUpdaters] of this.itemUpdaters.values()) {
      for (const itemUpdater of itemUpdaters) {
        const value = itemUpdater.encodeUpdatedItemFrom(currentConfig, newConfig);
        if (value === undefined) {
          continue;
        }
        updates.push({ mode, value });
      }
    }
    return updates;
  }

  /**
   * Gets the single updater of the given config item.
   *
   * Throws an error if the updates are not supported (e.g. for deprecated modes) or if the given item is handled by
   * multiple updaters (e.g. for an array property) - to handle these cases, use {@link allForMode()}.
   */
  forMode(mode: M): ConfigItemUpdater<C, any> {
    const itemUpdaters = this.allForMode(mode);
    switch (itemUpdaters.length) {
      case 0:
        throw new Error(`updates not supported (updaters for ${mode.kind} were explicitly set to [])`);
      case 1:
        return itemUpdaters[0];
      default:
        throw new Error(`${mode.kind} defines multiple (${itemUpdaters.length}) updaters`);
    }
  }

  /**
   * Gets all the updaters of the given config item.
   *
   * This may be an empty array (e.g. for deprecated modes), or multiple elements (e.g. if an array property is updated
   * by individual updates of its elements). If you expect a single updater, use {@link forMode()}.
   */
  allForMode(mode: M): ConfigItemUpdater<C, any>[] {
    const [_mode, itemUpdaters] =
      this.itemUpdaters.get(mode.kind) ??
      orThrow(`updaters for ${mode.kind} were not set (should not be possible, due to type-safety)`);
    return itemUpdaters;
  }
}

/**
 * The update mode discriminator and the serialized value needed to construct an update ix.
 */
export type EncodedConfigUpdate<M extends BorshEnum> = {
  mode: M;
  value: Uint8Array;
};

/**
 * Borsh-serializes the given value according to the given layout.
 *
 * Only exposed for some legacy callers which still construct the update ixs manually (in tests).
 */
export function encodeUsingLayout<T>(layout: Layout<T>, value: T): Uint8Array {
  const buffer = Buffer.alloc(layout.span);
  const length = layout.encode(value, buffer, 0);
  if (length !== layout.span) {
    throw new Error(`layout span declared incorrect length ${layout.span}; got ${length}`);
  }
  return Uint8Array.from(buffer);
}

// Only internals below:

function wrap<C>(configClass: BorshStructClass<C>): AnyConfigItem<C, C> {
  return withPotentialChildren({
    __layout: typeof configClass.layout === 'function' ? configClass.layout() : configClass.layout,
    __getter: (config: C) => config,
  } as any);
}

function wrapChild<C, A extends Record<string, any>>(
  layout: Layout<A>,
  parent: StructConfigItem<C, A>
): AnyConfigItem<C, any> {
  return withPotentialChildren({
    __layout: layout,
    __getter: (config: C) => parent.__getter(config)[layout.property!],
  });
}

function withPotentialChildren<C, A>(item: AnyConfigItem<C, A>): AnyConfigItem<C, A> {
  for (const fieldLayout of (item.__layout as any).fields ?? []) {
    const structItem = item as StructConfigItem<C, any>;
    structItem[fieldLayout.property] = wrapChild(fieldLayout, structItem);
  }
  return item;
}

type BorshEnumMap<M extends BorshEnum, T> = {
  [Key in M['kind']]: T;
};

type Getter<C, A> = (config: C) => A;

function toArray<T>(singleOrArray: SingleOrArray<T>): T[] {
  return Array.isArray(singleOrArray) ? singleOrArray : [singleOrArray];
}
