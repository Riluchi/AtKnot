export type ChunkKind = 'TEXT' | 'SCENE';

export type Chunk = {
  id: string;
  title: string;
  body: string;
  kind: ChunkKind;
  splitLines: number[];
};

export type PersistedStateV1 = {
  version: 1;
  chunks: Chunk[];
};

export type FilterKind = 'ALL' | ChunkKind;

export type Theme = 'light' | 'dark';

export type Language = 'ja' | 'en';

export type SplitMode = 'BEFORE' | 'AFTER';

export type PresentState = {
  chunks: Chunk[];
  selectedIds: string[];
  selectionAnchorId: string | null;
};

export type AppState = {
  present: PresentState;
  history: PresentState[];
  filterTitle: string;
  filterKind: FilterKind;
  splitMode: SplitMode;
  theme: Theme;
  language: Language;
  dirty: boolean;
  statusMessage: string;
  lastAutosaveHash: string;
};
