import { useEffect, useMemo, useReducer } from 'react';
import {
  applySplitToChunk,
  clearSplitLines,
  deleteChunks,
  getSelectionRangeIds,
  getVisibleChunks,
  insertChunkAfter,
  addSplitLines,
  mergeChunks,
  renameChunks,
  reorderChunks,
  setChunkKind,
  toggleSplitLine,
  updateChunk,
} from '../domain/chunks';
import { createDefaultProject, normalizeChunk, parsePersistedProject, serializeProject } from '../domain/project';
import type { AppState, Chunk, ChunkKind, FilterKind, Language, PresentState, Theme } from '../domain/types';
import { loadAutosave, saveAutosave } from '../services/storage';

type Action =
  | { type: 'select'; ids: string[]; anchorId: string | null }
  | { type: 'setFilters'; title: string; kind: FilterKind }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setLanguage'; language: Language }
  | { type: 'setSplitMode'; splitMode: AppState['splitMode'] }
  | {
      type: 'setChunks';
      chunks: Chunk[];
      selectedIds?: string[];
      anchorId?: string | null;
      message: string;
      undoable?: boolean;
      dirty?: boolean;
    }
  | { type: 'undo' }
  | { type: 'setStatus'; message: string }
  | { type: 'setDirty'; dirty: boolean; message: string }
  | { type: 'setAutosaveHash'; hash: string };

function snapshot(state: PresentState): PresentState {
  return {
    chunks: state.chunks.map((chunk) => ({ ...chunk, splitLines: [...chunk.splitLines] })),
    selectedIds: [...state.selectedIds],
    selectionAnchorId: state.selectionAnchorId,
  };
}

function samePresent(a: PresentState, b: PresentState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const defaultProject = createDefaultProject();
const initialPresent: PresentState = {
  chunks: defaultProject.chunks,
  selectedIds: [defaultProject.chunks[0].id],
  selectionAnchorId: defaultProject.chunks[0].id,
};

const initialState: AppState = {
  present: initialPresent,
  history: [],
  filterTitle: '',
  filterKind: 'ALL',
  splitMode: 'AFTER',
  theme: 'dark',
  language: 'ja',
  dirty: false,
  statusMessage: 'ready',
  lastAutosaveHash: '',
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'select':
      return {
        ...state,
        present: {
          ...state.present,
          selectedIds: action.ids,
          selectionAnchorId: action.anchorId,
        },
      };
    case 'setFilters':
      return { ...state, filterTitle: action.title, filterKind: action.kind };
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'setLanguage':
      return { ...state, language: action.language };
    case 'setSplitMode':
      return { ...state, splitMode: action.splitMode };
    case 'setStatus':
      return { ...state, statusMessage: action.message };
    case 'setDirty':
      return { ...state, dirty: action.dirty, statusMessage: action.message };
    case 'setAutosaveHash':
      return { ...state, lastAutosaveHash: action.hash };
    case 'undo': {
      const previous = state.history[state.history.length - 1];
      if (!previous) {
        return { ...state, statusMessage: 'undoEmpty' };
      }
      return {
        ...state,
        present: previous,
        history: state.history.slice(0, -1),
        dirty: true,
        statusMessage: 'undoApplied',
      };
    }
    case 'setChunks': {
      const nextPresent: PresentState = {
        chunks: action.chunks,
        selectedIds: action.selectedIds ?? state.present.selectedIds,
        selectionAnchorId: action.anchorId ?? state.present.selectionAnchorId,
      };

      if (samePresent(state.present, nextPresent)) {
        return { ...state, statusMessage: action.message };
      }

      const history =
        action.undoable === false ? state.history : [...state.history, snapshot(state.present)].slice(-30);

      return {
        ...state,
        present: nextPresent,
        history,
        dirty: action.dirty ?? true,
        statusMessage: action.message,
      };
    }
  }
}

function hashContent(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return String(hash);
}

