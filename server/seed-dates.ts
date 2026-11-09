/** Today's calendar date in the server's local time zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// The seed format uses signed calendar-day offsets, including dates in deadline inputs.
export function materialize(value: unknown, today: string): unknown {
  if (typeof value === 'string' && /^[+-]\d+$/.test(value)) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(value));
    return date.toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) return value.map((item) => materialize(item, today));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, today)]));
  }
  return value;
}
