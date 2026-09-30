# はかるだけ（Hakaru Dake）

アカウント不要の時間計測 PWA。**無料・広告なし・ログイン不要・オフライン対応。** Toggl のようなログインはありません。

## できること

- 名前をつけたタスクのタイマーを開始／停止（同時に動くのは1つ）
- 計測中に閉じても、開始時刻から続きを表示
- 今日の合計と、直近7日の棒グラフ
- 今日の内訳をテキストでコピー
- 表示言語：日本語 / English（端末内に保存）

記録は IndexedDB にだけ保存され、外部には送られません。

## English

**Hakaru Dake** is a local time tracker. Name a task, start and stop a timer (one running timer at a time), see today's total and a 7-day history, and copy today as plain text. A running timer stores its start timestamp, so it survives reload. Japanese by default, with an English toggle. Free, no ads, no login, offline. Data stays in IndexedDB on this device.

## 開発 / Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

Vite + vanilla TypeScript + vite-plugin-pwa（`registerType: 'autoUpdate'`, `base: './'`）。
