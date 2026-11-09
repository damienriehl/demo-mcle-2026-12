import { useLayoutEffect, useRef, useState } from 'react';
import type { Assessment, FolioTag, RedlineEvent } from '../../../server/drafts/types';
import { AdviceCard } from './advice';

const textBlocks = 'p,li,td,h1,h2,h3,h4,h5,h6';
function changeElement(root: HTMLElement, changeId: string, anchorId?: string) {
  const anchors = [...root.querySelectorAll<HTMLElement>('[data-change-id]')].filter(element => element.dataset.changeId === changeId);
  return anchors.find(element => element.id === anchorId) ?? anchors[0];
}
type SourceNode = { node: Text; start: number; end: number };
function sourceNodes(root: HTMLElement, draft: FolioTag['draft']) {
  const nodes: SourceNode[] = [];
  const excluded = draft === 'earlier' ? 'ins,.rev-ins,.rev-para-ins,.rev-move-to' : 'del,.rev-del,.rev-para-del,.rev-move-from';
  const absentBlock = draft === 'earlier' ? '.rev-para-ins,.rev-move-to' : '.rev-para-del,.rev-move-from';
  let offset = 0;
  const blocks = [...root.querySelectorAll(textBlocks)].filter(block => !block.querySelector(textBlocks));
  for (const block of blocks.length ? blocks : [root]) {
    if (block.closest(absentBlock) || block.querySelector(absentBlock)) continue;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let current: Node | null;
    const textNodes: Text[] = [];
    while ((current = walker.nextNode())) {
      if (current.parentElement?.closest(`${excluded},.dc-sr-label,.dc-tag-label`)) continue;
      textNodes.push(current as Text);
    }
    // Docxodus renders an empty paragraph with a nonbreaking-space placeholder.
    if (textNodes.map(node => node.data).join('') !== '\u00a0') {
      for (const node of textNodes) {
        nodes.push({ node, start: offset, end: offset + node.length });
        offset += node.length;
      }
    }
    offset += 1; // Every paragraph present in this draft contributes a separator.
  }
  return nodes;
}
function nodesForTag(nodes: SourceNode[], tag: FolioTag) {
  return nodes.filter(item => item.start < tag.end && item.end > tag.start);
}
function addLabel(element: Element, text: string, className: string) {
  const label = document.createElement('span');
  label.className = className;
  label.textContent = `${text} `;
  element.prepend(label);
}
export function RedlineReview({ redline, tags, assessments, applied, selected, selectedTag, onSelect, onToggle, onTag }: {
  redline: RedlineEvent; tags: FolioTag[]; assessments: Assessment[]; applied: string[]; selected?: string; selectedTag?: FolioTag;
  onSelect: (id: string) => void; onToggle: (id: string) => void; onTag: (tag: FolioTag) => void;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [tagChanges, setTagChanges] = useState<Map<FolioTag, string[]>>(new Map());
  useLayoutEffect(() => {
    const root = documentRef.current!;
    for (const [selector, label] of [
      ['.rev-ins,.rev-para-ins', 'inserted'], ['.rev-del,.rev-para-del', 'deleted'],
      ['.rev-move-from', 'moved from'], ['.rev-move-to', 'moved to'],
    ]) [...root.querySelectorAll(selector)].reverse().forEach(element => {
      if (!element.querySelector('.dc-sr-label')) addLabel(element, label, 'dc-sr-label');
    });
    for (const change of redline.changes) {
      const anchors = [...root.querySelectorAll<HTMLElement>('[data-change-id]')].filter(element => element.dataset.changeId === change.changeId);
      anchors.forEach(anchor => {
        anchor.tabIndex = 0;
        anchor.setAttribute('aria-label', `${change.kind} change`);
        if (change.kind === 'format') {
          anchor.classList.add('dc-format');
          if (!anchor.querySelector(':scope > .dc-sr-label')) addLabel(anchor, 'format changed', 'dc-sr-label');
        }
      });
    }
    setTagChanges(new Map(tags.map(tag => [tag, [...new Set(nodesForTag(sourceNodes(root, tag.draft), tag).map(item => item.node.parentElement?.closest<HTMLElement>('[data-change-id]')?.dataset.changeId).filter((id): id is string => !!id))]])));
  }, [redline, tags]);

  useLayoutEffect(() => {
    const root = documentRef.current!;
    root.querySelectorAll('.dc-tag-label').forEach(label => label.remove());
    root.querySelectorAll('.dc-tag-span').forEach(span => span.replaceWith(...span.childNodes));
    root.normalize();
    if (!selectedTag) return;
    const ranges = new Map<Text, { start: number; end: number; current: boolean }[]>();
    const sourceByDraft: Partial<Record<FolioTag['draft'], SourceNode[]>> = {};
    for (const tag of tags.filter(tag => tag.iri === selectedTag.iri)) {
      const nodes = sourceByDraft[tag.draft] ??= sourceNodes(root, tag.draft);
      for (const item of nodesForTag(nodes, tag)) {
        const parts = ranges.get(item.node) ?? [];
        parts.push({ start: Math.max(0, tag.start - item.start), end: Math.min(item.node.length, tag.end - item.start), current: tag === selectedTag });
        ranges.set(item.node, parts);
      }
    }
    for (const [node, parts] of ranges) {
      const merged: typeof parts = [];
      for (const part of parts.sort((a, b) => a.start - b.start)) {
        const last = merged.at(-1);
        if (last && part.start <= last.end) {
          last.end = Math.max(last.end, part.end);
          last.current ||= part.current;
        } else merged.push({ ...part });
      }
      for (const part of merged.reverse()) {
        const range = document.createRange();
        range.setStart(node, part.start);
        range.setEnd(node, part.end);
        const span = document.createElement('span');
        span.className = `dc-tag-span${part.current ? ' dc-tag-current' : ''}`;
        span.tabIndex = -1;
        range.surroundContents(span);
      }
    }
    const first = root.querySelector<HTMLElement>('.dc-tag-current');
    if (first) {
      const label = document.createElement('span');
      label.className = 'dc-tag-label';
      label.textContent = `FOLIO: ${selectedTag.label} · ${selectedTag.branch} · ${selectedTag.draft}`;
      first.closest('[data-change-id],p,li,td')?.append(label);
      first.focus({ preventScroll: true });
      first.scrollIntoView({ block: 'nearest' });
    }
  }, [redline, tags, selectedTag]);

  useLayoutEffect(() => {
    const root = documentRef.current!;
    const cards = cardsRef.current!;
    const align = () => {
      const wide = getComputedStyle(reviewRef.current!).getPropertyValue('grid-template-columns').trim().split(' ').length > 1;
      cards.querySelectorAll<HTMLElement>('[data-assessment]').forEach(card => { card.style.position = ''; card.style.top = ''; });
      cards.style.minHeight = '';
      if (!wide) return;
      let nextTop = 0;
      const gap = parseFloat(getComputedStyle(cards).rowGap);
      for (const change of redline.changes) {
        const anchor = changeElement(root, change.changeId, change.anchorId);
        const card = [...cards.querySelectorAll<HTMLElement>('[data-assessment]')].find(element => element.dataset.assessment === change.changeId);
        if (!anchor || !card) continue;
        const top = Math.max(anchor.getBoundingClientRect().top - cards.getBoundingClientRect().top, nextTop);
        card.style.position = 'absolute';
        card.style.top = `${top}px`;
        nextTop = top + card.getBoundingClientRect().height + gap;
      }
      cards.style.minHeight = `${Math.max(root.getBoundingClientRect().height, nextTop - gap)}px`;
    };
    align();
    let width = reviewRef.current!.getBoundingClientRect().width;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(align);
    });
    observer.observe(reviewRef.current!);
    document.fonts.addEventListener('loadingdone', align);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); document.fonts.removeEventListener('loadingdone', align); };
  }, [redline, assessments, selected, selectedTag, tagChanges, applied]);

  useLayoutEffect(() => {
    if (!selected) return;
    const root = documentRef.current!;
    root.querySelectorAll<HTMLElement>('[data-change-id]').forEach(anchor => {
      anchor.classList.toggle('dc-selected', anchor.dataset.changeId === selected);
    });
    const change = redline.changes.find(change => change.changeId === selected);
    const anchor = changeElement(root, selected, change?.anchorId);
    anchor?.focus({ preventScroll: true });
    anchor?.scrollIntoView({ block: 'nearest' });
  }, [selected, redline]);

  return <section role="region" aria-label="Comparison review" className="dc-review-scroll">
    <div className="dc-review-head"><h3>Redline</h3><h3>Advice for each change</h3></div>
    <div ref={reviewRef} className="dc-review-grid">
      <div ref={documentRef} role="region" aria-label="Redline document" className="dc-redline"
        onClick={event => { const id = (event.target as HTMLElement).closest<HTMLElement>('[data-change-id]')?.dataset.changeId; if (id) onSelect(id); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { const id = (event.target as HTMLElement).closest<HTMLElement>('[data-change-id]')?.dataset.changeId; if (id) { event.preventDefault(); onSelect(id); } } }}
        dangerouslySetInnerHTML={{ __html: redline.html }} />
      <div className="dc-cards" ref={cardsRef}>{redline.changes.map(change => <AdviceCard key={change.changeId} change={change}
        assessment={assessments.find(item => item.changeId === change.changeId)} tags={tags.filter(tag => tagChanges.get(tag)?.includes(change.changeId))}
        selected={selected === change.changeId} applied={applied.includes(change.changeId)} onSelect={() => onSelect(change.changeId)} onToggle={() => onToggle(change.changeId)} onTag={onTag} />)}</div>
    </div>
  </section>;
}
