/**
 * 8-byte Anchor account discriminator. Lives in its own dependency-free
 * module so listeners can use it at module-load time without dragging in
 * `utils.ts`'s transitive deps (causes a circular import).
 */
export const ANCHOR_DISCRIMINATOR_BYTES = 8;
