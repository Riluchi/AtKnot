import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import './App.css';
import { createCocoforiaData } from './domain/cocoforia';
import type { ChunkKind, Language, Theme } from './domain/types';
import { useAtknotApp } from './hooks/useAtknotApp';
import { t } from './i18n';
import { downloadBlob, downloadText } from './services/download';
import { createZip, readZipEntries } from './services/zip';

type ContextMenuState = {
  x: number;
  y: number;
  targetId: string;
} | null;

const kindIcons: Record<ChunkKind, string> = {
  TEXT: 'T',
  SCENE: '🎬',
};

const toolbarIcons = {
  open: '📂',
  save: '💾',
  export: '🗜',
  undo: '↶',
  light: '☀',
  dark: '☾',
  language: '🌐',
};

function getLineBoundaryFromSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  splitMode: 'BEFORE' | 'AFTER',
): number | null {
  const text = value.replace(/\r\n?/g, '\n');
  const startLine = text.slice(0, selectionStart).split('\n').length;
  const endLine = text.slice(0, selectionEnd).split('\n').length;
  const boundary = splitMode === 'BEFORE' ? startLine : endLine;
  const lineCount = text.split('\n').length;
  if (boundary < 1 || boundary >= lineCount) {
    return null;
  }
  return boundary;
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
    clearSelectedSplitLines,
    splitSelectedChunk,
    importProject,
    serialize,
    setFilterTitle,
    setFilterKind,
    setTheme,
    setLanguage,
    setSplitMode,
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

  const lineCount = selectedChunk ? selectedChunk.body.split('\n').length : 1;

  function localizedStatus(): string {
    return t(language, state.statusMessage);
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
      const boundary = getLineBoundaryFromSelection(
        textareaRef.current.value,
        textareaRef.current.selectionStart,
        textareaRef.current.selectionEnd,
        state.splitMode,
      );
      if (boundary !== null) {
        setSplitLine(boundary);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    language,
    markSaved,
    renameSelected,
    selectChunk,
    selectedChunk,
    serialize,
    setSplitLine,
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
      const entries = await readZipEntries(file);
      const tokenEntry = [...entries.entries()].find(([name]) => name.endsWith('.token'));
      const templateEntry = entries.get('__data.json');
      const templateJson = templateEntry ? JSON.parse(new TextDecoder('utf-8').decode(templateEntry)) : undefined;
      const generatedData = createCocoforiaData(state.present.chunks, templateJson);
      const encoder = new TextEncoder();
      const zipBlob = createZip([
        ...(tokenEntry ? [{ name: tokenEntry[0], data: tokenEntry[1] }] : []),
        { name: '__data.json', data: encoder.encode(JSON.stringify(generatedData, null, 2)) },
      ]);
      downloadBlob(zipBlob, `importableRoom_${timestampLabel()}.zip`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown export error';
      window.alert(`${t(language, 'exportFailed')}: ${message}`);
    } finally {
      event.target.value = '';
    }
  }

  function triggerSplitFromTextarea() {
    if (!textareaRef.current || !selectedChunk) {
      return;
    }
    const boundary = getLineBoundaryFromSelection(
      textareaRef.current.value,
      textareaRef.current.selectionStart,
      textareaRef.current.selectionEnd,
      state.splitMode,
    );
    if (boundary === null) {
      window.alert(t(language, 'noSplitAfterLastLine'));
      return;
    }
    setSplitLine(boundary);
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
          <div className="language-toggle" aria-label={toolbarIcons.language}>
            <button type="button" className={language === 'ja' ? 'is-active' : ''} onClick={() => setLanguage('ja')}>
              {t(language, 'languageJa')}
            </button>
            <button type="button" className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')}>
              {t(language, 'languageEn')}
            </button>
          </div>
          <button type="button" className="icon-button" title={t(language, 'openJson')} onClick={() => fileInputRef.current?.click()}>
            {toolbarIcons.open}
          </button>
          <button
            type="button"
            className="icon-button"
            title={t(language, 'saveJson')}
            onClick={() => {
              downloadText(serialize(), 'project.atknot.json');
              markSaved();
            }}
          >
            {toolbarIcons.save}
          </button>
          <button type="button" className="icon-button" title={t(language, 'exportRoomZip')} onClick={() => roomZipInputRef.current?.click()}>
            {toolbarIcons.export}
          </button>
          <button type="button" className="icon-button" title={t(language, 'undo')} onClick={undo}>
            {toolbarIcons.undo}
          </button>
          <button type="button" className="icon-button" title={getThemeTooltip(language, state.theme)} onClick={toggleTheme}>
            {state.theme === 'dark' ? toolbarIcons.dark : toolbarIcons.light}
          </button>
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
                    {kindIcons[chunk.kind]}
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
                        {kindIcons[kind]}
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
                      return (
                        <button
                          key={line}
                          type="button"
                          className={`gutter-line${isMarker ? ' has-marker' : ''}`}
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
                    wrap="off"
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
                <button type="button" onClick={triggerSplitFromTextarea}>
                  {t(language, 'addSplitFromSelection')}
                </button>
                <button type="button" onClick={clearSelectedSplitLines}>
                  {t(language, 'clearSplitLines')}
                </button>
                <button type="button" onClick={splitSelectedChunk}>
                  {t(language, 'splitChunk')}
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
                <kbd>Ctrl/Cmd + Shift + L</kbd> {t(language, 'addSplitFromSelection')}
              </li>
              <li>
                <kbd>Alt + Enter</kbd> {t(language, 'addSplitFromSelection')}
              </li>
            </ul>
            <p className="status-line">{localizedStatus()}</p>
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
