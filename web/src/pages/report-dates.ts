export const periods = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '当日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'last-month', label: '上月' },
] as const;
export type Period = typeof periods[number]['value'];

const shanghaiDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function reportDay(value: string | number): string {
  if (typeof value === 'number') {
    return Number.isFinite(new Date(value).getTime()) ? shanghaiDate.format(value) : '';
  }
  // Historical catalog labels can include a time range or a later revision date.
  const day = /^(\d{4}-\d{2}-\d{2})(?!\d)/.exec(value)?.[1];
  if (!day) return '';
  const date = new Date(day + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(day + 'T') ? day : '';
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function periodBounds(period: Period, today: string) {
  if (period === 'all') return null;
  const start = new Date(today + 'T00:00:00Z');
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (period === 'month' || period === 'last-month') start.setUTCDate(1);
  if (period === 'last-month') {
    const end = new Date(start);
    end.setUTCDate(0);
    start.setUTCMonth(start.getUTCMonth() - 1);
    return { start: isoDay(start), end: isoDay(end) };
  }
  return { start: isoDay(start), end: today };
}

export function monthlyReports<T>(items: T[], dateOf: (item: T) => string | number, bounds: ReturnType<typeof periodBounds>) {
  const groups = new Map<string, T[]>();
  const dated = items.map(item => ({ item, day: reportDay(dateOf(item)) }))
    .filter(({ day }) => !bounds || (day >= bounds.start && day <= bounds.end))
    .sort((a, b) => b.day.localeCompare(a.day));
  for (const { item, day } of dated) {
    const month = day.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month)!.push(item);
  }
  return { groups: [...groups], count: dated.length };
}

export function monthLabel(month: string) {
  return month ? month.slice(0, 4) + ' 年 ' + Number(month.slice(5)) + ' 月' : '日期未记录';
}
