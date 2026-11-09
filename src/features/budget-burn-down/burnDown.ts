export type BurnDown = { budget: number; billed: number; remaining: number; percentUsed: number; overBy: number };

export function burnDown(budget: number, billed: number): BurnDown {
  return {
    budget,
    billed,
    remaining: Math.max(budget - billed, 0),
    percentUsed: Math.round((billed / budget) * 100),
    overBy: Math.max(billed - budget, 0),
  };
}
