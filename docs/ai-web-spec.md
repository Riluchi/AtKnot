# Atknot Web版 AI実装仕様書

## 1. 目的

本仕様書は、現行リポジトリの機能要件を分析したうえで、`Vite + React + TypeScript` を用いた Web アプリとして Atknot を再構築するための、AIエージェント向け実装仕様を定義する。

前提条件は次のとおり。

- 配備先は `GitHub Pages`
- 実行環境はブラウザのみ
- デスクトップ専用の `Tauri API` は使用不可
- 既存アプリの主要な編集体験とデータ互換性は維持する

この仕様書は「設計意図」「実装境界」「受け入れ条件」を含む。AIエージェントは本書を優先し、既存コードは参照実装として扱うこと。

## 2. 現行実装から抽出したプロダクト要約

Atknot は、テキスト断片を `Chunk` 単位で管理し、並び替え・分類・分割・結合を行い、最終的に `Cocoforia` 用の importable room zip を生成するエディタである。

現行実装の本質的な機能は以下。

- Chunk 一覧の管理
- Chunk 本文の編集
- Chunk の種別管理
- 分割位置の指定と一括分割
- 複数 Chunk の選択・結合・削除・改名
- プロジェクト JSON の保存・読込
- autosave
- Cocoforia 向け zip エクスポート

## 3. Web版で守るべき設計原則

- `Tauri` 依存を完全に排除し、ブラウザ標準 API で成立させる
- `Chunk` / `Project` / `Cocoforia export` のドメインは UI から分離する
- GitHub Pages で安定動作するよう、サーバ不要・ルーティング不要の単一ページ構成にする
- 既存 JSON フォーマット `version: 1` は互換維持する
- 既存の編集操作は、可能な限り同じ認知モデルを維持する

## 4. 対象範囲

### 4.1 必須機能

- Chunk 一覧表示
- Chunk 選択
- 単一選択 / 複数選択 / 範囲選択
- Chunk 追加
- Chunk 削除
- Chunk 結合
- Chunk 改名
- Chunk 並び替え
- Chunk 種別切替
- 本文編集
- タイトルフィルタ
- 種別フィルタ
- split line の追加・解除・クリア
- split line に基づく一括分割
- JSON import/export
- ブラウザ内 autosave
- Cocoforia 用 zip 生成とダウンロード
- ライト/ダークテーマ切替
- Undo

### 4.2 非対象

- Tauri ネイティブダイアログ
- Tauri ファイルシステム API
- Tauri アプリデータディレクトリ
- デスクトップ固有のウィンドウ制御
- マルチページルーティング
- 認証
- サーバ同期

## 5. 技術前提

- フレームワーク: React 18+
- 言語: TypeScript strict
- ビルド: Vite
- 配備: GitHub Pages
- ルーティング: 原則なし
- ストレージ: `localStorage` または `IndexedDB`
- ファイル入出力: `File`, `Blob`, `URL.createObjectURL`, `<input type="file">`
- ZIP処理: `JSZip`
- エディタ: `@monaco-editor/react` 継続可

## 6. GitHub Pages 前提の実装制約

### 6.1 配備制約

- アプリは静的配信のみで成立すること
- SPA ルーティング前提の deep link を作らないこと
- `vite.config.ts` では GitHub Pages 用の `base` を設定可能にすること
- 画像・worker・Monaco関連資産は相対パス破綻を起こさないこと

### 6.2 ブラウザ制約

- 任意パスへの保存は不可
- ローカルファイルの絶対パス保持は不可
- 常時アクセス可能なアプリ専用ディレクトリはない
- autosave はブラウザストレージに保存する
- ファイル上書き保存は標準ブラウザでは保証できない

### 6.3 代替方針

- `Open project` はファイル選択で JSON を読込
- `Save` は次の二段階で扱う
- 既知の保存先という概念を持たない通常ブラウザでは `Save` を `Export JSON` と同義にする
- 可能なら File System Access API 対応ブラウザでは上書き保存を拡張実装してよい
- autosave は `localStorage` を初期採用し、容量問題が出るなら `IndexedDB` へ切替

## 7. データモデル

### 7.1 Chunk

```ts
export type ChunkKind = "TEXT" | "SCENE";

export type Chunk = {
  id: string;
  title: string;
  body: string;
  kind: ChunkKind;
  splitLines: number[];
};
```

