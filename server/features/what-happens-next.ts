import { Hono } from 'hono';
import { createClient, modelName, needsKeyResponse } from '../ai';
import { localToday } from '../seed-dates';

/** The client-facing projection the Portal hands to its extensions. */
type ClientMatter = {
  title?: string;
  clientFacing?: { status?: string; nextSteps?: (string | undefined)[] };
  deadlines?: ({ id: string; label: string } | undefined)[];
  computedDeadlines?: Record<string, { status: string; dueDate?: string }>;
};

export type NextStepFacts = {
  title?: string;
  status?: string;
  nextSteps: string[];
  deadline: { label: string; dueDate: string } | null;
};

/** The nearest upcoming engine-computed date, used verbatim; the model never supplies dates. */
export function nextStepFacts(matter: ClientMatter, today = localToday()): NextStepFacts {
  const upcoming = (matter.deadlines ?? []).flatMap(deadline => {
    const result = deadline && matter.computedDeadlines?.[deadline.id];
    return deadline && result?.status === 'computed' && result.dueDate && result.dueDate >= today
      ? [{ label: deadline.label, dueDate: result.dueDate }] : [];
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    title: matter.title,
    status: matter.clientFacing?.status,
    nextSteps: (matter.clientFacing?.nextSteps ?? []).filter((step): step is string => Boolean(step)),
    deadline: upcoming[0] ?? null,
  };
}

const explainTool = {
  name: 'explain_next_step',
  description: 'Give the client one plain-English next step and why it matters.',
  input_schema: {
    type: 'object' as const,
    properties: {
      step: { type: 'string', description: 'One short sentence: what happens next, in everyday words.' },
      why: { type: 'string', description: 'One or two short sentences: why this step matters to the client.' },
    },
    required: ['step', 'why'],
  },
};

export default new Hono().post('/explain', async (c) => {
  const client = createClient();
  if (!client) return needsKeyResponse();
  const { matter } = await c.req.json<{ matter: ClientMatter }>();
  const facts = nextStepFacts(matter);
  const message = await client.messages.create({
    model: modelName(),
    max_tokens: 600,
    system: 'You explain a legal matter to the client, a non-lawyer, at an eighth-grade reading level. '
      + 'Use only the facts given. Never state, change, or calculate any date; the app shows the date itself. '
      + 'When a deadline is given, the next step is that deadline: say what it is and what the client should do. '
      + 'No legal advice beyond the facts, no internal strategy, no jargon.',
    tools: [explainTool],
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: [{ role: 'user', content: `Call explain_next_step once for the single next step in this matter.\n${JSON.stringify(facts)}` }],
  });
  const output = message.content.find(block => block.type === 'tool_use')?.input as { step: string; why: string };
  return c.json({ step: output.step, why: output.why, deadline: facts.deadline });
});
