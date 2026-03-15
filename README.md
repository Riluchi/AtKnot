# AtKnot

AtKnot は、Cocoforia 向けの部屋データを作るための Web ベース 要素エディタです。  
テキスト断片を `TEXT` / `SCENE` の単位で管理し、並び替え、分割、結合を行いながら、最終的に Cocoforia にインポート可能な 部屋データZIP を生成できます。  
つまり、シナリオテキスト一覧と、シーン一覧にコピペしていた作業をこのアプリが代替し、部屋作成しやすくすることを主目的としています。

## 最初に

- このアプリは、cocoforiaの課金サービス（CCFOLIA PRO）にて利用できる`ルームデータのエクスポート`が使えることを前提としています。
- `ルームデータのエクスポート`が使えない場合は、本アプリでの`部屋データを出力する(cocoforia)`は機能しませんので、あらかじめご了承下さい。

## 使い方

- Windows以外のOSで利用する場合
  1. [https://riluchi.github.io/AtKnot/](https://riluchi.github.io/AtKnot/) にアクセスして、ご利用下さい。
  2. 詳しい利用方法は現在整備中です。
- WindowsOSの場合
  1. [https://github.com/Riluchi/AtKnot/releases/](https://github.com/Riluchi/AtKnot/releases/) にアクセスし、`Latest`と表記されたバージョンの`atknot.exe`をDLください
  2. 実行時、警告が出ると思いますが、後日改善予定です。

## 概要

- React + TypeScript + Vite で構成されたシングルページアプリです
- ブラウザ上で完結し、作業状態は自動保存されます
- 編集対象は `要素` の配列で、各要素は以下を持ちます
  - タイトル
  - 本文
  - 種別 (`TEXT` または `SCENE`)
  - 分割位置 (`splitLines`)

## 主な機能

- 要素 の追加、削除、リネーム
- 複数 要素 の選択と結合
- ドラッグ＆ドロップによる並び替え
- タイトル検索、種別フィルタ
- `TEXT` / `SCENE` の切り替え
- 本文中の行を基準にした分割位置の指定
- 1つの 要素 を複数 要素 へ分割
- JSON 形式でのプロジェクト保存 / 読み込み
- `Ctrl/Cmd + Z` による Undo
- 日本語 / 英語 UI 切り替え
- light / dark テーマ切り替え
- Cocoforia の空 room ZIP をもとにした export

## Cocoforia export

AtKnot は入力された 要素 を Cocoforia 用データへ変換します。

- `SCENE` 要素 は scene として出力されます
- `TEXT` 要素 は note として出力されます
- 既存 room ZIP 内の `.token` を引き継ぎつつ、`__data.json` を生成し直します
- テンプレート ZIP に `__data.json` が含まれていれば、それをベースに整形します

想定フローは次のとおりです。

1. AtKnot 上で 要素を編集する
2. 空の Cocoforia 部屋ZIP を選択する
3. export された ZIP を Cocoforia に取り込む

## プロジェクトファイル

保存形式は JSON です。現在のバージョンは `version: 1` です。

```json
{
  "version": 1,
  "要素s": [
    {
      "id": "uuid",
      "title": "要素 1",
      "body": "text",
      "kind": "TEXT",
      "splitLines": []
    }
  ]
}
```

## 開発

```bash
npm install
npm run dev
```

ビルド:

```bash
npm run build
```

## 補足

- autosave はブラウザストレージに保存されます
- フィルタ中は並び替え操作を無効化しています
- 分割位置は本文の改行単位で管理され、保存時に正規化されます
