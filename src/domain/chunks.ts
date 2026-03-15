import { createDefaultChunk, sanitizeSplitLines } from './project';
import type { Chunk, ChunkKind, FilterKind } from './types';

export function matchesFilter(chunk: Chunk, titleFilter: string, kindFilter: FilterKind): boolean {
  const titleMatch = chunk.title.toLowerCase().includes(titleFilter.trim().toLowerCase());
  const kindMatch = kindFilter === 'ALL' || chunk.kind === kindFilter;
  return titleMatch && kindMatch;
}

export function getVisibleChunks(chunks: Chunk[], titleFilter: string, kindFilter: FilterKind): Chunk[] {
  return chunks.filter((chunk) => matchesFilter(chunk, titleFilter, kindFilter));
}

export function reorderChunks(chunks: Chunk[], activeId: string, targetId: string): Chunk[] {
  const fromIndex = chunks.findIndex((chunk) => chunk.id === activeId);
  const toIndex = chunks.findIndex((chunk) => chunk.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return chunks;
  }

  const next = [...chunks];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function updateChunk(chunks: Chunk[], id: string, updater: (chunk: Chunk) => Chunk): Chunk[] {
  return chunks.map((chunk) => (chunk.id === id ? updater(chunk) : chunk));
}

export function insertChunkAfter(chunks: Chunk[], afterId: string | null): { chunks: Chunk[]; insertedId: string } {
  const created = createDefaultChunk(chunks.length + 1);
  if (afterId === null) {
    return { chunks: [...chunks, created], insertedId: created.id };
  }

  const index = chunks.findIndex((chunk) => chunk.id === afterId);
  if (index === -1) {
    return { chunks: [...chunks, created], insertedId: created.id };
  }

  const next = [...chunks];
  next.splice(index + 1, 0, created);
  return { chunks: next, insertedId: created.id };
}

export function renameChunks(chunks: Chunk[], ids: string[], nextTitle: string): Chunk[] {
  const title = nextTitle.trim() || 'Untitled';
  if (ids.length <= 1) {
    return chunks.map((chunk) => (ids.includes(chunk.id) ? { ...chunk, title } : chunk));
  }

  let sequence = 0;
  return chunks.map((chunk) => {
    if (!ids.includes(chunk.id)) {
      return chunk;
    }
    sequence += 1;
    return { ...chunk, title: `${title} (${sequence})` };
  });
}

export function deleteChunks(chunks: Chunk[], ids: string[]): Chunk[] {
  const remaining = chunks.filter((chunk) => !ids.includes(chunk.id));
  return remaining.length > 0 ? remaining : [createDefaultChunk(1)];
}

export function mergeChunks(chunks: Chunk[], ids: string[]): { chunks: Chunk[]; mergedId: string | null } {
  const ordered = chunks.filter((chunk) => ids.includes(chunk.id));
  if (ordered.length < 2) {
    return { chunks, mergedId: ordered[0]?.id ?? null };
  }

  const [head, ...rest] = ordered;
  const merged: Chunk = {
    ...head,
    body: [head.body, ...rest.map((chunk) => chunk.body)].filter(Boolean).join('\n'),
    splitLines: [],
  };

  const next: Chunk[] = [];
  let inserted = false;
  for (const chunk of chunks) {
    if (!ids.includes(chunk.id)) {
      next.push(chunk);
      continue;
    }
    if (!inserted) {
      next.push(merged);
      inserted = true;
    }
  }

  return { chunks: next, mergedId: merged.id };
}

export function splitChunk(chunk: Chunk): Chunk[] {
  const lines = chunk.body.split('\n');
  const boundaries = sanitizeSplitLines(chunk.splitLines, chunk.body);
  if (boundaries.length === 0) {
    return [chunk];
  }

  const starts = [0, ...boundaries.map((line) => line - 1)];
  const ends = [...boundaries.map((line) => line - 1), lines.length];

  const segments: Array<Chunk | null> = starts.map((start, index) => {
      const segment = lines.slice(start, ends[index]).join('\n').trim();
      if (!segment) {
        return null;
      }

      return {
        id: index === 0 ? chunk.id : crypto.randomUUID(),
        title: index === 0 ? chunk.title : `${chunk.title} (${index + 1})`,
        body: segment,
        kind: chunk.kind,
        splitLines: [],
      };
    });

  return segments.filter((value): value is Chunk => value !== null);
}

export function applySplitToChunk(chunks: Chunk[], id: string): { chunks: Chunk[]; selectedIds: string[] } {
  const target = chunks.find((chunk) => chunk.id === id);
  if (!target) {
    return { chunks, selectedIds: [] };
  }

  const split = splitChunk(target);
  if (split.length <= 1) {
    return { chunks, selectedIds: [id] };
  }

  const next: Chunk[] = [];
  for (const chunk of chunks) {
    if (chunk.id === id) {
      next.push(...split);
    } else {
      next.push(chunk);
    }
  }

  return { chunks: next, selectedIds: split.map((chunk) => chunk.id) };
}

export function setChunkKind(chunks: Chunk[], ids: string[], kind: ChunkKind): Chunk[] {
  return chunks.map((chunk) => (ids.includes(chunk.id) ? { ...chunk, kind } : chunk));
}

export function toggleSplitLine(chunk: Chunk, line: number): Chunk {
  const hasLine = chunk.splitLines.includes(line);
  return {
    ...chunk,
    splitLines: sanitizeSplitLines(
      hasLine ? chunk.splitLines.filter((value) => value !== line) : [...chunk.splitLines, line],
      chunk.body,
    ),
  };
}

export function addSplitLines(chunk: Chunk, lines: number[]): Chunk {
  return {
    ...chunk,
    splitLines: sanitizeSplitLines([...chunk.splitLines, ...lines], chunk.body),
  };
}

export function clearSplitLines(chunk: Chunk): Chunk {
  return { ...chunk, splitLines: [] };
}

export function getSelectionRangeIds(visibleChunks: Chunk[], anchorId: string, currentId: string): string[] {
  const anchorIndex = visibleChunks.findIndex((chunk) => chunk.id === anchorId);
  const currentIndex = visibleChunks.findIndex((chunk) => chunk.id === currentId);
  if (anchorIndex === -1 || currentIndex === -1) {
    return [currentId];
  }
  const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
  return visibleChunks.slice(start, end + 1).map((chunk) => chunk.id);
}
