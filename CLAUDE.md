# note-24h-purchase-tracker プロジェクト情報

## プロジェクト概要
note.comの有料記事から24時間以内購入された記事を追跡するPlaywrightスクレイパー

## リポジトリ情報
- **GitHub**: https://github.com/nobphotographr/note-24h-purchase-tracker
- **可視性**: Public

### ローカル環境

#### macOS環境
- **ローカルパス**: `/Users/nobu/Github/note-24h-purchase-tracker`
- **SSH鍵**: `~/.ssh/id_ed25519`
- **GitHub CLI**: 認証済み（`gh auth status`で確認可能）

#### Windows環境
> **Windows側でClaude Codeを使用する場合は、以下の情報を記入してください:**
>
> - **ローカルパス**: `（例: C:\Users\nobu\Projects\note-24h-purchase-tracker）`
> - **SSH鍵の場所**: `（例: C:\Users\nobu\.ssh\id_ed25519）`
> - **GitHub CLI認証状態**: `（gh auth statusの結果を記載）`
> - **Python環境**: `（python --versionまたはpython3 --versionの結果）`
> - **備考**: `（WSL使用の有無、その他特記事項）`

## VPS環境

### サーバー情報
- **プロバイダ**: Xserver VPS
- **OS**: Ubuntu 25.04
- **メモリ**: 6GB RAM
- **vCPU**: 4コア
- **SSD**: 150GB NVMe
- **IPアドレス**: 162.43.45.242
- **SSH接続**: `ssh root@162.43.45.242`
- **SSH認証**: macOS・Windows両対応（authorized_keys設定済み）

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
# JST 01:00に毎日実行
0 1 * * * cd /root/note-24h-purchase-tracker && /root/note-24h-purchase-tracker/.venv/bin/python -m src.main config.yaml >> /var/log/note-scraper.log 2>&1
```

確認コマンド:
```bash
crontab -l
```

## キーワード管理

### キーワードリスト（180個）
config.yamlに定義。split_days=7で曜日ごとに分割:

- **月曜(23個)**: 恋愛系強化
  - 恋愛, マッチングアプリ, ペアーズ, Tinder, モテ, デート, マッチング
  - 婚活, 復縁, 片思い, 失恋, 告白, プロポーズ, 既読スルー, LINE恋愛
  - 遠距離, 同棲, 年の差, 夫婦関係, 離婚, 再婚, 浮気, 不倫

- **火曜(17個)**: 副業・note・Threads
  - 副業, 稼ぐ, 収益化, せどり, 転売, アフィリエイト, ビジネス, 収入
  - note, Threads, note初心者, 在宅ワーク, 副業初心者, フリーランス, 複業, ネット副業, スレッズ

- **水曜(18個)**: 占い・スピリチュアル強化
  - 占い, タロット, 星座, スピリチュアル, 運勢, 風水
  - ツインレイ, ツインソウル, 引き寄せの法則, 潜在意識, アファメーション, 波動
  - パワーストーン, オーラ, 2026運勢, 一粒万倍日, 天赦日, 開運

- **木曜(21個)**: 投資・経済 + AI
  - 投資, 株, FX, 仮想通貨, NISA, 資産運用, 投機, トレード
  - 資産形成, 経済, ナスダック, SP500, 金融, 投資信託
  - AI, ChatGPT, 生成AI, プロンプト, Gemini, Claude, GPTs

- **金曜(16個)**: マーケティング・SNS運用
  - マーケティング, 集客, セールス, 起業, コンサル, BtoB
  - SNSマーケティング, メンバーシップ, Threads運用
  - X運用, Instagram, TikTok, フォロワー, バズ, SNS, ツイート

- **土曜(23個)**: 心理・健康強化
  - MBTI, HSP, 心理学, 性格診断, メンタル, 自己分析
  - 自己肯定感, アサーション, 愛着スタイル, 境界線, ストレス, 不安, 人間関係
  - 健康, ダイエット, 筋トレ, 腸活, 便秘, むくみ, 冷え性, 疲労回復, 睡眠, 自律神経

- **日曜(29個)**: 美容・キャリア強化
  - 美容, スキンケア, メイク, 毛穴, ニキビ, シミ, シワ, たるみ
  - 乾燥肌, 敏感肌, 美白, 日焼け止め, レチノール, ビタミンC, コスメ, 韓国美容
  - パーソナルカラー, 骨格診断, 垢抜け
  - 転職, キャリア, 就活, 面接, 履歴書, 職務経歴書, フルリモート, ワーママ, 退職代行, 未経験転職

- **追加(20個)**: 子育て・育児（各曜日に分散）
  - 子育て, 育児, 夜泣き, 離乳食, 保活, 小1の壁, ワンオペ, パパ育休
  - ベビーテック, トイトレ, 発達グレー, 背中スイッチ, イヤイヤ期, 偏食
  - 寝かしつけ, 学童, 行き渋り, 産後うつ, 慣らし保育, 入学準備

### キーワード追加履歴
- **2026-01-25**: 160個→180個に拡張（+20個）
  - 子育て・育児系: 夜泣き、離乳食、保活、小1の壁、ワンオペなど追加
  - GASジャンル分類に「子育て・育児」カテゴリ追加（60+キーワード）
- **2025-01-23**: 61個→160個に拡張（+99個）
  - 恋愛系: 婚活、復縁、夫婦関係など追加
  - 美容系: 毛穴、韓国美容、垢抜けなど追加
  - 健康系: 腸活、睡眠、自律神経など追加
  - キャリア系: フルリモート、ワーママなど追加
  - AI系: ChatGPT、生成AI、プロンプトなど新規カテゴリ

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
ssh root@162.43.45.242 'cd /root/note-24h-purchase-tracker && nohup /root/note-24h-purchase-tracker/.venv/bin/python -u manual_run.py config.yaml メイク 転職 >> /var/log/note-scraper-manual-sun.log 2>&1 &'

# プロセス確認
ssh root@162.43.45.242 'ps aux | grep "[p]ython.*manual_run"'

# ログ確認
ssh root@162.43.45.242 'tail -f /var/log/note-scraper-manual-sun.log'
```

