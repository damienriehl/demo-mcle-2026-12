import { useEffect, useState } from 'react';

type Health = 'checking' | 'connected' | 'unreachable';

const LABEL: Record<Health, string> = {
  checking: 'Server: checking…',
  connected: 'Server: connected',
  unreachable: 'Server: unreachable',
};

export default function App() {
  const [health, setHealth] = useState<Health>('checking');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { ok?: boolean }) => !cancelled && setHealth(body.ok ? 'connected' : 'unreachable'))
      .catch(() => !cancelled && setHealth('unreachable'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-12">
      <h1 className="font-display text-[length:var(--mc-text-display)] font-bold text-ink">Matter Cockpit</h1>
      <p role="status" data-testid="health-status" className="mt-6 text-base text-ink-muted">
        {LABEL[health]}
      </p>
    </main>
  );
}
