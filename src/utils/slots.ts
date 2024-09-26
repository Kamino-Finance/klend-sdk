import { SLOTS_PER_DAY, SLOTS_PER_HOUR, SLOTS_PER_SECOND } from './constants';

/**
 * Convert slots to seconds
 * @param slots
 * @return seconds
 */
export function toSeconds(slots: number): number {
  return Math.trunc(slots / SLOTS_PER_SECOND);
}

/**
 * Convert slots to hours
 * @param slots
 * @return hours
 */
export function toHours(slots: number): number {
  return Math.trunc(slots / SLOTS_PER_HOUR);
}

/**
 * Convert slots to days
 * @param slots
 * @return days
 */
export function toDays(slots: number): number {
  return Math.trunc(slots / SLOTS_PER_DAY);
}
