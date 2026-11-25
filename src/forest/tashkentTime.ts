import type { TimeOfDay } from '../types';

/**
 * Returns the current hour (0-23) in Tashkent, Uzbekistan (Asia/Tashkent, UTC+5).
 */
export function getTashkentHour(date: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tashkent',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '12';
    const hour = Number(hourStr);
    return Number.isFinite(hour) ? hour % 24 : (date.getUTCHours() + 5) % 24;
  } catch {
    return (date.getUTCHours() + 5) % 24;
  }
}

/**
 * Maps Tashkent local hour to the forest atmosphere preset:
 * - 05:00 - 09:59 -> morning
 * - 10:00 - 16:59 -> afternoon (day)
 * - 17:00 - 19:59 -> sunset
 * - 20:00 - 04:59 -> night
 */
export function getTashkentTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = getTashkentHour(date);
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'night';
}

export function formatTashkentClock(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    const h = String(getTashkentHour(date)).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}
