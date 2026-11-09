const months = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function normalize(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function verifyQuote(
  { quote, page, date }: { quote: string; page: number; date: string },
  pages: string[],
): { ok: true } | { ok: false; reason: string } {
  const citedPage = pages[page - 1];
  const normalizedQuote = normalize(quote);
  if (citedPage === undefined || !normalize(citedPage).includes(normalizedQuote)) {
    return { ok: false, reason: 'Quote does not appear on the cited page.' };
  }

  const claimedDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(claimedDate.getTime()) || claimedDate.toISOString().slice(0, 10) !== date) {
    return { ok: false, reason: 'Claimed date is not an ISO calendar date.' };
  }

  const [year, month, day] = date.split('-').map(Number);
  const monthName = months[month - 1];
  if (monthName) {
    const shortMonth = monthName.slice(0, 3);
    const numericMonth = month < 10 ? `0?${month}` : `${month}`;
    const numericDay = day < 10 ? `0?${day}` : `${day}`;
    const namedDate = `(?:${monthName}|${shortMonth}\\.?) ${day}, *${year}`;
    const slashDate = `${numericMonth}/${numericDay}/${year}`;
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (new RegExp(`\\b(?:${namedDate}|${slashDate}|${isoDate})\\b`, 'i').test(normalizedQuote)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'Quote does not name the claimed calendar date.' };
}
