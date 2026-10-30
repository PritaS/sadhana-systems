export function heatLevel(hours: number): number {
  if (hours <= 0) return 0;
  if (hours < 0.75) return 1;
  if (hours < 1.5) return 2;
  if (hours < 2.25) return 3;
  return 4;
}

export function currentStreak(days: { hours: number }[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].hours > 0) streak++;
    else break;
  }
  return streak;
}

export function pearsonR(rows: { meditationHours: number; clarity: number }[]): number {
  if (rows.length < 2) return 0;
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.meditationHours, 0) / n;
  const my = rows.reduce((s, r) => s + r.clarity, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const r of rows) {
    num += (r.meditationHours - mx) * (r.clarity - my);
    dx += (r.meditationHours - mx) ** 2;
    dy += (r.clarity - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

export function parseSprintProgress(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, progress]) =>
      typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 && progress <= 100));
  } catch { return {}; }
}
