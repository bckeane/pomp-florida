import { useEffect, useState } from 'react';
import { parseLocalDate } from './dates.js';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;

/** Ticks down to the end of the given ISO deadline date (inclusive of that whole day). */
export function useCountdown(deadlineIso) {
  const [now, setNow] = useState(() => new Date());
  const target = parseLocalDate(deadlineIso);
  const targetTime = target ? target.getTime() : null;

  useEffect(() => {
    if (targetTime === null) return undefined;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [targetTime]);

  if (targetTime === null) return null;

  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    expired: false,
    days: Math.floor(diff / DAY_MS),
    hours: Math.floor((diff % DAY_MS) / HOUR_MS),
    minutes: Math.floor((diff % HOUR_MS) / MIN_MS),
    seconds: Math.floor((diff % MIN_MS) / 1000),
  };
}
