import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const directory = new URL('../data/seed/orders/', import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const filename of (await readdir(directory)).filter(name => name.endsWith('.html')).sort()) {
    await page.setContent(await readFile(new URL(filename, directory), 'utf8'));
    await page.pdf({
      path: fileURLToPath(new URL(filename.replace(/\.html$/, '.pdf'), directory)),
      format: 'Letter',
      printBackground: true,
    });
    console.log(`Built ${filename.replace(/\.html$/, '.pdf')}`);
  }
} finally {
  await browser.close();
}