export function useAtknotApp() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const visibleChunks = useMemo(
    () => getVisibleChunks(state.present.chunks, state.filterTitle, state.filterKind),
    [state.present.chunks, state.filterTitle, state.filterKind],
  );

  const selectedChunk =
    state.present.chunks.find((chunk) => chunk.id === state.present.selectedIds[0]) ?? state.present.chunks[0];

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    const autosave = loadAutosave();
    if (!autosave) {
      return;
    }

    const currentSerialized = serializeProject(initialPresent.chunks);
    if (autosave === currentSerialized) {
      dispatch({ type: 'setAutosaveHash', hash: hashContent(autosave) });
      return;
    }

    if (!window.confirm('autosave から前回の作業状態を復元しますか？')) {
      return;
    }

    try {
      const restored = parsePersistedProject(autosave);
      const firstId = restored.chunks[0]?.id ?? null;
      dispatch({
        type: 'setChunks',
        chunks: restored.chunks,
        selectedIds: firstId ? [firstId] : [],
        anchorId: firstId,
        undoable: false,
        dirty: true,
        message: 'autosaveRestored',
      });
      dispatch({ type: 'setAutosaveHash', hash: hashContent(autosave) });
    } catch {
      dispatch({ type: 'setStatus', message: 'autosaveRestoreFailed' });
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!state.dirty) {
        return;
      }
      const serialized = serializeProject(state.present.chunks);
      const nextHash = hashContent(serialized);
      if (nextHash === state.lastAutosaveHash) {
        return;
      }
      saveAutosave(serialized);
      dispatch({ type: 'setAutosaveHash', hash: nextHash });
      dispatch({ type: 'setStatus', message: 'autosaved' });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [state.dirty, state.lastAutosaveHash, state.present.chunks]);

  function selectChunk(id: string, options?: { additive?: boolean; range?: boolean }) {
    const { additive = false, range = false } = options ?? {};
    if (range && state.present.selectionAnchorId) {
      const rangeIds = getSelectionRangeIds(visibleChunks, state.present.selectionAnchorId, id);
      dispatch({ type: 'select', ids: rangeIds, anchorId: state.present.selectionAnchorId });
      return;
    }

    if (additive) {
      const exists = state.present.selectedIds.includes(id);
      const ids = exists
        ? state.present.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.present.selectedIds, id];
      dispatch({ type: 'select', ids: ids.length > 0 ? ids : [id], anchorId: id });
      return;
    }

    dispatch({ type: 'select', ids: [id], anchorId: id });
  }

  function insertAfter(id: string | null) {
    const result = insertChunkAfter(state.present.chunks, id);
    dispatch({
      type: 'setChunks',
      chunks: result.chunks,
      selectedIds: [result.insertedId],
      anchorId: result.insertedId,
      message: 'chunkInserted',
    });
  }

  function removeSelected(ids = state.present.selectedIds) {
    const next = deleteChunks(state.present.chunks, ids);
    const selectedId = next[0]?.id ?? null;
    dispatch({
      type: 'setChunks',
      chunks: next,
      selectedIds: selectedId ? [selectedId] : [],
      anchorId: selectedId,
      message: 'chunkDeleted',
    });
  }

  function mergeSelected(ids = state.present.selectedIds) {
    const result = mergeChunks(state.present.chunks, ids);
    if (!result.mergedId || ids.length < 2) {
      dispatch({ type: 'setStatus', message: 'selectTwoToMerge' });
      return;
    }
    dispatch({
      type: 'setChunks',
      chunks: result.chunks,
      selectedIds: [result.mergedId],
      anchorId: result.mergedId,
      message: 'chunksMerged',
    });
  }

  function renameSelected(title: string, ids = state.present.selectedIds) {
    dispatch({
      type: 'setChunks',
      chunks: renameChunks(state.present.chunks, ids, title),
      message: 'titleUpdated',
    });
  }

  function updateBody(id: string, body: string) {
    dispatch({
      type: 'setChunks',
      chunks: updateChunk(state.present.chunks, id, (chunk) => normalizeChunk({ ...chunk, body })),
      message: 'bodyUpdated',
    });
  }

  function updateTitle(id: string, title: string) {
    dispatch({
      type: 'setChunks',
      chunks: updateChunk(state.present.chunks, id, (chunk) => ({ ...chunk, title })),
      message: 'titleUpdated',
    });
  }

  function updateKind(kind: ChunkKind, ids = state.present.selectedIds) {
    dispatch({
      type: 'setChunks',
      chunks: setChunkKind(state.present.chunks, ids, kind),
      message: 'kindUpdated',
    });
  }

  function moveChunk(activeId: string, targetId: string) {
    dispatch({
      type: 'setChunks',
      chunks: reorderChunks(state.present.chunks, activeId, targetId),
      message: 'chunkReordered',
    });
  }

  function setSplitLine(line: number) {
    if (!selectedChunk) {
      return;
    }
    dispatch({
      type: 'setChunks',
      chunks: updateChunk(state.present.chunks, selectedChunk.id, (chunk) => toggleSplitLine(chunk, line)),
      message: 'splitLineUpdated',
    });
  }

  function addSelectedSplitLines(lines: number[]) {
    if (!selectedChunk || lines.length === 0) {
      return;
    }
    dispatch({
      type: 'setChunks',
      chunks: updateChunk(state.present.chunks, selectedChunk.id, (chunk) => addSplitLines(chunk, lines)),
      message: 'splitLineUpdated',
    });
  }

  function clearSelectedSplitLines() {
    if (!selectedChunk) {
      return;
    }
    dispatch({
      type: 'setChunks',
      chunks: updateChunk(state.present.chunks, selectedChunk.id, clearSplitLines),
      message: 'splitLinesCleared',
    });
  }

  function splitSelectedChunk() {
    if (!selectedChunk) {
      return;
    }
    const result = applySplitToChunk(state.present.chunks, selectedChunk.id);
    dispatch({
      type: 'setChunks',
      chunks: result.chunks,
      selectedIds: result.selectedIds,
      anchorId: result.selectedIds[0] ?? null,
      message: result.selectedIds.length > 1 ? 'chunkSplit' : 'noSplitApplied',
    });
  }

  function importProject(text: string) {
    const parsed = parsePersistedProject(text);
    const firstId = parsed.chunks[0]?.id ?? null;
    dispatch({
      type: 'setChunks',
      chunks: parsed.chunks,
      selectedIds: firstId ? [firstId] : [],
      anchorId: firstId,
      undoable: false,
      dirty: false,
      message: 'projectLoaded',
    });
    dispatch({ type: 'setAutosaveHash', hash: hashContent(serializeProject(parsed.chunks)) });
  }

  return {
    state,
    visibleChunks,
    selectedChunk,
    selectChunk,
    insertAfter,
    removeSelected,
    mergeSelected,
    renameSelected,
    updateBody,
    updateTitle,
    updateKind,
    moveChunk,
    setSplitLine,
    addSelectedSplitLines,
    clearSelectedSplitLines,
    splitSelectedChunk,
    importProject,
    serialize: () => serializeProject(state.present.chunks),
    setFilterTitle: (title: string) => dispatch({ type: 'setFilters', title, kind: state.filterKind }),
    setFilterKind: (kind: FilterKind) => dispatch({ type: 'setFilters', title: state.filterTitle, kind }),
    setTheme: (theme: Theme) => dispatch({ type: 'setTheme', theme }),
    setLanguage: (language: Language) => dispatch({ type: 'setLanguage', language }),
    setSplitMode: (splitMode: AppState['splitMode']) => dispatch({ type: 'setSplitMode', splitMode }),
    setStatus: (message: string) => dispatch({ type: 'setStatus', message }),
    undo: () => dispatch({ type: 'undo' }),
    markSaved: () => dispatch({ type: 'setDirty', dirty: false, message: 'projectExported' }),
  };
}