## よく使うコマンド

### VPS接続とステータス確認
```bash
# SSH接続
ssh root@162.43.45.242

# 実行中のスクレイパープロセス確認
ssh root@162.43.45.242 'ps aux | grep "[p]ython.*src.main\|[p]ython.*manual_run"'

# ログ確認
ssh root@162.43.45.242 'tail -100 /var/log/note-scraper.log'
ssh root@162.43.45.242 'tail -f /var/log/note-scraper.log'  # リアルタイム監視

# プロセス停止
ssh root@162.43.45.242 'pkill -f "python.*src.main"'
```

### Git操作
```bash
# ローカルで変更をコミット＆プッシュ
cd /Users/nobu/Github/note-24h-purchase-tracker
git add -A
git commit -m "メッセージ"
git push

# VPSで最新版を取得
ssh root@162.43.45.242 'cd /root/note-24h-purchase-tracker && git pull'
```

## 設定ファイル

### config.yaml（本番用）
- 180キーワード
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
1. **子育てキーワード追加・GAS改善** (2026-01-25)
   - config.yamlに子育てキーワード20個追加（160→180個）
   - GASに「子育て・育児」ジャンル追加（60+キーワード）
   - GASジャンル分類の優先度修正（投資・金融を最優先に）
   - formatAllGenreSheets()で概要シートの書式上書き防止
   - Windows SSH公開鍵をVPSに追加

2. **Xserver VPSへ移行** (2026-01-24)
   - ConoHa VPS (1GB) → Xserver VPS (6GB) に移行
   - メモリ不足によるPage crashedを解消
   - 安定した実行環境を確保

3. **無限スクロール問題の解決** (2025-01-23)
   - VPS環境で20記事しか取得できない問題を修正
   - Bot検出回避設定を追加
   - スクロール処理を最適化（scrollTo + documentElement.scrollHeight）
   - 待機時間を4-6秒に増加

4. **手動実行スクリプトの追加** (2025-01-23)
   - manual_run.py: キーワードを直接指定して実行可能
   - src/main.py: run関数にkeywords_overrideパラメータを追加