意味論:

- `TEXT`: Cocoforia export 時に note へ変換
- `SCENE`: Cocoforia export 時に scene へ変換
- `splitLines`: 1-based。本文を行分割する境界位置

### 7.2 Project永続形式

```ts
export type PersistedStateV1 = {
  version: 1;
  chunks: Chunk[];
};
```

要件:

- JSON 互換は保持する
- 読込時はバリデーションを行う
- `splitLines` は重複除去・昇順ソート・1以上のみ許可

## 8. 機能仕様

### 8.1 レイアウト

- 2ペイン構成
- 左ペイン: Chunk 一覧と検索/フィルタ
- 右ペイン: 選択中 Chunk の編集
- 上部バー: 保存、読込、Export、Undo、テーマ切替

### 8.2 Chunk一覧

各行は以下を表示する。

- ドラッグハンドル
- 種別アイコン
- タイトル

挙動:

- 通常クリックで単一選択
- `Ctrl` / `Cmd` クリックで追加選択
- `Shift` クリックで範囲選択
- 右クリックでコンテキストメニュー
- フィルタ未適用時のみドラッグ並び替え可能
- フィルタ適用時は順序変更を無効化

### 8.3 コンテキストメニュー

- 挿入: 対象直後に空 Chunk を追加
- 削除: 対象、または対象を含む複数選択を削除
- 結合: 2件以上選択時のみ有効
- 改名: 単体または複数選択に同一タイトルを適用

### 8.4 フィルタ

- タイトル部分一致
- 種別フィルタ: `ALL | TEXT | SCENE`

### 8.5 編集ペイン

- 選択中 Chunk のタイトルを表示
- 本文は Monaco Editor で編集
- 種別切替 UI を提供
- split mode: `BEFORE` / `AFTER`
- split line の追加、クリア、一括分割を提供

### 8.6 本文編集

- `selected.body` を編集対象とする
- 編集結果は即時 state へ反映する
- 改行は `\n` に統一する

### 8.7 split line

仕様:

- 本文の行境界に対して split marker を持つ
- 行末より後ろや最終行の後ろには付けない
- `BEFORE` は選択行の直前を境界にする
- `AFTER` は選択行の直後を境界にする

操作:

- ボタンから現在 selection をもとに追加
- editor 内ショートカットでも追加可能
- marker 個別トグル可能
- 全クリア可能

### 8.8 一括分割

仕様:

- `splitLines` を昇順に解釈して本文を複数 Chunk に分割
- 空白のみの segment は破棄
- 元 Chunk の kind を継承
- 先頭 Chunk は元タイトル維持
- 2件目以降は `Title (2)` のように採番

### 8.9 結合

仕様:

- 選択順ではなく、現在配列中での出現順を基準に結合
- 本文は `\n` で連結
- 採用タイトルと kind は先頭 Chunk を継承
- `splitLines` は空にリセット

### 8.10 Undo

- 最低 30 スナップショット
- Chunk 配列、選択状態、selection anchor を巻き戻す
- 本文編集、並び替え、改名、分割、結合、削除は Undo 対象

### 8.11 テーマ

- light / dark を切替可能
- Monaco のテーマも同期する

## 9. ファイルI/O仕様

### 9.1 Project読込

- ユーザーが `.atknot.json` または `.json` を選択
- JSON parse
- `version === 1` を検証
- `chunks` を正規化
- 失敗時は復元不能な破損ファイルとして扱い、状態は変更しない

### 9.2 Project保存

Web版では保存を次の2系統に分ける。

1. ブラウザ互換の標準方式
- 現在 state を `Blob` 化
- `project.atknot.json` を既定名としてダウンロード

2. 拡張方式
- File System Access API が使える場合のみ、同一ファイルへの再保存を許可

AIエージェントはまず 1 を実装し、2 は追加対応とすること。

### 9.3 autosave

- 保存先はブラウザストレージ
- キー例: `atknot/autosave/v1`
- 30秒間隔
- `dirty` かつ前回 autosave 内容と差分があるときのみ保存
- 起動時に autosave があれば復元確認を出す

## 10. Cocoforia export 仕様

### 10.1 入力

- ユーザーが既存の Cocoforia room zip を選択

### 10.2 処理

