import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, MouseEvent, ReactNode } from 'react';
import './App.css';
import { createCocoforiaData } from './domain/cocoforia';
import type { ChunkKind, Language, Theme } from './domain/types';
import { useAtknotApp } from './hooks/useAtknotApp';
import { t } from './i18n';
import { downloadBlob, downloadText } from './services/download';
import { createZip, inspectZipEntries, readZipTextEntry } from './services/zip';

type ContextMenuState = {
  x: number;
  y: number;
  targetId: string;
} | null;

type IconButtonProps = {
  title: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
};

function IconOpen() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7.75A2.75 2.75 0 0 1 5.75 5h4.1l2 2h6.4A2.75 2.75 0 0 1 21 9.75v6.5A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25z" />
      <path d="M6.2 10.25h11.6" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.75h11.75L20 8v11.25A1.75 1.75 0 0 1 18.25 21H5.75A1.75 1.75 0 0 1 4 19.25V6.5A1.75 1.75 0 0 1 5.75 4.75z" />
      <path d="M8 4.75v5.5h7.5v-4" />
      <path d="M8 16h8" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M12 8.25v7.5" />
      <path d="m8.75 11.5 3.25-3.25 3.25 3.25" />
      <path d="M8 18.5h8" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 7H5v4.5" />
      <path d="M5.25 11a7 7 0 1 1 2.1 5" />
    </svg>
  );
}

function IconTheme(theme: Theme) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.8 3.2a8.8 8.8 0 1 0 6 12.7A9.8 9.8 0 0 1 14.8 3.2Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.54 5.46l-1.77 1.77M7.23 16.77l-1.77 1.77M18.54 18.54l-1.77-1.77M7.23 7.23 5.46 5.46" />
    </svg>
  );
}

function IconTextKind() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.5h14" />
      <path d="M12 6.5v11" />
      <path d="M8.5 17.5h7" />
    </svg>
  );
}

function IconSceneKind() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="6" width="15" height="12" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </svg>
  );
}

function IconAddSplit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4v16" />
      <path d="M11 12h9" />
      <path d="M15.5 7.5v9" />
    </svg>
  );
}

function IconClearSplit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4v16" />
      <path d="m11 8 8 8" />
      <path d="m19 8-8 8" />
    </svg>
  );
}

function IconCut() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7.5" cy="8" r="2.25" />
      <circle cx="7.5" cy="16" r="2.25" />
      <path d="m10 9.5 9-5" />
      <path d="m10 14.5 9 5" />
    </svg>
  );
}

