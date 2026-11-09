import { z } from 'zod';
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages';
import { syntheticMatterSchema, provenanceSchema, type Matter } from '../../src/data/schema';
import { deadlineCatalog } from '../../src/engine';

type PartialValue<T> = T extends (infer E)[] ? PartialValue<E>[]
  : T extends object ? { [K in keyof T]?: PartialValue<T[K]> } : T;
export type Draft = PartialValue<Matter> & { provenance: Matter['provenance'] };

export const fieldSchema = provenanceSchema.extend({ path: z.string().min(1), value: z.unknown() });
export type Field = z.infer<typeof fieldSchema>;
export const questionSchema = z.strictObject({ id: z.string().min(1), question: z.string().min(1), field: z.string().min(1) });
export const outputSchema = z.strictObject({ fields: z.array(fieldSchema), followups: z.array(questionSchema) });

export const intakeTool: BetaTool = {
  name: 'structure_matter',
  description: 'Extract or complete a fictional matter. Write fields first, then followups. Each field is a matter dot path, JSON value, source label, and optional evidence quote. Use leaf paths including array indices. Use empty arrays/objects for empty collections. Never emit provenance as a field; source and evidence become the provenance map.',
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      fields: { type: 'array', items: z.toJSONSchema(fieldSchema) },
      followups: { type: 'array', maxItems: 3, items: z.toJSONSchema(questionSchema) },
    },
    required: ['fields', 'followups'], additionalProperties: false,
  },
};

/** Empty containers are fields too; provenance itself is metadata, not an authored field. */
export function leaves(value: unknown, prefix = ''): { path: string; value: unknown }[] {
  if (value !== null && typeof value === 'object' && Object.keys(value).length) {
    return Object.entries(value).filter(([key]) => prefix || key !== 'provenance')
      .flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
  }
  return prefix ? [{ path: prefix, value }] : [];
}

function schemaAt(path: string): z.ZodType {
  let schema: z.ZodType = syntheticMatterSchema;
  for (const key of path.split('.')) {
    if (['__proto__', 'constructor', 'prototype', 'provenance'].includes(key)) throw new Error(`${path}: invalid matter path`);
    while (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional || schema instanceof z.ZodPipe) {
      schema = schema instanceof z.ZodPipe ? schema.in as z.ZodType : schema.unwrap() as z.ZodType;
    }
    if (schema instanceof z.ZodUnion) {
      const option = schema.options.find((option) => option instanceof z.ZodObject && Object.hasOwn(option.shape, key));
      if (!(option instanceof z.ZodObject)) throw new Error(`${path}: invalid matter path`);
      schema = option;
    }
    if (schema instanceof z.ZodObject && Object.hasOwn(schema.shape, key)) schema = schema.shape[key];
    else if (schema instanceof z.ZodArray && /^(0|[1-9]\d*)$/.test(key)) schema = schema.element as z.ZodType;
    else if (schema instanceof z.ZodRecord) schema = schema.valueType as z.ZodType;
    else throw new Error(`${path}: invalid matter path`);
  }
  while (schema instanceof z.ZodPipe) schema = schema.in as z.ZodType;
  return schema;
}

function put(draft: Draft, path: string, value: unknown) {
  const parts = path.split('.');
  let target = draft as Record<string, unknown>;
  const additions: (() => void)[] = [];
  const checkIndex = (key: string) => {
    if (Array.isArray(target) && Number(key) > target.length) throw new Error(`${path}: array indices must be consecutive`);
  };
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    checkIndex(key);
    if (target[key] === undefined) {
      const parent = target;
      const child = /^\d+$/.test(parts[i + 1]) ? [] : {};
      additions.push(() => { parent[key] = child; });
      target = child as Record<string, unknown>;
    } else target = target[key] as Record<string, unknown>;
  }
  checkIndex(parts.at(-1)!);
  target[parts.at(-1)!] = value;
  additions.forEach((attach) => attach());
}

/** Accept independent valid leaves even when another part of a tool result needs repair. */
export function applyField(draft: Draft, raw: unknown, preserveStated = false): { fields: Field[]; errors: string[] } {
  const result = fieldSchema.safeParse(raw);
  if (!result.success) return { fields: [], errors: [result.error.message] };
  const { path, value, source, evidence } = result.data;
  const fields: Field[] = [];
  const errors: string[] = [];
  for (const leaf of leaves(value, path)) {
    try {
      let field: Field = { ...leaf, source, ...(evidence === undefined ? {} : { evidence }) };
      field.value = schemaAt(leaf.path).parse(leaf.value);
      if (/^deadlines\.\d+\.deadlineRuleId$/.test(leaf.path) && field.value !== 'none'
        && !deadlineCatalog().some((rule) => rule.id === field.value)) {
        field = { ...field, value: 'none', source: 'inferred', evidence: `Unrecognized deadline catalog ID: ${String(field.value)}. No computable rule selected.` };
      }
      if (preserveStated) {
        const stated = leaves(draft).filter((old) => draft.provenance[old.path]?.source === 'stated'
          && (old.path === leaf.path || old.path.startsWith(`${leaf.path}.`) || leaf.path.startsWith(`${old.path}.`)));
        if (stated.some((old) => old.path !== leaf.path || JSON.stringify(old.value) !== JSON.stringify(field.value))) {
          throw new Error('Embellish must preserve stated facts');
        }
        if (stated.length) field = { ...field, ...draft.provenance[leaf.path] };
      }
      put(draft, leaf.path, field.value);
      draft.provenance[leaf.path] = { source: field.source, ...(field.evidence === undefined ? {} : { evidence: field.evidence }) };
      fields.push(field);
    } catch (error) { errors.push(`${leaf.path}: ${error instanceof Error ? error.message : 'invalid value'}`); }
  }
  return { fields, errors };
}

export function readDraft(raw: unknown): { draft: Draft; errors: string[] } {
  const draft: Draft = { provenance: {} };
  if (raw === undefined) return { draft, errors: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { draft, errors: ['draft: expected a partial matter'] };
  const provenance = (raw as { provenance?: Record<string, unknown> }).provenance ?? {};
  const errors: string[] = [];
  for (const leaf of leaves(raw)) {
    const label = provenanceSchema.safeParse(provenance[leaf.path]);
    if (!label.success) { errors.push(`${leaf.path}: missing or invalid provenance`); continue; }
    errors.push(...applyField(draft, { ...leaf, ...label.data }).errors);
  }
  return { draft, errors };
}

export function validateMatter(draft: Draft): Matter {
  const matter = syntheticMatterSchema.parse(draft);
  for (const leaf of leaves(draft)) {
    if (!draft.provenance[leaf.path]) throw new Error(`${leaf.path}: missing provenance`);
  }
  for (const leaf of leaves(matter)) {
    matter.provenance[leaf.path] ??= { source: 'inferred', evidence: 'Matter schema default.' };
  }
  return matter;
}
