import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import './App.css';
import { createCocoforiaData } from './domain/cocoforia';
import { useAtknotApp } from './hooks/useAtknotApp';
import { downloadBlob, downloadText } from './services/download';
import { createZip, readZipEntries } from './services/zip';

type ContextMenuState = {
  x: number;
  y: number;
  targetId: string;
} | null;

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
    setSplitMode,
    undo,
    markSaved,
  } = useAtknotApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const roomZipInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

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
        const title = window.prompt('新しいタイトル', selectedChunk.title);
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

      const splitShortcut = (modifier && event.shiftKey && event.key.toLowerCase() === 'l') || (event.altKey && event.key === 'Enter');
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
  }, [markSaved, renameSelected, selectChunk, selectedChunk, serialize, setSplitLine, state.splitMode, undo, visibleChunks]);

  async function handleImportProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      importProject(await file.text());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON parse error';
      window.alert(`Project load failed: ${message}`);
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
      window.alert(`Cocoforia export failed: ${message}`);
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
      window.alert('最終行の後ろには split line を追加できません。');
      return;
    }
    setSplitLine(boundary);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AtKnot</div>
          <p>Chunk editor for Cocoforia on GitHub Pages</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Open JSON
          </button>
          <button
            type="button"
            onClick={() => {
              downloadText(serialize(), 'project.atknot.json');
              markSaved();
            }}
          >
            Save JSON
          </button>
          <button type="button" onClick={() => roomZipInputRef.current?.click()}>
            Export Room ZIP
          </button>
          <button type="button" onClick={undo}>
            Undo
          </button>
          <button type="button" onClick={() => setTheme(state.theme === 'dark' ? 'light' : 'dark')}>
            Theme: {state.theme}
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
                <span>Title filter</span>
                <input value={state.filterTitle} onChange={(event) => setFilterTitle(event.target.value)} placeholder="Search title" />
              </label>
              <label>
                <span>Kind filter</span>
                <select value={state.filterKind} onChange={(event) => setFilterKind(event.target.value as 'ALL' | 'TEXT' | 'SCENE')}>
                  <option value="ALL">ALL</option>
                  <option value="TEXT">TEXT</option>
                  <option value="SCENE">SCENE</option>
                </select>
              </label>
            </div>

            <div className="sidebar-actions">
              <button type="button" onClick={() => insertAfter(selectedChunk?.id ?? null)}>
                Add
              </button>
              <button type="button" onClick={() => removeSelected()} disabled={state.present.selectedIds.length === 0}>
                Delete
              </button>
              <button type="button" onClick={() => mergeSelected()} disabled={state.present.selectedIds.length < 2}>
                Merge
              </button>
              <button
                type="button"
                onClick={() => {
                  const title = window.prompt('新しいタイトル', selectedChunk?.title ?? '');
                  if (title !== null) {
                    renameSelected(title);
                  }
                }}
                disabled={state.present.selectedIds.length === 0}
              >
                Rename
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
                  <span className={`kind-pill kind-${chunk.kind.toLowerCase()}`}>{chunk.kind}</span>
                  <span className="chunk-title">{chunk.title}</span>
                </button>
              );
            })}
            {visibleChunks.length === 0 ? <p className="empty-state">No chunks match the current filter.</p> : null}
          </div>
        </aside>

        <main className="editor-pane">
          {selectedChunk ? (
            <div className="panel editor-card">
              <div className="editor-header">
                <label>
                  <span>Title</span>
                  <input value={selectedChunk.title} onChange={(event) => updateTitle(selectedChunk.id, event.target.value)} />
                </label>
                <label>
                  <span>Kind</span>
                  <select value={selectedChunk.kind} onChange={(event) => updateKind(event.target.value as 'TEXT' | 'SCENE')}>
                    <option value="TEXT">TEXT</option>
                    <option value="SCENE">SCENE</option>
                  </select>
                </label>
              </div>

              <label className="editor-body">
                <span>Body</span>
                <textarea
                  ref={textareaRef}
                  value={selectedChunk.body}
                  onChange={(event) => updateBody(selectedChunk.id, event.target.value)}
                  spellCheck={false}
                />
              </label>

              <div className="split-toolbar">
                <label>
                  <span>Split mode</span>
                  <select value={state.splitMode} onChange={(event) => setSplitMode(event.target.value as 'BEFORE' | 'AFTER')}>
                    <option value="BEFORE">BEFORE</option>
                    <option value="AFTER">AFTER</option>
                  </select>
                </label>
                <button type="button" onClick={triggerSplitFromTextarea}>
                  Add split from selection
                </button>
                <button type="button" onClick={clearSelectedSplitLines}>
                  Clear split lines
                </button>
                <button type="button" onClick={splitSelectedChunk}>
                  Split chunk
                </button>
              </div>

              <div className="split-lines">
                <span>Split markers</span>
                <div className="split-chip-list">
                  {selectedChunk.splitLines.map((line) => (
                    <button key={line} type="button" className="split-chip" onClick={() => setSplitLine(line)}>
                      Line {line}
                    </button>
                  ))}
                  {selectedChunk.splitLines.length === 0 ? <span className="muted">No split lines.</span> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="panel empty-state">Select a chunk to edit.</div>
          )}

          <div className="panel help-card">
            <h2>Shortcuts</h2>
            <ul>
              <li>
                <kbd>Ctrl/Cmd + S</kbd> Save JSON
              </li>
              <li>
                <kbd>Ctrl/Cmd + Z</kbd> Undo
              </li>
              <li>
                <kbd>F2</kbd> Rename
              </li>
              <li>
                <kbd>Arrow Up/Down</kbd> Move selection in list
              </li>
              <li>
                <kbd>Ctrl/Cmd + Shift + L</kbd> Add split line
              </li>
              <li>
                <kbd>Alt + Enter</kbd> Add split line
              </li>
            </ul>
            <p className="status-line">{state.statusMessage}</p>
          </div>
        </main>
      </section>

      {contextMenu ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => insertAfter(contextMenu.targetId)}>
            Insert below
          </button>
          <button type="button" onClick={() => removeSelected([contextMenu.targetId])}>
            Delete
          </button>
          <button type="button" disabled={state.present.selectedIds.length < 2} onClick={() => mergeSelected()}>
            Merge selected
          </button>
          <button
            type="button"
            onClick={() => {
              const title = window.prompt('新しいタイトル', selectedChunk?.title ?? '');
              if (title !== null) {
                renameSelected(title);
              }
            }}
          >
            Rename
          </button>
        </div>
      ) : null}
    </div>
  );
}
