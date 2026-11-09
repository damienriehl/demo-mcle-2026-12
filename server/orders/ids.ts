export function orderIds(slug: string): { prefix: string; documentId: string } {
  return { prefix: `order-${slug}-`, documentId: `order-${slug}` };
}
