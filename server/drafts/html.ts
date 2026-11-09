import { load } from 'cheerio';

export function sanitizeHtml(html: string): string {
  const $ = load(html);
  $('script,style,iframe,object,embed').remove();
  $('*').each((_, element) => {
    if (!('attribs' in element)) return;
    for (const [name, value] of Object.entries(element.attribs)) {
      if (/^on/i.test(name) || ((name === 'href' || name === 'src') && !/^(#|data:image\/)/i.test(value))) {
        $(element).removeAttr(name);
      }
    }
  });
  return $.html();
}
