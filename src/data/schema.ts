import { z } from 'zod';
import type { DeadlineResult } from './engine-types';
import { practiceAreas } from './practiceAreas';

const text = z.string().min(1);
export const provenanceSchema = z.strictObject({
  source: z.enum(['stated', 'inferred', 'invented']),
  evidence: z.string().optional(),
});

export const deadlineSchema = z.strictObject({
  id: text,
  label: text,
  deadlineRuleId: text,
  trigger: z.union([
    z.strictObject({ event: text, date: z.iso.date() }),
    z.strictObject({ event: text, fromDeadline: text }),
  ]),
  supersededBy: text.optional(),
  assumptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  inputs: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

// Dot paths, with * matching one object key or array index. Always hidden by the Portal.
export const INTERNAL_ONLY_FIELDS = ['reasoning', 'provenance.*.evidence'] as const;

export const matterSchema = z.strictObject({
  id: text,
  title: text,
  practiceArea: z.enum(practiceAreas),
  forum: text,
  synthetic: z.literal(true),
  client: z.strictObject({ name: text, contact: text }),
  parties: z.array(z.strictObject({ name: text, role: text })),
  timeline: z.array(z.strictObject({ id: text, event: text, date: z.iso.date() })),
  documents: z.array(z.strictObject({ id: text, title: text, kind: text, body: text, shared: z.boolean().default(false) })),
  deadlines: z.array(deadlineSchema).superRefine((deadlines, ctx) => {
    const seen = new Set<string>();
    deadlines.forEach((deadline, index) => {
      if (seen.has(deadline.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate deadline id' });
      seen.add(deadline.id);
    });
    deadlines.forEach((deadline, index) => {
      const references = [
        { id: 'fromDeadline' in deadline.trigger ? deadline.trigger.fromDeadline : undefined, path: [index, 'trigger', 'fromDeadline'] },
        { id: deadline.supersededBy, path: [index, 'supersededBy'] },
      ];
      for (const { id, path } of references) {
        if (id === undefined) continue;
        if (id === deadline.id) ctx.addIssue({ code: 'custom', path, message: 'Deadline reference cannot name itself' });
        else if (!seen.has(id)) ctx.addIssue({ code: 'custom', path, message: `Unknown deadline id: ${id}` });
      }
    });
  }),
  clientFacing: z.strictObject({ status: text, nextSteps: z.array(text) }),
  reasoning: z.string().optional(),
  internalOnly: z.array(text).default([]).transform((paths) => [...new Set([...INTERNAL_ONLY_FIELDS, ...paths])]),
  provenance: z.record(text, provenanceSchema),
});

export const mattersSchema = z.array(matterSchema).superRefine((matters, ctx) => {
  const seen = new Set<string>();
  matters.forEach((matter, index) => {
    if (seen.has(matter.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate matter id' });
    seen.add(matter.id);
  });
});

export type Matter = z.output<typeof matterSchema>;
export type MatterWithDeadlines = Matter & { computedDeadlines: Record<string, DeadlineResult> };
