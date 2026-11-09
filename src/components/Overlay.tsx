import { useEffect, useRef, type ReactNode } from 'react';

export function Overlay({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current!;
    element.focus();
    function keydown(event: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]:last-of-type') !== element && !element.contains(document.activeElement)) return;
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first?.focus(); }
    }
    element.addEventListener('keydown', keydown);
    return () => { element.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="drawer-backdrop">
    <aside ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="drawer">
      <header className="section-heading"><h2>{title}</h2><button onClick={onClose} aria-label={closeLabel}>Close ×</button></header>
      {children}
    </aside>
  </div>;
}