- zip から `.token` を抽出
- 可能なら `__data.json` を template として抽出
- 現在の Chunk 配列から Cocoforia data を生成
- template があれば構造整列を行う
- `.token` と `__data.json` を含む新しい zip を生成

### 10.3 出力

- `importableRoom_YYYYMMDDhhmmss.zip` でダウンロード

### 10.4 Chunk から Cocoforia への変換

- `SCENE` Chunk は `entities.scenes` に変換
- `TEXT` Chunk は `entities.notes` に変換
- scene が1件もない状態で `TEXT` がある場合はメイン scene を自動生成

### 10.5 構造整列

目的:

- template の shape に寄せることで Cocoforia 互換性を上げる

方針:

- template にある key は可能な限り維持
- generated にのみある key も保持
- 型不一致や欠落は差分として記録

## 11. UIショートカット

最低限、以下を維持する。

- `Ctrl/Cmd + S`: 保存
- `Ctrl/Cmd + Z`: Undo
- `F2`: 改名開始
- `ArrowUp` / `ArrowDown`: 左ペイン選択移動
- `Ctrl/Cmd + Shift + L`: エディタ選択行から split line 追加
- `Alt + Enter`: split line 追加と同等動作

補足:

- Monaco 標準ショートカットと競合する場合は、本文編集中の優先順位を明示的に制御する

## 12. 状態管理方針

推奨分割:

- `domain/`: 純関数と型定義
- `features/chunks/`: 一覧、選択、改名、DnD
- `features/editor/`: Monaco、split line 表示、本文編集
- `features/project-io/`: import/export/autosave
- `features/cocoforia-export/`: zip 生成
- `app/`: 画面統合と上位 state

最低限の原則:

- ドメインロジックを React component から切り離す
- ブラウザ依存 API 呼び出しは service 層に閉じ込める
- コンポーネント内で JSON 構造変換を直接書かない

## 13. 既存実装との差分整理

Web版では以下を置換する必要がある。

- `@tauri-apps/plugin-dialog` → ブラウザ file input / ダウンロード導線
- `@tauri-apps/plugin-fs` → `FileReader`, `Blob`, `URL.createObjectURL`
- `appDataDir` autosave → `localStorage` または `IndexedDB`
- パス文字列ベースの現在ファイル管理 → ブラウザでは擬似的な保存状態管理

削除対象依存:

- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-fs`
- `@tauri-apps/api/path`

## 14. AIエージェント向け実装順序

推奨順序:

1. Vite 設定を GitHub Pages 配備前提に調整
2. Tauri依存を除去
3. `domain` と `services` を Web版 API に合わせて再構成
4. Project JSON import/export を実装
5. autosave を実装
6. Chunk 一覧編集と Monaco 編集を接続
7. split / merge / rename / DnD / filter を整備
8. Cocoforia export を移植
9. Undo とショートカットを仕上げる
10. build と GitHub Pages 配備確認

## 15. 受け入れ条件

- `npm run build` が成功する
- GitHub Pages 配備後に初期表示できる
- `.atknot.json` を読込できる
- 編集後に JSON をダウンロード保存できる
- 再読込後に autosave 復元できる
- TEXT / SCENE の切替が機能する
- split line の追加、解除、クリア、一括分割が機能する
- 複数選択の削除、結合、改名が機能する
- フィルタ中は DnD が無効化される
- Cocoforia zip を生成してダウンロードできる

## 16. 注意事項

- 現行コードには文字化けした日本語コメントや文言が混在するため、Web版では文言を整理し直すこと
- `index.css` には Vite テンプレート由来の不要スタイルが残っているため、Web版では整理対象とする
- 現行 `App.tsx` は責務集中が強いため、Web版では単一巨大コンポーネント化を避けること

## 17. 実装判断の優先順位

1. 既存データ互換
2. ブラウザ完結性
3. 編集体験の維持
4. ドメイン分離
5. GitHub Pages 配備安定性
6. 段階的拡張性

## 18. 補足判断

仮説:

- 本プロダクトの中核価値は「文章編集」より「断片管理と Cocoforia 変換」にある
- したがって、AIエージェントは見た目の改修より先に、`Chunk操作の整合性` と `export の再現性` を優先すべきである

この仮説に反する新要件が出た場合は、UI改善よりも先にデータモデルへの影響を再評価すること。
