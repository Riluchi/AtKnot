import type { Chunk } from './types';

type AnyRecord = Record<string, unknown>;

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'chunk'
  );
}

function createScene(chunk: Chunk, order: number) {
  return {
    id: `scene-${slug(chunk.title)}-${order}`,
    name: chunk.title,
    type: 'scene',
    order,
    text: chunk.body,
  };
}

function createNote(chunk: Chunk, order: number, sceneId: string) {
  return {
    id: `note-${slug(chunk.title)}-${order}`,
    name: chunk.title,
    type: 'note',
    order,
    text: chunk.body,
    sceneId,
  };
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function alignTemplate(template: unknown, generated: unknown): unknown {
  if (Array.isArray(template) && Array.isArray(generated)) {
    return generated.map((item, index) => alignTemplate(template[index] ?? template[0], item));
  }

  if (isRecord(template) && isRecord(generated)) {
    const next: AnyRecord = {};
    for (const key of Object.keys(template)) {
      next[key] = key in generated ? alignTemplate(template[key], generated[key]) : template[key];
    }
    for (const key of Object.keys(generated)) {
      if (!(key in next)) {
        next[key] = generated[key];
      }
    }
    return next;
  }

  return generated ?? template;
}

export function createCocoforiaData(chunks: Chunk[], template?: unknown): unknown {
  const scenes = chunks
    .filter((chunk) => chunk.kind === 'SCENE')
    .map((chunk, index) => createScene(chunk, index + 1));

  const primaryScene =
    scenes[0] ??
    ({
      id: 'scene-main-1',
      name: 'Main Scene',
      type: 'scene',
      order: 1,
      text: '',
    } as const);

  const notes = chunks
    .filter((chunk) => chunk.kind === 'TEXT')
    .map((chunk, index) => createNote(chunk, index + 1, primaryScene.id));

  const generated = {
    version: 1,
    name: 'Atknot Export',
    entities: {
      scenes: scenes.length > 0 ? scenes : [primaryScene],
      notes,
    },
    meta: {
      exportedAt: new Date().toISOString(),
      source: 'Atknot Web',
    },
  };

  return template ? alignTemplate(template, generated) : generated;
}
