import { useEffect, useState } from 'react';
import { registerFeature, type FeatureProps } from '../registry';
import { emailFacts } from './facts';

function today() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function ClientUpdateEmail({ activeMatter }: FeatureProps) {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEmail(''); setNotice(''); }, [activeMatter?.id]);
  if (!activeMatter) return null;
  const matter = activeMatter;

  async function draft() {
    setBusy(true);
    setNotice('Drafting…');
    try {
      const res = await fetch('/api/features/client-update-email/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: emailFacts(matter, today()) }),
      });
      const body = await res.json() as { email?: string; message?: string };
      if (res.ok && body.email) { setEmail(body.email); setNotice('Draft ready. Review it before you send.'); }
      else setNotice(body.message ?? 'Could not draft the email. Try again.');
    } catch {
      setNotice('Could not reach the server. Try again.');
    } finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(email);
    setNotice('Copied to the clipboard.');
  }

  return <div className="workspace-section">
    <h3>Client update email</h3>
    <p>A short, friendly status email built from this matter's status, next steps, and computed dates.</p>
    <div className="button-row">
      <button className="primary-button" onClick={draft} disabled={busy}>Draft email</button>
      {email && <button onClick={copy}>Copy</button>}
    </div>
    <p role="status">{notice}</p>
    {email && <textarea aria-label="Email draft" value={email} onChange={event => setEmail(event.target.value)} rows={12}
      style={{ width: '100%', background: 'var(--mc-surface)', border: 'var(--mc-border-width) solid var(--mc-border)', borderRadius: 'var(--mc-radius)', padding: '.7rem', resize: 'vertical' }} />}
  </div>;
}

registerFeature({ id: 'client-update-email', title: 'Client update email', slot: 'cockpit.sidebar', component: ClientUpdateEmail });
