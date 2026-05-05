import type { Chunk } from './types';

type AnyRecord = Record<string, unknown>;

type CocoforiaTemplate = {
  meta?: AnyRecord;
  entities?: {
    room?: AnyRecord;
    items?: Record<string, unknown>;
    decks?: Record<string, unknown>;
    notes?: Record<string, unknown>;
    characters?: Record<string, unknown>;
    effects?: Record<string, unknown>;
    scenes?: Record<string, unknown>;
    savedatas?: Record<string, unknown>;
    snapshots?: Record<string, unknown>;
  };
  resources?: Record<string, unknown>;
};

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
    order,
    ...(chunk.fieldWidth !== undefined ? { fieldWidth: chunk.fieldWidth } : {}),
    ...(chunk.fieldHeight !== undefined ? { fieldHeight: chunk.fieldHeight } : {}),
    bgUrl: null,
    bgVisible: true,
    items: [],
    effects: [],
    text: chunk.body,
    archived: false,
  };
}

function createNote(chunk: Chunk, order: number, sceneId: string) {
  return {
    id: `note-${slug(chunk.title)}-${order}`,
    name: chunk.title,
    order,
    text: chunk.body,
    sceneId,
    color: '#ffffff',
    textColor: '#1f2937',
    fontSize: 16,
    width: 320,
    height: 72,
    x: 0,
    y: (order - 1) * 96,
    z: order,
    isTransparent: false,
    archived: false,
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

function toRecordMap<T extends { id: string }>(entries: T[]): Record<string, Omit<T, 'id'>> {
  return Object.fromEntries(entries.map(({ id, ...rest }) => [id, rest]));
}

export function createCocoforiaData(chunks: Chunk[], template?: unknown): unknown {
  const baseTemplate = (template ?? {}) as CocoforiaTemplate;
  const scenes = chunks
    .filter((chunk) => chunk.kind === 'SCENE')
    .map((chunk, index) => createScene(chunk, index + 1));

  const primaryScene =
    scenes[0] ??
    ({
      id: 'scene-main-1',
      name: 'Main Scene',
      order: 1,
      bgUrl: null,
      bgVisible: true,
      items: [],
      effects: [],
      text: '',
      archived: false,
    } as const);

  const notes = chunks
    .filter((chunk) => chunk.kind === 'TEXT')
    .map((chunk, index) => createNote(chunk, index + 1, primaryScene.id));

  const generated = {
    meta: {
      ...(baseTemplate.meta ?? {}),
      version: baseTemplate.meta?.version ?? '1.1.0',
      exportedAt: new Date().toISOString(),
      source: 'Atknot Web',
    },
    entities: {
      room: {
        ...(baseTemplate.entities?.room ?? {}),
        sceneId: primaryScene.id,
      },
      items: { ...(baseTemplate.entities?.items ?? {}) },
      decks: { ...(baseTemplate.entities?.decks ?? {}) },
      notes: toRecordMap(notes),
      characters: { ...(baseTemplate.entities?.characters ?? {}) },
      effects: { ...(baseTemplate.entities?.effects ?? {}) },
      scenes: toRecordMap(scenes.length > 0 ? scenes : [primaryScene]),
      savedatas: { ...(baseTemplate.entities?.savedatas ?? {}) },
      snapshots: { ...(baseTemplate.entities?.snapshots ?? {}) },
    },
    resources: { ...(baseTemplate.resources ?? {}) },
  };

  return template ? alignTemplate(template, generated) : generated;
}
