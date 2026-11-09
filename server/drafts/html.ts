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
  $('ins.rev-ins').each((_, insertion) => {
    if ($(insertion).closest('.rev-move-from,.rev-move-to,[data-move-id]').length) return;
    let next = insertion.next;
    const whitespace = [];
    while (next?.type === 'text' && !next.data.trim()) {
      whitespace.push(next);
      next = next.next;
    }
    if (next && $(next).is('del.rev-del') && !$(next).closest('.rev-move-from,.rev-move-to,[data-move-id]').length) {
      $(insertion).before(next, ...whitespace);
    }
  });
  return $.html();
}
