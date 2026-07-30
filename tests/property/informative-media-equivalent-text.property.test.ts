import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { publicationMediaSchema } from '../../site/src/content/schema.js';

type MediaCase = {
  record: Record<string, unknown>;
  accepted: boolean;
};

const token = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
  minLength: 1,
  maxLength: 16,
}).map((characters) => characters.join(''));
const source = token.map((value) => `/media/${value}`);
const equivalentText = token.map((value) => `Workers wait for ${value} readiness before starting.`);
const alternativeReference = token.map((value) => `/media/${value}.vtt`);
const inadequateText = fc.constantFrom(
  '', ' ', 'image', 'image.', 'diagram', 'photo.', 'GRAPHIC', 'figure.', 'todo', 'TBD.',
);

const informativeImage = fc.oneof(
  fc.tuple(source, equivalentText).map(([src, alt]): MediaCase => ({
    record: { kind: 'image', purpose: 'informative', src, alt },
    accepted: true,
  })),
  fc.tuple(source, inadequateText).map(([src, alt]): MediaCase => ({
    record: { kind: 'image', purpose: 'informative', src, alt },
    accepted: false,
  })),
);

const decorativeImage = fc.oneof(
  source.map((src): MediaCase => ({
    record: { kind: 'image', purpose: 'decorative', src, alt: '' },
    accepted: true,
  })),
  fc.tuple(source, equivalentText).map(([src, alt]): MediaCase => ({
    record: { kind: 'image', purpose: 'decorative', src, alt },
    accepted: false,
  })),
  source.map((src): MediaCase => ({
    record: { kind: 'image', src, alt: '' },
    accepted: false,
  })),
);

const prerecordedAudio = fc.oneof(
  fc.tuple(source, alternativeReference).map(([src, transcript]): MediaCase => ({
    record: { kind: 'audio', prerecorded: true, src, transcript },
    accepted: true,
  })),
  source.map((src): MediaCase => ({
    record: { kind: 'audio', prerecorded: true, src },
    accepted: false,
  })),
  fc.tuple(source, alternativeReference).map(([src, captions]): MediaCase => ({
    record: { kind: 'audio', prerecorded: true, src, captions },
    accepted: false,
  })),
);

const prerecordedVideo = fc.oneof(
  fc.tuple(source, alternativeReference).map(([src, captions]): MediaCase => ({
    record: { kind: 'video', prerecorded: true, src, captions },
    accepted: true,
  })),
  fc.tuple(source, alternativeReference).map(([src, transcript]): MediaCase => ({
    record: { kind: 'video', prerecorded: true, src, transcript },
    accepted: true,
  })),
  fc.tuple(source, alternativeReference, alternativeReference)
    .map(([src, captions, transcript]): MediaCase => ({
      record: { kind: 'video', prerecorded: true, src, captions, transcript },
      accepted: true,
    })),
  source.map((src): MediaCase => ({
    record: { kind: 'video', prerecorded: true, src },
    accepted: false,
  })),
);

const mediaCase: fc.Arbitrary<MediaCase> = fc.oneof(
  informativeImage,
  decorativeImage,
  prerecordedAudio,
  prerecordedVideo,
);

describe('Property 13: Informative media has equivalent text', () => {
  it('accepts media exactly when its purpose and equivalent text are explicit', () => {
    // Feature: bssw-fellowship-resource-site, Property 13: Informative media has equivalent text
    // **Validates: Requirements 9.3, 9.4**
    fc.assert(fc.property(mediaCase, ({ record, accepted }) => {
      const result = publicationMediaSchema.safeParse(record);
      expect(result.success).toBe(accepted);

      if (!result.success) return;
      const media = result.data;
      if (media.kind === 'image') {
        if (media.purpose === 'informative') {
          expect(media.alt.trim().length).toBeGreaterThanOrEqual(8);
          expect(media.alt).not.toMatch(/^(?:image|diagram|photo|graphic|figure|file|todo|tbd)(?:\.|$)/i);
        } else {
          expect(media.purpose).toBe('decorative');
          expect(media.alt).toBe('');
        }
      } else if (media.kind === 'audio') {
        expect(media.transcript).toBeTruthy();
      } else {
        expect(media.captions || media.transcript).toBeTruthy();
      }
    }), { numRuns: 200, seed: 13090304 });
  });
});
