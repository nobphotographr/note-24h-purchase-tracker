# note 24h purchase tracker

Playwrightでnote検索結果から記事を巡回し、
「買われています（過去24時間）」の短命UIを検知して
既存のGAS Web Appへ記録するための最小構成です。

## 目的

- note検索 → 記事を開く → 24h購入ポップアップを検知
- 結果をスプレッドシートへ時系列で記録
- 低負荷・低頻度で安全側に寄せる

## 準備

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install
```

`.env` にGAS Web App URLを設定してください。

```bash
cp .env.example .env
```

## 実行

```bash
python -m src.main
```

## 設定

`config.yaml` でキーワードや件数を調整できます。

- `keywords`: 検索キーワード配列
- `results_per_keyword`: 取得件数（初期100）
- `article_wait_ms`: 24hポップアップ検知の待機時間（初期1500ms）
- `between_articles_ms`: 記事間の待機（範囲）
- `between_pages_ms`: 検索ページ間の待機（範囲）

## 記録フォーマット

GAS側は `note-sales-tracker` と同じスキーマを想定しています。
不足する項目は空値で送信します。

## 免責

- noteのUI変更で壊れる可能性があります。
- 過度なアクセスは避けてください。
- 実運用前に利用規約をご確認ください。
