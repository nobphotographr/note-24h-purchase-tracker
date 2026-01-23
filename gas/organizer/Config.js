/**
 * 設定ファイル
 * スプレッドシートIDとジャンル分類ルールを定義
 */

// ソーススプレッドシート（元データ）
const SOURCE_SPREADSHEET_ID = '18iKQSj8WpB90RvZtKuWd8KX_3Yj4JHx-eQYLgbNXynk';
const SOURCE_SHEET_NAME = '記録データ';

// ターゲットスプレッドシート（整理後データ）
// ※初回実行時に自動作成されます。作成後はここにIDを設定してください
const TARGET_SPREADSHEET_ID = '1Q4gMZe42XoPpqunh9OOxTPM2xIZvMYyfYoEZdfstfkI';

// ジャンル分類ルール
const GENRE_RULES = {
  '恋愛・マッチングアプリ': ['恋愛', 'マッチングアプリ', 'ペアーズ', 'Tinder', 'モテ', 'デート', 'マッチング'],
  '副業・稼ぎ方': ['副業', '稼ぐ', '収益化', 'せどり', '転売', 'アフィリエイト', 'ビジネス', '収入'],
  '占い・スピリチュアル': ['占い', 'タロット', '星座', 'スピリチュアル', '運勢', '風水'],
  '投資・金融': ['投資', '株', 'FX', '仮想通貨', 'NISA', '資産運用', '投機', 'トレード'],
  'ビジネス・マーケティング': ['マーケティング', '集客', 'セールス', '起業', 'コンサル', 'BtoB'],
  'SNS運用': ['X運用', 'Instagram', 'TikTok', 'フォロワー', 'バズ', 'SNS', 'ツイート'],
  '心理学・自己分析': ['MBTI', 'HSP', '心理学', '性格診断', 'メンタル', '自己分析'],
  '美容・健康': ['美容', 'ダイエット', 'スキンケア', '健康', '筋トレ', 'メイク'],
  'キャリア・転職': ['転職', 'キャリア', '就活', '面接', '履歴書', '職務経歴書'],
  'その他': [] // キーワード不要（デフォルト分類）
};

// 列のインデックス（0始まり）
const COLUMNS = {
  RECORD_DATE: 0,      // A列: 記録日時
  CREATE_DATE: 1,      // B列: 作成日
  TITLE: 2,            // C列: タイトル
  AUTHOR: 3,           // D列: 著者
  AUTHOR_URL: 4,       // E列: 著者URL
  URL: 5,              // F列: URL（一意キー）
  LIKES: 6,            // G列: スキ数
  HIGH_EVAL: 7,        // H列: 高評価数
  PRICE: 8,            // I列: 価格
  TAG: 9,              // J列: タグ
  SALES_CLAIM: 10,     // K列: 販売主張
  PURCHASED_24H: 11,   // L列: 24h購入確認
  ELAPSED_DAYS: 12,    // M列: 経過日数
  MIN_REVENUE: 13,     // N列: 最低売上推定
  PURCHASE_RATE: 14,   // O列: 購入者率(%)
  PROCESSED: 15        // P列: 処理済みフラグ
};

// 出力開始列・終了列（A列からO列）
const OUTPUT_START_COL = 0; // A列（記録日時を含める）
const OUTPUT_END_COL = 14;  // O列
