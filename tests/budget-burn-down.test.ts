import { describe, expect, it } from 'vitest';
import { burnDown } from '../src/features/budget-burn-down/burnDown';

describe('budget burn-down', () => {
  it('reports billed, remaining, and percent used under budget', () => {
    expect(burnDown(50000, 18500)).toEqual({ budget: 50000, billed: 18500, remaining: 31500, percentUsed: 37, overBy: 0 });
  });
  it('reports the overage when fees exceed the budget', () => {
    expect(burnDown(20000, 26000)).toEqual({ budget: 20000, billed: 26000, remaining: 0, percentUsed: 130, overBy: 6000 });
  });
});