function IconButton({ title, onClick, children, disabled = false }: IconButtonProps) {
  return (
    <button type="button" className="icon-button" title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function renderKindIcon(kind: ChunkKind) {
  return kind === 'TEXT' ? <IconTextKind /> : <IconSceneKind />;
}

function getSplitBoundariesFromSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  splitMode: 'BEFORE' | 'AFTER',
): number[] {
  const text = value.replace(/\r\n?/g, '\n');
  const startLine = text.slice(0, selectionStart).split('\n').length;
  const endLine = text.slice(0, selectionEnd).split('\n').length;
  const lineCount = text.split('\n').length;
  const boundaries: number[] = [];

  for (let line = startLine; line <= endLine; line += 1) {
    const boundary = splitMode === 'BEFORE' ? line - 1 : line;
    if (boundary >= 1 && boundary < lineCount) {
      boundaries.push(boundary);
    }
  }

  return [...new Set(boundaries)].sort((a, b) => a - b);
}

function timestampLabel(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

function getThemeTooltip(language: Language, theme: Theme): string {
  return theme === 'dark' ? t(language, 'themeDark') : t(language, 'themeLight');
}

function measureLineHeight(textarea: HTMLTextAreaElement): number {
  const computed = window.getComputedStyle(textarea);
  const parsed = Number.parseFloat(computed.lineHeight);
  return Number.isFinite(parsed) ? parsed : 24;
}

function computeWrappedLineRows(text: string, textarea: HTMLTextAreaElement): number[] {
  const computed = window.getComputedStyle(textarea);
  const font = computed.font || `${computed.fontSize} ${computed.fontFamily}`;
  const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
  const availableWidth = Math.max(textarea.clientWidth - paddingLeft - paddingRight, 1);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return text.split('\n').map(() => 1);
  }
  context.font = font;

  return text.split('\n').map((line) => {
    if (line.length === 0) {
      return 1;
    }
    let rows = 1;
    let width = 0;
    for (const char of line) {
      const advance = context.measureText(char).width;
      if (width + advance > availableWidth) {
        rows += 1;
        width = advance;
      } else {
        width += advance;
      }
    }
    return rows;
  });
}

export default function App() {
  const {
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
    serialize,
    setFilterTitle,
    setFilterKind,
    setTheme,
    setLanguage,
    setSplitMode,
    setStatus,
    undo,
    markSaved,
  } = useAtknotApp();

  const language = state.language;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const roomZipInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [lineHeights, setLineHeights] = useState<number[]>([24]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [exportDownload, setExportDownload] = useState<{ url: string; filename: string } | null>(null);

  const lineCount = selectedChunk ? selectedChunk.body.split('\n').length : 1;

  useLayoutEffect(() => {
    if (!textareaRef.current || !selectedChunk) {
      return;
    }
    const textarea = textareaRef.current;
    const lineHeight = measureLineHeight(textarea);
    const rows = computeWrappedLineRows(selectedChunk.body, textarea);
    setLineHeights(rows.map((rowCount) => rowCount * lineHeight));
  }, [selectedChunk]);

  useEffect(() => {
    function handleResize() {
      if (!textareaRef.current || !selectedChunk) {
        return;
      }
      const textarea = textareaRef.current;
      const lineHeight = measureLineHeight(textarea);
      const rows = computeWrappedLineRows(selectedChunk.body, textarea);
      setLineHeights(rows.map((rowCount) => rowCount * lineHeight));
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedChunk]);

  function localizedStatus(): string {
    return t(language, state.statusMessage);
  }

  function pushDebugLog(message: string) {
    const stamped = `${new Date().toISOString()} ${message}`;
    console.debug('[AtKnot export]', stamped);
    setDebugLogs((prev) => [stamped, ...prev].slice(0, 20));
  }

  function promptRename(defaultTitle: string): string | null {
    return window.prompt(t(language, 'renamePrompt'), defaultTitle);
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  useEffect(() => {
    function onWindowClick() {
      setContextMenu(null);
    }
    window.addEventListener('click', onWindowClick);
    return () => window.removeEventListener('click', onWindowClick);
  }, []);

  useEffect(() => {
    return () => {
      if (exportDownload) {
        URL.revokeObjectURL(exportDownload.url);
      }
    };
  }, [exportDownload]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        downloadText(serialize(), 'project.atknot.json');
        markSaved();
        return;
      }

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        if (!selectedChunk) {
          return;
        }
        const title = window.prompt(t(language, 'renamePrompt'), selectedChunk.title);
        if (title !== null) {
          renameSelected(title);
        }
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (document.activeElement === textareaRef.current || visibleChunks.length === 0) {
          return;
        }
        event.preventDefault();
        const currentIndex = visibleChunks.findIndex((chunk) => chunk.id === selectedChunk?.id);
        const delta = event.key === 'ArrowUp' ? -1 : 1;
        const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleChunks.length - 1);
        const nextChunk = visibleChunks[nextIndex];
        if (nextChunk) {
          selectChunk(nextChunk.id);
        }
        return;
      }

      const splitShortcut =
        (modifier && event.shiftKey && event.key.toLowerCase() === 'l') ||
        (event.altKey && event.key === 'Enter');
      if (!splitShortcut || document.activeElement !== textareaRef.current || !selectedChunk || !textareaRef.current) {
        return;
      }

      event.preventDefault();
      const boundaries = getSplitBoundariesFromSelection(
        textareaRef.current.value,
        textareaRef.current.selectionStart,
        textareaRef.current.selectionEnd,
        state.splitMode,
      );
      if (boundaries.length > 0) {
        addSelectedSplitLines(boundaries);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    addSelectedSplitLines,
    language,
    markSaved,
    renameSelected,
    selectChunk,
    selectedChunk,
    serialize,
    state.splitMode,
    undo,
    visibleChunks,
  ]);

  async function handleImportProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      importProject(await file.text());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON parse error';
      window.alert(`${t(language, 'projectLoadFailed')}: ${message}`);
    } finally {
      event.target.value = '';
    }
  }

  async function handleExportRoom(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      pushDebugLog(`Selected zip: ${file.name} (${file.size} bytes)`);
      const entries = await inspectZipEntries(file);
      pushDebugLog(`ZIP entries: ${[...entries.keys()].join(', ')}`);
      const tokenEntries = [...entries.values()].filter((entry) => entry.name.endsWith('.token'));
      if (tokenEntries.length === 0) {
        throw new Error(t(language, 'noTokenFound'));
      }
      const templateEntry = entries.get('__data.json');
      let templateJson: unknown | undefined;
      if (templateEntry) {
        try {
          const templateText = await readZipTextEntry(templateEntry);
          templateJson = JSON.parse(templateText);
          pushDebugLog(`Loaded template __data.json (${templateText.length} chars)`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown template read error';
          pushDebugLog(`Template read failed, fallback to generated base: ${message}`);
        }
      } else {
        pushDebugLog('Template __data.json not found, fallback to generated base.');
      }

      const generatedData = createCocoforiaData(state.present.chunks, templateJson);
      const encoder = new TextEncoder();
      const zipEntries = [
        ...tokenEntries.map((entry) => ({
          mode: 'raw' as const,
          name: entry.name,
          compressionMethod: entry.compressionMethod,
          compressedData: entry.compressedData,
          compressedSize: entry.compressedSize,
          uncompressedSize: entry.uncompressedSize,
          crc32: entry.crc32,
        })),
        {
          mode: 'store' as const,
          name: '__data.json',
          data: encoder.encode(JSON.stringify(generatedData, null, 2)),
        },
      ];
      pushDebugLog(
        `Generated export entries: ${zipEntries
          .map((entry) => `${entry.name}(${entry.mode === 'raw' ? entry.compressedSize : entry.data.length})`)
          .join(', ')}`,
      );
      const zipBlob = createZip(zipEntries);
      const filename = `importableRoom_${timestampLabel()}.zip`;
      const url = URL.createObjectURL(zipBlob);
      setExportDownload((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev.url);
        }
        return { url, filename };
      });
      downloadBlob(zipBlob, filename);
      setStatus('exportReady');
      pushDebugLog(`Created ZIP blob: ${zipBlob.size} bytes as ${filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown export error';
      pushDebugLog(`Export error: ${message}`);
      window.alert(`${t(language, 'exportFailed')}: ${message}`);
    } finally {
      event.target.value = '';
    }
  }

  function triggerSplitFromTextarea() {
    if (!textareaRef.current || !selectedChunk) {
      return;
    }
    const boundaries = getSplitBoundariesFromSelection(
      textareaRef.current.value,
      textareaRef.current.selectionStart,
      textareaRef.current.selectionEnd,
      state.splitMode,
    );
    if (boundaries.length === 0) {
      window.alert(t(language, 'noSplitAfterLastLine'));
      return;
    }
    addSelectedSplitLines(boundaries);
  }

  function handleLineMarkerClick(line: number, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setSplitLine(line);
  }

  function handleEditorScroll() {
    if (!textareaRef.current || !gutterRef.current) {
      return;
    }
    gutterRef.current.scrollTop = textareaRef.current.scrollTop;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AtKnot</div>
          <p>{t(language, 'appTagline')}</p>
        </div>
        <div className="toolbar">
          <div className="language-toggle">
            <button type="button" className={language === 'ja' ? 'is-active' : ''} onClick={() => setLanguage('ja')}>
              {t(language, 'languageJa')}
            </button>
            <button type="button" className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')}>
              {t(language, 'languageEn')}
            </button>
          </div>
          <IconButton title={t(language, 'openJson')} onClick={() => fileInputRef.current?.click()}>
            <IconOpen />
          </IconButton>
          <IconButton
            title={t(language, 'saveJson')}
            onClick={() => {
              downloadText(serialize(), 'project.atknot.json');
              markSaved();
            }}
          >
            <IconSave />
          </IconButton>
          <IconButton title={t(language, 'exportRoomZip')} onClick={() => roomZipInputRef.current?.click()}>
            <IconExport />
          </IconButton>
          <IconButton title={t(language, 'undo')} onClick={undo}>
            <IconUndo />
          </IconButton>
          <IconButton title={getThemeTooltip(language, state.theme)} onClick={toggleTheme}>
            {IconTheme(state.theme)}
          </IconButton>
          <input ref={fileInputRef} type="file" accept=".json,.atknot.json" hidden onChange={handleImportProject} />
          <input ref={roomZipInputRef} type="file" accept=".zip" hidden onChange={handleExportRoom} />
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="panel">
            <div className="filter-grid">
              <label>
                <span>{t(language, 'titleFilter')}</span>
                <input
                  value={state.filterTitle}
                  onChange={(event) => setFilterTitle(event.target.value)}
                  placeholder={t(language, 'titlePlaceholder')}
                />
              </label>
              <label>
                <span>{t(language, 'kindFilter')}</span>
                <select value={state.filterKind} onChange={(event) => setFilterKind(event.target.value as 'ALL' | 'TEXT' | 'SCENE')}>
                  <option value="ALL">{t(language, 'all')}</option>
                  <option value="TEXT">{t(language, 'text')}</option>
                  <option value="SCENE">{t(language, 'scene')}</option>
                </select>
              </label>
            </div>

            <div className="sidebar-actions">
              <button type="button" onClick={() => insertAfter(selectedChunk?.id ?? null)}>
                {t(language, 'add')}
              </button>
              <button type="button" onClick={() => removeSelected()} disabled={state.present.selectedIds.length === 0}>
                {t(language, 'delete')}
              </button>
              <button type="button" onClick={() => mergeSelected()} disabled={state.present.selectedIds.length < 2}>
                {t(language, 'merge')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const title = promptRename(selectedChunk?.title ?? '');
                  if (title !== null) {
                    renameSelected(title);
                  }
                }}
                disabled={state.present.selectedIds.length === 0}
              >
                {t(language, 'rename')}
              </button>
            </div>
          </div>

          <div className="chunk-list panel">
            {visibleChunks.map((chunk) => {
              const selected = state.present.selectedIds.includes(chunk.id);
              const dragDisabled = state.filterTitle.trim() !== '' || state.filterKind !== 'ALL';
              return (
                <button
                  key={chunk.id}
                  type="button"
                  className={`chunk-row${selected ? ' is-selected' : ''}`}
                  draggable={!dragDisabled}
                  onDragStart={() => setDraggedId(chunk.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragDisabled || !draggedId) {
                      return;
                    }
                    moveChunk(draggedId, chunk.id);
                    setDraggedId(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (!selected) {
                      selectChunk(chunk.id);
                    }
                    setContextMenu({ x: event.clientX, y: event.clientY, targetId: chunk.id });
                  }}
                  onClick={(event) =>
                    selectChunk(chunk.id, {
                      additive: event.ctrlKey || event.metaKey,
                      range: event.shiftKey,
                    })
                  }
                >
                  <span className="drag-handle" aria-hidden="true">
                    {dragDisabled ? '•' : '⋮⋮'}
                  </span>
                  <span className={`kind-icon kind-${chunk.kind.toLowerCase()}`} title={t(language, chunk.kind === 'TEXT' ? 'text' : 'scene')}>
                    {renderKindIcon(chunk.kind)}
                  </span>
                  <span className="chunk-title">{chunk.title}</span>
                </button>
              );
            })}
            {visibleChunks.length === 0 ? <p className="empty-state">{t(language, 'noChunks')}</p> : null}
          </div>
        </aside>

        <main className="editor-pane">
          {selectedChunk ? (
            <div className="panel editor-card">
              <div className="editor-header">
                <label>
                  <span>{t(language, 'title')}</span>
                  <input value={selectedChunk.title} onChange={(event) => updateTitle(selectedChunk.id, event.target.value)} />
                </label>
                <div className="kind-toggle-group">
                  <span>{t(language, 'kind')}</span>
                  <div className="kind-toggle">
                    {(['TEXT', 'SCENE'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={selectedChunk.kind === kind ? 'is-active' : ''}
                        title={t(language, kind === 'TEXT' ? 'text' : 'scene')}
                        onClick={() => updateKind(kind)}
                      >
                        {renderKindIcon(kind)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="editor-body">
                <span>{t(language, 'body')}</span>
                <div className="editor-frame">
                  <div ref={gutterRef} className="editor-gutter" aria-hidden="true">
                    {Array.from({ length: lineCount }, (_, index) => {
                      const line = index + 1;
                      const isMarker = selectedChunk.splitLines.includes(line);
                      const isToggleEnabled = line < lineCount;
                      const style = { height: `${lineHeights[index] ?? 24}px` } as CSSProperties;
                      return (
                        <button
                          key={line}
                          type="button"
                          className={`gutter-line${isMarker ? ' has-marker' : ''}`}
                          style={style}
                          title={isToggleEnabled ? `${t(language, 'splitChunk')} ${line}` : ''}
                          onClick={(event) => isToggleEnabled && handleLineMarkerClick(line, event)}
                          disabled={!isToggleEnabled}
                        >
                          <span className="gutter-dot" />
                          <span className="gutter-number">{line}</span>
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={selectedChunk.body}
                    onChange={(event) => updateBody(selectedChunk.id, event.target.value)}
                    onScroll={handleEditorScroll}
                    spellCheck={false}
                    wrap="soft"
                  />
                </div>
              </div>

              <div className="split-toolbar">
                <label>
                  <span>{t(language, 'splitMode')}</span>
                  <select value={state.splitMode} onChange={(event) => setSplitMode(event.target.value as 'BEFORE' | 'AFTER')}>
                    <option value="BEFORE">{t(language, 'splitBefore')}</option>
                    <option value="AFTER">{t(language, 'splitAfter')}</option>
                  </select>
                </label>
                <button type="button" className="action-button" onClick={triggerSplitFromTextarea}>
                  <IconAddSplit />
                  <span>{t(language, 'selectedLinesSplit')}</span>
                </button>
                <button type="button" className="action-button" onClick={clearSelectedSplitLines}>
                  <IconClearSplit />
                  <span>{t(language, 'clearSplitLines')}</span>
                </button>
                <button type="button" className="action-button" onClick={splitSelectedChunk}>
                  <IconCut />
                  <span>{t(language, 'splitChunk')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="panel empty-state">{t(language, 'selectChunkToEdit')}</div>
          )}

          <div className="panel help-card">
            <h2>{t(language, 'shortcuts')}</h2>
            <ul>
              <li>
                <kbd>Ctrl/Cmd + S</kbd> {t(language, 'saveJson')}
              </li>
              <li>
                <kbd>Ctrl/Cmd + Z</kbd> {t(language, 'undo')}
              </li>
              <li>
                <kbd>F2</kbd> {t(language, 'rename')}
              </li>
              <li>
                <kbd>Arrow Up/Down</kbd> {t(language, 'moveSelection')}
              </li>
              <li>
                <kbd>Ctrl/Cmd + Shift + L</kbd> {t(language, 'selectedLinesSplit')}
              </li>
              <li>
                <kbd>Alt + Enter</kbd> {t(language, 'selectedLinesSplit')}
              </li>
            </ul>
            <p className="status-line">{localizedStatus()}</p>
            {exportDownload ? (
              <p className="download-row">
                <a href={exportDownload.url} download={exportDownload.filename}>
                  {t(language, 'downloadExport')}
                </a>
              </p>
            ) : null}
            <div className="debug-log">
              <h3>{t(language, 'debugLog')}</h3>
              {debugLogs.length === 0 ? null : (
                <ul>
                  {debugLogs.map((log) => (
                    <li key={log}>{log}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </main>
      </section>

      {contextMenu ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => insertAfter(contextMenu.targetId)}>
            {t(language, 'insertBelow')}
          </button>
          <button type="button" onClick={() => removeSelected([contextMenu.targetId])}>
            {t(language, 'delete')}
          </button>
          <button type="button" disabled={state.present.selectedIds.length < 2} onClick={() => mergeSelected()}>
            {t(language, 'mergeSelected')}
          </button>
          <button
            type="button"
            onClick={() => {
              const title = promptRename(selectedChunk?.title ?? '');
              if (title !== null) {
                renameSelected(title);
              }
            }}
          >
            {t(language, 'rename')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
