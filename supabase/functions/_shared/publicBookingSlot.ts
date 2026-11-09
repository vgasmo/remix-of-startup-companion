import { lisbonWallClockToDate } from './lisbonTime.ts';

/** Horários que a página pública oferece (public-get-availability): dias úteis, hora de Lisboa. */
export const OFFERED_TIMES = new Set(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']);

/** A página pública mostra os próximos 14 dias; 15 dá folga para o fuso. */
export const MAX_BOOKING_AHEAD_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * O servidor não confia no cliente: só aceita um horário da grelha oferecida, num dia útil (hora de Lisboa),
 * no futuro e até 15 dias. Rejeita datas inexistentes (2026-13-45, 2026-02-31) sem lançar.
 */
export function isOfferedSlot(date: string, time: string, now: number = Date.now()): boolean {
  if (!OFFERED_TIMES.has(time)) return false;
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return false;
  const dow = day.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  let start: Date;
  try { start = lisbonWallClockToDate(date, time); } catch { return false; }
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() > now && start.getTime() <= now + MAX_BOOKING_AHEAD_MS;
}
