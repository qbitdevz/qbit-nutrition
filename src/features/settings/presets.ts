import { z } from 'zod';

import { assertSecureBaseUrl } from '@/core/ai';
import { AI_ADAPTERS } from '@/data/schema';
import type { Locale } from '@/i18n/locale';
import raw from './presets.json';

/**
 * Provider presets are data, not code (docs/07 section 3): everything about a service that can go
 * stale lives in `presets.json`, which is updated with each release, and a preset never decides
 * anything on its own. `models` are suggestions only; nothing here is a default model.
 */
const Note = z.object({ en: z.string().trim().min(20), es: z.string().trim().min(20) });

const isHttpsLink = (value: string) => /^https:\/\/[^\s/]+\.[^\s/]+\S*$/i.test(value);
const Link = z.string().refine((value) => value === '' || isHttpsLink(value), 'must be empty or an https:// link');

const PresetSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    /** The provider's own name, used only to say which service this works with. Not translated. */
    name: z.string().trim().min(1),
    adapter: z.enum(AI_ADAPTERS),
    /** Empty only for a custom service. */
    baseUrl: z.string(),
    baseUrlNote: Note.optional(),
    /** Where to create a key; empty when no key exists (local server) or for custom. */
    keyUrl: Link,
    keyRequired: z.boolean(),
    /** The provider's terms; empty for a local server (nothing leaves the network) and for custom. */
    termsUrl: Link,
    local: z.boolean(),
    /** True only when the provider's own pages show a way to use it without paying. */
    zeroCostPath: z.boolean(),
    /** Suggested model identifiers that accept images. Suggestions, never defaults. */
    models: z.array(z.string().trim().min(1)),
    cost: Note,
    dataUse: Note,
    lastVerified: z.iso.date(),
    /** The provider pages this entry was verified on, with what each was used for. */
    sources: z.array(z.string().regex(/^https:\/\//)),
    notes: z.string(),
  })
  .superRefine((preset, ctx) => {
    const fail = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
    const custom = preset.id === 'custom';
    if (preset.baseUrl !== '') {
      try {
        assertSecureBaseUrl(preset.baseUrl);
      } catch {
        fail('the base URL must be https (or a local-network address)', 'baseUrl');
      }
    }
    if (!custom) {
      if (preset.baseUrl === '') fail('a hosted or local preset needs a base URL', 'baseUrl');
      if (preset.models.length === 0) fail('a preset needs at least one suggested model', 'models');
      if (preset.sources.length === 0) fail('a preset must list the pages it was verified on', 'sources');
      if (preset.keyRequired && preset.keyUrl === '') fail('a preset that needs a key must say where to create one', 'keyUrl');
      if (!preset.local && preset.termsUrl === '') fail('a hosted preset needs a link to the provider terms', 'termsUrl');
    } else if (preset.notes.trim() === '') {
      fail('empty fields on the custom preset need a note that says why', 'notes');
    }
  });

const PresetFile = z
  .object({ schemaVersion: z.literal(1), presets: z.array(PresetSchema).min(1) })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.presets.forEach((preset, index) => {
      if (seen.has(preset.id)) ctx.addIssue({ code: 'custom', message: `repeated id "${preset.id}"`, path: ['presets', index, 'id'] });
      seen.add(preset.id);
    });
  });

export type Preset = z.infer<typeof PresetSchema>;

/** Validates a presets file; throws a `ZodError` that names the offending field. */
export function parsePresetFile(value: unknown): { schemaVersion: 1; presets: Preset[] } {
  return PresetFile.parse(value);
}

export const PRESETS: readonly Preset[] = parsePresetFile(raw).presets;

export const getPreset = (id: string | null | undefined): Preset | undefined => PRESETS.find((preset) => preset.id === id);

/** The picker's order: options with a zero-cost path first, then pay-as-you-go ones, then the custom entry. */
export function groupPresets(): { zeroCost: Preset[]; paid: Preset[]; custom: Preset } {
  const custom = PRESETS.find((preset) => preset.id === 'custom');
  if (!custom) throw new Error('presets.json must contain the "custom" preset.');
  const rest = PRESETS.filter((preset) => preset !== custom);
  return { zeroCost: rest.filter((p) => p.zeroCostPath), paid: rest.filter((p) => !p.zeroCostPath), custom };
}

export const noteIn = (note: { en: string; es: string }, locale: Locale): string => note[locale];
