import { z } from 'zod';
import type { Chunk, PersistedStateV1 } from './types';

const chunkKindSchema = z.union([z.literal('TEXT'), z.literal('SCENE')]);

const chunkSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  kind: chunkKindSchema,
  splitLines: z.array(z.number().int()),
  fieldWidth: z.number().int().positive().optional(),
  fieldHeight: z.number().int().positive().optional(),
});

const persistedSchema = z.object({
  version: z.literal(1),
  chunks: z.array(chunkSchema),
});

export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function sanitizeSplitLines(splitLines: number[], body: string): number[] {
  const lines = normalizeNewlines(body).split('\n');
  const maxBoundary = Math.max(lines.length - 1, 0);
  return [...new Set(splitLines)]
    .filter((line) => Number.isInteger(line) && line >= 1 && line <= maxBoundary)
    .sort((a, b) => a - b);
}

export function normalizeChunk(chunk: Chunk): Chunk {
  const body = normalizeNewlines(chunk.body);
  return {
    ...chunk,
    title: chunk.title || 'Untitled',
    body,
    splitLines: sanitizeSplitLines(chunk.splitLines, body),
  };
}

export function parsePersistedProject(text: string): PersistedStateV1 {
  const parsed = persistedSchema.parse(JSON.parse(text));
  return {
    version: 1,
    chunks: parsed.chunks.map(normalizeChunk),
  };
}

export function serializeProject(chunks: Chunk[]): string {
  const payload: PersistedStateV1 = {
    version: 1,
    chunks: chunks.map(normalizeChunk),
  };
  return JSON.stringify(payload, null, 2);
}

export function createDefaultChunk(index = 1): Chunk {
  return {
    id: crypto.randomUUID(),
    title: `Chunk ${index}`,
    body: '',
    kind: 'TEXT',
    splitLines: [],
  };
}

export function createDefaultProject(): PersistedStateV1 {
  return {
    version: 1,
    chunks: [createDefaultChunk(1)],
  };
}
