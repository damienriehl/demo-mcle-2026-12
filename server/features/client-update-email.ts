import { Hono } from 'hono';
import type { EmailFacts } from '../../src/features/client-update-email/facts';
import { createClient, modelName, needsKeyResponse } from '../ai';

const SYSTEM = `You write short, friendly status emails from a law firm to its client.
Use only the facts provided. Do not add dates, deadlines, legal advice, or promises that are not in the facts.
Copy every date exactly as given. Write in plain language a non-lawyer understands, under 150 words.
Return plain text only: a "Subject:" line, a blank line, then the email signed "Your legal team".`;

export default new Hono().post('/draft', async (c) => {
  const client = createClient();
  if (!client) return needsKeyResponse();
  const { facts } = await c.req.json<{ facts: EmailFacts }>();
  const message = await client.messages.create({
    model: modelName(),
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Matter facts:\n${JSON.stringify(facts, null, 2)}` }],
  });
  const email = message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('').trim();
  return c.json({ email });
});
