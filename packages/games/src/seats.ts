export interface GameSeat { seat: number; userId: string | null; bot: boolean; disconnectedAt: number | null; pendingReturn: boolean }
/** Bots temporarily operate the SAME seat and hand. No hand is recreated during takeover. */
export function disconnectSeat(seats: GameSeat[], userId: string, now: number): GameSeat[] {
  return seats.map(s => s.userId === userId ? { ...s, disconnectedAt: now } : { ...s });
}
export function advanceTakeovers(seats: GameSeat[], now: number, waitMs = 30000): GameSeat[] {
  return seats.map(s => s.disconnectedAt !== null && now - s.disconnectedAt >= waitMs ? { ...s, bot: true } : { ...s });
}
export function requestSeatReturn(seats: GameSeat[], userId: string): GameSeat[] {
  if (!seats.some(s => s.userId === userId)) throw new Error('SEAT_NOT_FOUND');
  return seats.map(s => s.userId === userId ? { ...s, pendingReturn: true, disconnectedAt: null } : { ...s });
}
export function applySeatReturns(seats: GameSeat[]): GameSeat[] { return seats.map(s => s.pendingReturn ? { ...s, pendingReturn: false, bot: false } : { ...s }); }
export const TURN_DURATION_MS = 45000;
