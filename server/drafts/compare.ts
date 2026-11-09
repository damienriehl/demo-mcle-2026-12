import { load } from 'cheerio';
import { compareDocuments, convertDocxToHtml, getRevisions, openDocxSession } from 'docxodus/core';
import type { RevisionListEntry } from 'docxodus/core';
import { ensureEngine } from './engine';
import { sanitizeHtml } from './html';
import type { normalizeDraft } from './normalize';
import type { Change } from './types';

type NormalizedDraft = Awaited<ReturnType<typeof normalizeDraft>>;

/** Read both projections of the redline without changing the downloadable document. */
function projectedParagraphs(bytes: Uint8Array, accept?: boolean) {
  const session = openDocxSession(bytes);
  try {
    if (accept !== undefined) {
      const result = accept ? session.acceptAllRevisions() : session.rejectAllRevisions();
      if (!result.success) throw new Error(result.error?.message || 'Could not read the redline.');
    }
    const anchors = Object.entries(session.project().anchorIndex).filter(([, anchor]) => ['p', 'h', 'li'].includes(anchor.kind));
    const infos = session.getAnchorInfos(anchors.map(([id]) => id));
    return anchors.map(([id, anchor]) => ({ id, scope: anchor.scope, text: infos[id]?.visibleText ?? '' }));
  } finally { session.close(); }
}

export async function compareDrafts(earlier: NormalizedDraft, later: NormalizedDraft) {
  await ensureEngine();
  const formattingCompared = ![earlier.format, later.format].some(format => ['txt', 'md', 'pdf'].includes(format));
  let redline = await compareDocuments(earlier.docx, later.docx, { authorName: 'Other side' });
  let revisions = await getRevisions(redline);
  if (!formattingCompared && revisions.some(revision => revision.type === 'format')) {
    const session = openDocxSession(redline);
    try {
      for (const revision of revisions.filter(revision => revision.type === 'format')) {
        const result = session.acceptRevision(revision.id);
        if (!result.success) throw new Error(result.error?.message || 'Could not remove formatting revisions.');
      }
      redline = session.save();
    } finally { session.close(); }
    revisions = await getRevisions(redline);
  }
  const html = await convertDocxToHtml(redline, { renderTrackedChanges: true, renderMoveOperations: true, stampAnchors: true, showFormattingChanges: formattingCompared });
  const $ = load(html);
  const blocks = $('[data-source-anchor-id]').toArray();
  const blockByAnchor = new Map(blocks.map(block => [$(block).attr('data-source-anchor-id')!, block]));
  const order = new Map(blocks.map((block, index) => [$(block).attr('data-source-anchor-id')!, index]));
  const before = new Map(projectedParagraphs(redline, false).map(paragraph => [paragraph.id, paragraph.text]));
  const afterParagraphs = projectedParagraphs(redline, true);
  const after = new Map(afterParagraphs.map(paragraph => [paragraph.id, paragraph.text]));
  const laterParagraphs = projectedParagraphs(later.docx);
  // Accepting the redline yields the later draft's paragraph order. Match within each story
  // because headers, body, and notes can be projected in different part order.
  const laterAnchor = new Map<string, string>();
  const positions = new Map<string, number>();
  for (const paragraph of afterParagraphs) {
    const index = positions.get(paragraph.scope) ?? 0;
    const target = laterParagraphs.filter(candidate => candidate.scope === paragraph.scope)[index];
    if (target) laterAnchor.set(paragraph.id, target.id);
    positions.set(paragraph.scope, index + 1);
  }

  type Group = { anchors: string[]; revisions: RevisionListEntry[]; move?: RevisionListEntry };
  const groups: Group[] = [];
  const moveByAnchor = new Map<string, Group>();
  for (const revision of revisions.filter(revision => revision.type === 'move')) {
    const group: Group = { anchors: revision.affectedAnchors.map(anchor => anchor.id), revisions: [revision], move: revision };
    groups.push(group);
    for (const anchor of group.anchors) moveByAnchor.set(anchor, group);
  }
  const paragraphGroups = new Map<string, Group>();
  for (const revision of revisions.filter(revision => revision.type !== 'move')) {
    const anchors = revision.affectedAnchors.length ? revision.affectedAnchors.map(anchor => anchor.id) : [revision.anchorId!];
    for (const anchor of anchors) {
      // Word records a moved paragraph's boundary as separate insert/delete revisions.
      const move = moveByAnchor.get(anchor);
      if (move && revision.family === 'paragraph_mark') { move.revisions.push(revision); continue; }
      let group = paragraphGroups.get(anchor);
      if (!group) { group = { anchors: [anchor], revisions: [] }; paragraphGroups.set(anchor, group); groups.push(group); }
      group.revisions.push(revision);
    }
  }
  groups.sort((a, b) => Math.min(...a.anchors.map(anchor => order.get(anchor) ?? Infinity)) - Math.min(...b.anchors.map(anchor => order.get(anchor) ?? Infinity)));
  const changes: Change[] = groups.map((group, index) => {
    const changeId = `c${index + 1}`;
    let anchor = group.anchors[0];
    let from: string | undefined;
    if (group.move) {
      anchor = group.anchors.find(id => {
        const block = blockByAnchor.get(id);
        return block && $(block).find('.rev-move-to').length > 0;
      })!;
      from = group.anchors.find(id => {
        const block = blockByAnchor.get(id);
        return block && $(block).find('.rev-move-from').length > 0;
      });
    }
    const earlierText = before.get(from ?? anchor) ?? '';
    const laterText = after.get(anchor) ?? '';
    const types = new Set(group.revisions.map(revision => revision.type));
    const kind: Change['kind'] = group.move ? 'move' : types.has('insert') && types.has('delete') ? 'replace'
      : types.has('insert') ? 'insert' : types.has('delete') ? 'delete' : 'format';
    for (const id of group.anchors) {
      const block = blockByAnchor.get(id);
      if (block) {
        $(block).attr('data-change-id', changeId);
        if (group.move) $(block).find('.rev-move-from,.rev-move-to').attr('data-change-id', changeId);
      }
    }
    return {
      changeId, kind, earlierText, laterText,
      anchorId: laterAnchor.get(anchor) ?? anchor,
      revisionIds: [...new Set(group.revisions.map(revision => revision.id))],
      ...(from ? { moveFromAnchorId: from } : {}),
    };
  });
  return {
    redline, changes, html: sanitizeHtml($.html()), formattingCompared,
    ...(!formattingCompared ? { formattingNote: 'Formatting was not compared because one draft was not a Word file.' } : {}),
  };
}
