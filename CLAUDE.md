# note-24h-purchase-tracker プロジェクト情報

## プロジェクト概要
note.comの有料記事から24時間以内購入された記事を追跡するPlaywrightスクレイパー

## リポジトリ情報
- **GitHub**: https://github.com/nobphotographr/note-24h-purchase-tracker
- **可視性**: Public
- **ローカルパス**: `/Users/nobu/Github/note-24h-purchase-tracker`

## VPS環境

### サーバー情報
- **プロバイダ**: ConoHa VPS
- **OS**: Ubuntu 24.04.3 LTS
- **メモリ**: 1GB RAM
- **IPアドレス**: 160.251.209.34
- **SSH接続**: `ssh -i ~/.ssh/id_ed25519 root@160.251.209.34`

### プロジェクト配置
- **VPSパス**: `/root/note-24h-purchase-tracker`
- **仮想環境**: `/root/note-24h-purchase-tracker/.venv`
- **ログファイル**:
  - 定期実行: `/var/log/note-scraper.log`
  - 手動実行: `/var/log/note-scraper-manual-*.log`

### 環境変数
- **ファイル**: `/root/note-24h-purchase-tracker/.env`
- **GAS_WEB_APP_URL**: https://script.google.com/macros/s/AKfycbxN9eVdLiohahUq8v08_B1GufBdYVtfkVn0T_5R7RuqFuT_p6sj0VVVhE2Sw_1-WAiK/exec

### 定期実行（cron）
```bash
# JST 10:00に毎日実行（UTC 01:00）
0 1 * * * cd /root/note-24h-purchase-tracker && /root/note-24h-purchase-tracker/.venv/bin/python -m src.main config.yaml >> /var/log/note-scraper.log 2>&1
```

確認コマンド:
```bash
crontab -l
```

## キーワード管理

### キーワードリスト（61個）
config.yamlに定義。split_days=7で曜日ごとに分割:
- **月曜(0)**: 恋愛, マッチングアプリ, ペアーズ, Tinder, モテ, デート, マッチング, 副業, 稼ぐ (9個)
- **火曜(1)**: 収益化, せどり, 転売, アフィリエイト, ビジネス, 収入, 占い, タロット, 星座 (9個)
- **水曜(2)**: スピリチュアル, 運勢, 風水, 投資, 株, FX, 仮想通貨, NISA, 資産運用 (9個)
- **木曜(3)**: 投機, トレード, マーケティング, 集客, セールス, 起業, コンサル, BtoB, X運用 (9個)
- **金曜(4)**: Instagram, TikTok, フォロワー, バズ, SNS, ツイート, MBTI, HSP, 心理学 (9個)
- **土曜(5)**: 性格診断, メンタル, 自己分析, 美容, ダイエット, スキンケア, 健康, 筋トレ (8個)
- **日曜(6)**: メイク, 転職, キャリア, 就活, 面接, 履歴書, 職務経歴書 (7個)

## 実行方法

### 通常の定期実行
VPS上でcronにより毎日JST 10:00に自動実行。その日の曜日に対応するキーワードを処理。

```bash
# VPS上で手動実行（今日の曜日分）
cd /root/note-24h-purchase-tracker
/root/note-24h-purchase-tracker/.venv/bin/python -m src.main config.yaml
```

### 手動実行（キーワード指定）
特定のキーワードのみを処理したい場合:

```bash
# ローカル
python manual_run.py config.yaml メイク 転職 キャリア

# VPS
cd /root/note-24h-purchase-tracker
/root/note-24h-purchase-tracker/.venv/bin/python manual_run.py config.yaml メイク 転職 キャリア
```

### バックグラウンド実行
```bash
# VPS上でバックグラウンド実行
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'cd /root/note-24h-purchase-tracker && nohup /root/note-24h-purchase-tracker/.venv/bin/python -u manual_run.py config.yaml メイク 転職 >> /var/log/note-scraper-manual-sun.log 2>&1 &'

# プロセス確認
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'ps aux | grep "[p]ython.*manual_run"'

# ログ確認
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'tail -f /var/log/note-scraper-manual-sun.log'
```

## よく使うコマンド

### VPS接続とステータス確認
```bash
# SSH接続
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34

# 実行中のスクレイパープロセス確認
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'ps aux | grep "[p]ython.*src.main\|[p]ython.*manual_run"'

# ログ確認
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'tail -100 /var/log/note-scraper.log'
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'tail -f /var/log/note-scraper.log'  # リアルタイム監視

# プロセス停止
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'pkill -f "python.*src.main"'
```

### Git操作
```bash
# ローカルで変更をコミット＆プッシュ
cd /Users/nobu/Github/note-24h-purchase-tracker
git add -A
git commit -m "メッセージ"
git push

# VPSで最新版を取得
ssh -i ~/.ssh/id_ed25519 root@160.251.209.34 'cd /root/note-24h-purchase-tracker && git pull'
```

## 設定ファイル

### config.yaml（本番用）
- 61キーワード
- results_per_keyword: 100
- headless: true
- dry_run: false
- split_days: 7

### config.local-test.yaml（ローカルテスト用）
- 1キーワード（副業）
- results_per_keyword: 50
- headless: false（ブラウザ表示）
- dry_run: true（GAS送信スキップ）
- split_days: 1

## データ送信先
Google Apps Script（GAS）のWeb Appにデータを送信。
- URL: 環境変数 `GAS_WEB_APP_URL` に設定

## トラブルシューティング

### スクロールが20記事で止まる場合
- Bot検出回避設定を確認（User-Agent, Viewport, Locale, Timezone）
- wait_until="networkidle" を使用
- スクロール後の待機時間を4-6秒に設定

### SSH接続タイムアウト
- VPSのセキュリティグループ設定を確認
- "IPv4v6-SSH" グループが適用されているか確認

### ログが見えない
- `-u` フラグ（unbuffered）を使用
- または `PYTHONUNBUFFERED=1` 環境変数を設定

## 開発履歴

### 主な修正内容
1. **無限スクロール問題の解決** (2025-01-23)
   - VPS環境で20記事しか取得できない問題を修正
   - Bot検出回避設定を追加
   - スクロール処理を最適化（scrollTo + documentElement.scrollHeight）
   - 待機時間を4-6秒に増加

2. **手動実行スクリプトの追加** (2025-01-23)
   - manual_run.py: キーワードを直接指定して実行可能
   - src/main.py: run関数にkeywords_overrideパラメータを追加
