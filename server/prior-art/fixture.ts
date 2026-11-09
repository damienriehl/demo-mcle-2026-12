import type { Reference } from '../../src/features/prior-art/types';
import type { Citation, PatentApi } from './uspto';

/** Illustrative sample — not real USPTO data. IDs are fictional; no public links. */
const ref = (id: string, title: string, date: string, text: string): Reference => ({ id, title, date, text, sample: true });

export const SAMPLE_REFERENCES: Reference[] = [
  ref('SAMPLE-1', 'Collapsible shade canopy with radial ribs', '2019-04-16',
    'A portable shade canopy folds along radial ribs that pivot at a central hub. A removable locking pin holds the ribs in the deployed position.'),
  ref('SAMPLE-2', 'Spiral torsion hinge for folding panels', '2017-09-05',
    'A hinge formed from a helical spring couples two panels so that the panels rotate between folded and open states. The spring biases the panels open.'),
  ref('SAMPLE-3', 'Self-erecting beach umbrella', '2015-06-23',
    'An umbrella canopy opens automatically when released from a sleeve. Stored energy in flexible ribs erects the canopy without user assembly.'),
  ref('SAMPLE-4', 'Pinless detent lock for telescoping poles', '2014-02-11',
    'A detent formed in the pole wall locks telescoping sections without a separate pin. Rotation of the outer section releases the detent.'),
  ref('SAMPLE-5', 'Folding awning frame with gas strut', '2012-11-27',
    'An awning frame folds against a wall and deploys with a gas strut. The frame uses a clevis pin at each joint.'),
  ref('SAMPLE-6', 'Pop-up tent with coiled frame members', '2010-08-03',
    'A tent frame of coiled spring steel collapses into a flat loop and springs open into a dome shelter.'),
  ref('SAMPLE-7', 'Hand fan with interlocking blades', '2008-03-18',
    'A hand-held fan uses blades that interlock along their edges when spread open.'),
  ref('SAMPLE-8', 'Garden parasol tilt mechanism', '2006-05-09',
    'A parasol tilts relative to its pole through a push-button joint that locks at preset angles.'),
];

/** Backward citations; SAMPLE-6 cites SAMPLE-3 and SAMPLE-3 cites SAMPLE-6 only to exercise cycle handling. */
export const SAMPLE_CITATIONS: Record<string, Citation[]> = {
  'SAMPLE-1': [{ id: 'SAMPLE-3', category: 'examiner' }, { id: 'SAMPLE-5', category: 'applicant' }, { id: 'SAMPLE-8', category: 'examiner' }],
  'SAMPLE-2': [{ id: 'SAMPLE-4', category: 'examiner' }, { id: 'SAMPLE-7', category: 'applicant' }],
  'SAMPLE-3': [{ id: 'SAMPLE-6', category: 'applicant' }],
  'SAMPLE-4': [{ id: 'SAMPLE-8', category: 'examiner' }],
  'SAMPLE-5': [{ id: 'SAMPLE-8', category: 'applicant' }],
  'SAMPLE-6': [{ id: 'SAMPLE-3', category: 'examiner' }, { id: 'SAMPLE-7', category: 'applicant' }],
};

export const sampleApi: PatentApi = {
  async getPatent(number) { return SAMPLE_REFERENCES.find(r => r.id === number) ?? null; },
  async getCitations(number) { return SAMPLE_CITATIONS[number] ?? []; },
  async searchPatents(terms, beforeDate) {
    const words = terms.toLowerCase().split(/\s+/).filter(Boolean);
    return SAMPLE_REFERENCES.filter(r => (!beforeDate || !r.date || r.date < beforeDate)
      && words.some(w => `${r.title} ${r.text}`.toLowerCase().includes(w.replace(/s$/, ''))));
  },
};
