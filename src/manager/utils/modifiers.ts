/**
 * Undo the readonly modifier of a type
 */
export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
