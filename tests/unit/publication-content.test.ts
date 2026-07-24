import { describe, expect, it } from 'vitest';
import { attributionSchema, contentItemSchema, publicationMediaSchema } from '../../site/src/content/schema.js';

const base = { id:'m', stable_slug:'m', title:'M', summary:'Summary', artifact_type:'learning-module' as const,
  topics:['hpc'], keywords:['hpc'], audiences:['learners'], milestone:1 as const, status:'published' as const,
  publication_date:'2026-07-31', module_number:1, learning_outcomes:['Choose a mapping'], prerequisites:[],
  supporting_artifacts:[], schedulers:[], container_runtimes:[], related:[], applicability_records:[], authority:[], media:[],
  revisions:[], unvalidated_scopes:[], section_kinds:['concept','limitations','next-steps'] };

describe('publication media alternatives', () => {
  it('requires meaningful informative alternatives and explicit decorative marking', () => {
    expect(publicationMediaSchema.parse({ kind:'image', purpose:'decorative', src:'/line.svg', alt:'' }).purpose).toBe('decorative');
    expect(() => publicationMediaSchema.parse({ kind:'image', purpose:'informative', src:'/flow.svg', alt:'diagram' })).toThrow(/equivalent|describe meaning/);
    expect(publicationMediaSchema.parse({ kind:'image', purpose:'informative', src:'/flow.svg', alt:'Workers start only after coordinator readiness.' }).purpose).toBe('informative');
  });
  it('requires a transcript for audio and captions or transcript for video', () => {
    expect(() => publicationMediaSchema.parse({ kind:'audio', prerecorded:true, src:'/talk.mp3' })).toThrow(/transcript/);
    expect(() => publicationMediaSchema.parse({ kind:'video', prerecorded:true, src:'/talk.mp4' })).toThrow(/captions|transcript/);
  });
});

describe('learning module completeness', () => {
  it('requires a conceptual exercise for conceptual modules', () => {
    expect(() => contentItemSchema.parse({ ...base, module_type:'conceptual' })).toThrow(/completion_check/);
    expect(contentItemSchema.parse({ ...base, module_type:'conceptual', completion_check:{ kind:'decision-exercise', text:'Map one workflow' } }).module_type).toBe('conceptual');
  });
  it('requires runnable sections, resources, time, result check, status, applicability, and diagnostics', () => {
    expect(() => contentItemSchema.parse({ ...base, module_type:'runnable', prerequisites:[{ id:'BSSW-X', check:'run x' }] })).toThrow(/procedure|required_resources|diagnostic_id/);
  });
});

describe('approved attribution wording', () => {
  it('rejects placeholder approval language', () => {
    expect(() => attributionSchema.parse({ id:'a', author:'A', fellowship_role:'F', professional_affiliation:'I', funds_administrator:'pending approval', sponsors:['S'], non_endorsement:'N', licenses:[{ scope:'code', license:'Apache-2.0' }] })).toThrow(/placeholder/);
  });
});
