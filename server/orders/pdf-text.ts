import { extractText, getDocumentProxy } from 'unpdf';

export async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const document = await getDocumentProxy(bytes);
  try {
    const { text } = await extractText(document, { mergePages: false });
    return text;
  } finally {
    await document.loadingTask.destroy();
  }
}

export function textPages(text: string): string[] {
  return [text];
}
