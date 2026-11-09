import { z } from 'zod';

/** File formats accepted for either draft. */
export const draftFormatSchema = z.enum(['docx', 'pdf', 'txt', 'md', 'doc', 'rtf', 'odt', 'html']);
export type DraftFormat = z.infer<typeof draftFormatSchema>;

/** The kind of edit made between drafts. */
export const changeKindSchema = z.enum(['insert', 'delete', 'replace', 'move', 'format']);
export type ChangeKind = z.infer<typeof changeKindSchema>;

/** A changed paragraph or paired move, linked to its Docxodus revisions. */
export const changeSchema = z.object({
  changeId: z.string(),
  kind: changeKindSchema,
  earlierText: z.string(),
  laterText: z.string(),
  /** The later draft's paragraph anchor, or the destination of a move. */
  anchorId: z.string(),
  revisionIds: z.array(z.string()),
  moveFromAnchorId: z.string().optional(),
}).strict();
export type Change = z.infer<typeof changeSchema>;

/** A FOLIO concept and its character offsets in the named draft's plain text. */
export const folioTagSchema = z.object({
  iri: z.string(),
  label: z.string(),
  branch: z.string(),
  draft: z.enum(['earlier', 'later']),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  source: z.enum(['index', 'model']),
}).strict();
export type FolioTag = z.infer<typeof folioTagSchema>;

/** A named party, its role, and any matched FOLIO actor concept. */
export const partySchema = z.object({
  name: z.string(),
  role: z.string(),
  actorIri: z.string().optional(),
  actorLabel: z.string().optional(),
  isMatterClient: z.boolean(),
}).strict();
export type Party = z.infer<typeof partySchema>;

/** The document's FOLIO classification and broad legal family. */
export const documentTypeSchema = z.object({
  iri: z.string(),
  label: z.string(),
  family: z.enum(['transactional', 'litigation', 'regulatory', 'legislative', 'advisory', 'bankruptcy']),
}).strict();
export type DocumentType = z.infer<typeof documentTypeSchema>;

/** How a change affects the confirmed party. */
export const verdictSchema = z.enum(['harms', 'neutral', 'helps']);
export type Verdict = z.infer<typeof verdictSchema>;

/** The model's stated confidence in its advice. */
export const confidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof confidenceSchema>;

/** A verified literal range within one paragraph of the later draft. */
export const counterSpanSchema = z.object({
  anchorId: z.string(),
  start: z.number(),
  length: z.number(),
  literal: z.string(),
}).strict();
export type CounterSpan = z.infer<typeof counterSpanSchema>;

/** Proposed counter-language before the server verifies its location. */
export const modelCounterSchema = z.object({
  find: z.string(),
  replace: z.string(),
  effect: z.string(),
}).strict();
export type ModelCounter = z.infer<typeof modelCounterSchema>;

/** Counter-language with a location attached only after verification succeeds. */
export const counterSchema = modelCounterSchema.extend({
  span: counterSpanSchema.optional(),
}).strict();
export type Counter = z.infer<typeof counterSchema>;

/** Advice emitted by the model before quotes and counter-language are verified. */
export const modelAssessmentSchema = z.object({
  changeId: z.string(),
  verdict: verdictSchema,
  reason: z.string(),
  quote: z.string(),
  confidence: confidenceSchema,
  counter: modelCounterSchema.optional(),
}).strict();
export type ModelAssessment = z.infer<typeof modelAssessmentSchema>;

/** Advice for one change, including the server's verification result. */
export const assessmentSchema = modelAssessmentSchema.extend({
  verified: z.boolean(),
  counter: counterSchema.optional(),
}).strict();
export type Assessment = z.infer<typeof assessmentSchema>;

/** The leading assessments array lets the server stream completed advice items. */
export const adviceToolInputSchema = z.object({
  assessments: z.array(modelAssessmentSchema),
}).strict();
export type AdviceToolInput = z.infer<typeof adviceToolInputSchema>;

/** The original filename, source format, and extracted plain text of a draft. */
export const draftSchema = z.object({
  filename: z.string(),
  format: draftFormatSchema,
  text: z.string(),
}).strict();
export type Draft = z.infer<typeof draftSchema>;

/** A versioned comparison saved alongside the source and redline documents. */
export const comparisonRecordSchema = z.object({
  schemaVersion: z.literal(1),
  comparisonId: z.string(),
  matterId: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  earlier: draftSchema,
  later: draftSchema,
  formattingCompared: z.boolean(),
  formattingNote: z.string().optional(),
  changes: z.array(changeSchema),
  tags: z.array(folioTagSchema),
  parties: z.array(partySchema),
  documentType: documentTypeSchema.optional(),
  /** The party name confirmed by the lawyer. */
  party: z.string().optional(),
  assessments: z.array(assessmentSchema),
}).strict();
export type ComparisonRecord = z.infer<typeof comparisonRecordSchema>;

/** The redline and grouped changes are ready to display. */
export const redlineEventSchema = z.object({
  type: z.literal('redline'),
  comparisonId: z.string(),
  html: z.string(),
  changes: z.array(changeSchema),
  formattingCompared: z.boolean(),
  formattingNote: z.string().optional(),
}).strict();
export type RedlineEvent = z.infer<typeof redlineEventSchema>;

/** FOLIO tags and any identified document type are available. */
export const tagsEventSchema = z.object({
  type: z.literal('tags'),
  tags: z.array(folioTagSchema),
  documentType: documentTypeSchema.optional(),
}).strict();
export type TagsEvent = z.infer<typeof tagsEventSchema>;

/** Identified parties are ready for confirmation. */
export const partiesEventSchema = z.object({
  type: z.literal('parties'),
  parties: z.array(partySchema),
}).strict();
export type PartiesEvent = z.infer<typeof partiesEventSchema>;

/** One assessment has completed verification. */
export const assessmentEventSchema = z.object({
  type: z.literal('assessment'),
  assessment: assessmentSchema,
}).strict();
export type AssessmentEvent = z.infer<typeof assessmentEventSchema>;

/** A model-assisted stage needs an API key to continue. */
export const needsKeyEventSchema = z.object({
  type: z.literal('needs_key'),
  message: z.string(),
  stage: z.enum(['parties', 'advice']),
}).strict();
export type NeedsKeyEvent = z.infer<typeof needsKeyEventSchema>;

/** A comparison stage failed with a message suitable for display. */
export const errorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
}).strict();
export type ErrorEvent = z.infer<typeof errorEventSchema>;

/** All comparison events have been sent. */
export const doneEventSchema = z.object({
  type: z.literal('done'),
  comparisonId: z.string(),
}).strict();
export type DoneEvent = z.infer<typeof doneEventSchema>;

/** Events sent over the comparison's server-sent event stream. */
export const compareEventSchema = z.discriminatedUnion('type', [
  redlineEventSchema,
  tagsEventSchema,
  partiesEventSchema,
  assessmentEventSchema,
  needsKeyEventSchema,
  errorEventSchema,
  doneEventSchema,
]);
export type CompareEvent = z.infer<typeof compareEventSchema>;
