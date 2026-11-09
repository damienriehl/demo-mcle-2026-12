import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const css = readFileSync(new URL('../src/theme/tokens.css', import.meta.url), 'utf8');
function luminance(hex: string) {
  const channels = hex.replace('#', '').match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels.reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

describe.each(['law-review', 'mission-control', 'boutique-firm'])('%s projector contrast', theme => {
  const block = css.match(new RegExp(`\\[data-appearance=['"]${theme}['"]\\]\\s*\\{([^}]+)\\}`))?.[1] ?? '';
  const tokens = Object.fromEntries([...block.matchAll(/(--mc-[\w-]+):\s*(#[\da-f]{6})/gi)].map(match => [match[1], match[2]]));
  test('redline text has projector contrast on the document surface', () => {
    for (const kind of ['ins', 'del', 'move']) {
      const token = `--mc-redline-${kind}`;
      expect(tokens[token], token).toMatch(/^#[\da-f]{6}$/i);
      expect(contrast(tokens[token], tokens['--mc-surface']), token).toBeGreaterThanOrEqual(7);
    }
  });
  test('defines a complete palette with readable body and secondary text on both surfaces', () => {
    for (const key of ['bg', 'surface', 'ink', 'ink-muted', 'accent', 'accent-ink', 'warning', 'chip', 'chip-ink']) expect(tokens[`--mc-${key}`], key).toMatch(/^#[\da-f]{6}$/i);
    for (const background of ['--mc-bg', '--mc-surface']) {
      expect(contrast(tokens['--mc-ink'], tokens[background]), `body on ${background}`).toBeGreaterThanOrEqual(7);
      for (const foreground of ['--mc-ink-muted', '--mc-accent', '--mc-warning']) expect(contrast(tokens[foreground], tokens[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const background of ['--mc-bg', '--mc-surface']) expect(contrast(tokens['--mc-warning'], tokens[background]), `warning on ${background}`).toBeGreaterThanOrEqual(7);
    expect(tokens['--mc-warning'].toLowerCase(), 'warning stays distinct from the accent').not.toBe(tokens['--mc-accent'].toLowerCase());
    expect(contrast(tokens['--mc-accent-ink'], tokens['--mc-accent'])).toBeGreaterThanOrEqual(7);
    expect(contrast(tokens['--mc-chip-ink'], tokens['--mc-chip'])).toBeGreaterThanOrEqual(7);
  });
});
