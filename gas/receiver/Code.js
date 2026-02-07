/**
 * note-sales-tracker GAS Web API
 * 拡張機能からのデータを受信してスプレッドシートに記録する
 */

// スプレッドシートのシート名
const SHEET_NAME = '記録データ';
const TRACKING_SHEET_NAME = 'トラッキング';

// トラッキング設定
const TRACKING_DAYS = 14;  // 追跡期間（日数）

// 除外する著者リスト（競艇予想など関係ないコンテンツ）
const EXCLUDE_AUTHORS = [
  'ネッシーの競艇予想',
  '競艇予想熊先生',
];

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📈 Note Sales Tracker')
    .addItem('🆕 新しい記録シートを作成', 'createNewSheetWithUI')
    .addItem('🧹 重複URLをクリーニング', 'cleanDuplicatesWithUI')
    .addSeparator()
    .addItem('📊 統計情報を表示', 'showStats')
    .addToUi();
}

/**
 * UI付きで新しいシートを作成
 */
function createNewSheetWithUI() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 既存の記録シートがあるか確認
  const existingSheet = ss.getSheetByName(SHEET_NAME);

  if (existingSheet) {
    const response = ui.alert(
      '新しい記録シートの作成',
      `既存の「${SHEET_NAME}」シートを「${SHEET_NAME}_旧」にリネームして、\n新しいシートを作成します。\n\nよろしいですか？`,
      ui.ButtonSet.YES_NO
    );

    if (response !== ui.Button.YES) {
      return;
    }

    // 既存シートをリネーム
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
    existingSheet.setName(`${SHEET_NAME}_${timestamp}`);
  }

  // 新しいシートを作成
  const newSheet = ss.insertSheet(SHEET_NAME);
  setupSheetWithAnalysisColumns(newSheet);

  ui.alert(
    '作成完了',
    '新しい記録シートを作成しました。\n分析用の列（経過日数、最低売上推定、購入者率）も追加されています。',
    ui.ButtonSet.OK
  );
}

/**
 * シートに分析用の列を含めてセットアップ
 */
function setupSheetWithAnalysisColumns(sheet) {
  // ヘッダー行を設定（15列: 基本11列 + 24h購入確認 + 分析3列）
  const headerRange = sheet.getRange(1, 1, 1, 15);
  headerRange.setValues([[
    '記録日時',
    '作成日',
    'タイトル',
    '著者',
    '著者URL',
    'URL',
    'スキ数',
    '高評価数',
    '価格',
    'タグ',
    '販売主張',       // 本文中の「10部完売」等のテキスト
    '24h購入確認',    // 24時間以内の購入確認フラグ
    '経過日数',       // 分析列1: 作成日から記録日までの日数
    '最低売上推定',   // 分析列2: 高評価数 × 価格
    '購入者率(%)'     // 分析列3: 高評価数 / スキ数 × 100
  ]]);

  // ヘッダー行の書式設定
  headerRange.setFontWeight('bold');

  // 基本列は青、販売主張はオレンジ、24h購入確認はピンク、分析列は緑
  sheet.getRange(1, 1, 1, 10).setBackground('#4285f4').setFontColor('#ffffff');
  sheet.getRange(1, 11, 1, 1).setBackground('#FF9800').setFontColor('#ffffff');
  sheet.getRange(1, 12, 1, 1).setBackground('#E91E63').setFontColor('#ffffff');
  sheet.getRange(1, 13, 1, 3).setBackground('#34a853').setFontColor('#ffffff');

  // 列幅を調整
  sheet.setColumnWidth(1, 150);  // 記録日時
  sheet.setColumnWidth(2, 100);  // 作成日
  sheet.setColumnWidth(3, 300);  // タイトル
  sheet.setColumnWidth(4, 120);  // 著者
  sheet.setColumnWidth(5, 200);  // 著者URL
  sheet.setColumnWidth(6, 300);  // URL
  sheet.setColumnWidth(7, 70);   // スキ数
  sheet.setColumnWidth(8, 70);   // 高評価数
  sheet.setColumnWidth(9, 70);   // 価格
  sheet.setColumnWidth(10, 200); // タグ
  sheet.setColumnWidth(11, 100); // 販売主張
  sheet.setColumnWidth(12, 80);  // 24h購入確認
  sheet.setColumnWidth(13, 80);  // 経過日数
  sheet.setColumnWidth(14, 100); // 最低売上推定
  sheet.setColumnWidth(15, 90);  // 購入者率

  // フィルターを設定
  sheet.getRange(1, 1, 1, 15).createFilter();

  // 1行目を固定
  sheet.setFrozenRows(1);
}

/**
 * UI付きで重複クリーニングを実行
 */
function cleanDuplicatesWithUI() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    '重複URLのクリーニング',
    '同じURLの記録を整理し、最新のもののみを残します。\n\nこの操作は取り消せません。実行しますか？',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  const result = cleanDuplicates();

  if (result.success) {
    ui.alert(
      'クリーニング完了',
      `${result.removed}件の重複を削除しました。\n残り: ${result.remaining}件`,
      ui.ButtonSet.OK
    );
  } else {
    ui.alert('エラー', result.error, ui.ButtonSet.OK);
  }
}

/**
 * 統計情報を表示
 */
function showStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const ui = SpreadsheetApp.getUi();

  if (!sheet) {
    ui.alert('エラー', 'シートが見つかりません', ui.ButtonSet.OK);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert('統計情報', '記録がありません', ui.ButtonSet.OK);
    return;
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

  // 統計計算（列インデックス: 0=記録日時, 1=作成日, 2=タイトル, 3=著者, 4=著者URL, 5=URL, 6=スキ数, 7=高評価数, 8=価格, 9=タグ）
  const totalRecords = data.length;
  const uniqueUrls = new Set(data.map(row => row[5])).size;  // URL列
  const duplicates = totalRecords - uniqueUrls;
  const totalLikes = data.reduce((sum, row) => sum + (parseInt(row[6]) || 0), 0);  // スキ数列
  const avgLikes = Math.round(totalLikes / totalRecords);
  const totalHighRating = data.reduce((sum, row) => sum + (parseInt(row[7]) || 0), 0);  // 高評価数列
  const articlesWithHighRating = data.filter(row => parseInt(row[7]) > 0).length;
  const paidArticles = data.filter(row => parseInt(row[8]) > 0).length;  // 価格列

  ui.alert(
    '📊 統計情報',
    `総記録数: ${totalRecords}件\n` +
    `ユニークURL: ${uniqueUrls}件\n` +
    `重複記録: ${duplicates}件\n` +
    `─────────────\n` +
    `総スキ数: ${totalLikes.toLocaleString()}\n` +
    `平均スキ数: ${avgLikes}\n` +
    `─────────────\n` +
    `高評価付き記事: ${articlesWithHighRating}件\n` +
    `総高評価数: ${totalHighRating}（=最低購入数）\n` +
    `─────────────\n` +
    `有料記事: ${paidArticles}件`,
    ui.ButtonSet.OK
  );
}

/**
 * スプレッドシートを初期化（ヘッダー行を作成）
 */
function initializeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // ヘッダー行が空の場合のみ設定
  const headerRange = sheet.getRange(1, 1, 1, 12);
  if (headerRange.getValues()[0][0] === '') {
    headerRange.setValues([[
      '記録日時',
      '作成日',      // 記事の作成日
      'タイトル',
      '著者',
      '著者URL',
      'URL',
      'スキ数',
      '高評価数',  // 購入者のみ付与可能
      '価格',
      'タグ',
      '販売主張',    // 本文中の「10部完売」等のテキスト
      '24h購入確認'  // 24時間以内の購入確認フラグ
    ]]);

    // ヘッダー行の書式設定
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');

    // 列幅を調整
    sheet.setColumnWidth(1, 150);  // 記録日時
    sheet.setColumnWidth(2, 120);  // 作成日
    sheet.setColumnWidth(3, 300);  // タイトル
    sheet.setColumnWidth(4, 120);  // 著者
    sheet.setColumnWidth(5, 200);  // 著者URL
    sheet.setColumnWidth(6, 300);  // URL
    sheet.setColumnWidth(7, 80);   // スキ数
    sheet.setColumnWidth(8, 80);   // 高評価数
    sheet.setColumnWidth(9, 80);   // 価格
    sheet.setColumnWidth(10, 200); // タグ
    sheet.setColumnWidth(11, 100); // 販売主張
    sheet.setColumnWidth(12, 80);  // 24h購入確認

    // フィルターを設定
    sheet.getRange(1, 1, 1, 12).createFilter();
  }

  return sheet;
}

/**
 * POSTリクエストを処理（拡張機能からのデータ受信）
 */
function doPost(e) {
  try {
    let data;

    // postDataがある場合はJSONとしてパース
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.data) {
      // URLパラメータからデータを取得
      data = JSON.parse(decodeURIComponent(e.parameter.data));
    } else {
      throw new Error('No data received');
    }

    // トラッキング結果更新
    if (data.action === 'updateTrackingResults' && data.results) {
      const result = updateTrackingResults(data.results);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // データを記録
    const result = recordArticle(data);

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GETリクエストを処理（データ受信にも対応）
 */
function doGet(e) {
  try {
    // actionパラメータでアクションを判定
    if (e.parameter && e.parameter.action === 'clean') {
      const result = cleanDuplicates();
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // トラッキングリスト取得
    if (e.parameter && e.parameter.action === 'getTrackingList') {
      const result = getTrackingList();
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // dataパラメータがあればデータを記録
    if (e.parameter && e.parameter.data) {
      const data = JSON.parse(decodeURIComponent(e.parameter.data));
      const result = recordArticle(data);

      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // パラメータがなければステータスを返す
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        message: 'note-sales-tracker API is running',
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 記事データをスプレッドシートに記録
 * 重複URLは新しい行として追記（履歴として保持）
 */
function recordArticle(data) {
  // 除外著者チェック
  const author = String(data.author || '');
  for (const excludeAuthor of EXCLUDE_AUTHORS) {
    if (author.includes(excludeAuthor)) {
      return {
        success: true,
        message: '除外著者のためスキップしました',
        skipped: true,
        author: author
      };
    }
  }

  const sheet = initializeSheet();
  const headerMap = getHeaderMap_(sheet);

  // 日本時間でフォーマット
  const recordedAt = data.recordedAt
    ? new Date(data.recordedAt)
    : new Date();
  const formattedDate = Utilities.formatDate(
    recordedAt,
    'Asia/Tokyo',
    'yyyy/MM/dd HH:mm:ss'
  );

  // 記事作成日をフォーマット
  let formattedCreatedAt = '';
  if (data.createdAt) {
    try {
      const createdAt = new Date(data.createdAt);
      formattedCreatedAt = Utilities.formatDate(
        createdAt,
        'Asia/Tokyo',
        'yyyy/MM/dd'
      );
    } catch (e) {
      formattedCreatedAt = data.createdAt; // パース失敗時は元の値を使用
    }
  }

  // 新しい行を追加（ヘッダー名に基づき列ずれを回避）
  const lastRow = sheet.getLastRow() + 1;
  const columnDefaults = {
    '記録日時': 1,
    '作成日': 2,
    'タイトル': 3,
    '著者': 4,
    '著者URL': 5,
    'URL': 6,
    'スキ数': 7,
    '高評価数': 8,
    '価格': 9,
    'タグ': 10,
    '販売主張': 11,
    '24h購入確認': 12
  };

  const setCellByHeader = (label, value) => {
    const col = headerMap[label] || columnDefaults[label];
    if (!col) return;
    sheet.getRange(lastRow, col).setValue(value);
  };

  setCellByHeader('記録日時', formattedDate);
  setCellByHeader('作成日', formattedCreatedAt);
  setCellByHeader('タイトル', data.title || '');
  setCellByHeader('著者', data.author || '');
  setCellByHeader('著者URL', data.authorUrl || '');
  setCellByHeader('URL', data.url || '');
  setCellByHeader('スキ数', data.likes || 0);
  setCellByHeader('高評価数', data.highRating || 0);
  setCellByHeader('価格', data.price || 0);
  setCellByHeader('タグ', data.tags || '');
  setCellByHeader('販売主張', data.salesClaim || '');
  setCellByHeader('24h購入確認', data.purchased24h ? '○' : '');

  // 分析列に数式を設定（列が存在する場合のみ）
  const elapsedCol = headerMap['経過日数'];
  const minRevenueCol = headerMap['最低売上推定'];
  const purchaseRateCol = headerMap['購入者率(%)'];

  const recordedAtCol = headerMap['記録日時'] || columnDefaults['記録日時'];
  const createdAtCol = headerMap['作成日'] || columnDefaults['作成日'];
  const likesCol = headerMap['スキ数'] || columnDefaults['スキ数'];
  const highRatingCol = headerMap['高評価数'] || columnDefaults['高評価数'];
  const priceCol = headerMap['価格'] || columnDefaults['価格'];

  if (elapsedCol) {
    // 経過日数 = DATEDIF(作成日, 記録日時, "D") ※作成日が空の場合は空白
    sheet.getRange(lastRow, elapsedCol).setFormulaR1C1(
      `=IF(RC${createdAtCol}="","",DATEDIF(RC${createdAtCol},RC${recordedAtCol},"D"))`
    );
  }
  if (minRevenueCol) {
    // 最低売上推定 = 高評価数 × 価格
    sheet.getRange(lastRow, minRevenueCol).setFormulaR1C1(
      `=RC${highRatingCol}*RC${priceCol}`
    );
  }
  if (purchaseRateCol) {
    // 購入者率(%) = 高評価数 / スキ数 × 100 ※スキ数が0の場合は空白
    sheet.getRange(lastRow, purchaseRateCol).setFormulaR1C1(
      `=IF(RC${likesCol}=0,"",ROUND(RC${highRatingCol}/RC${likesCol}*100,1))`
    );
  }

  // 同じURLの記録数をカウント（データが1行しかない場合のエラー回避）
  let sameUrlCount = 1;
  if (lastRow > 1) {
    const urlColumn = sheet.getRange(2, 6, lastRow - 1, 1).getValues();  // URL は 6列目
    sameUrlCount = urlColumn.filter(row => row[0] === data.url).length;
  }

  // 24h購入確認ありの場合、トラッキングリストに追加
  let trackingAdded = false;
  if (data.purchased24h) {
    trackingAdded = addToTracking(data);
  }

  return {
    success: true,
    message: sameUrlCount > 1
      ? `更新として記録しました（${sameUrlCount}回目）`
      : '新規記録しました',
    row: lastRow,
    isUpdate: sameUrlCount > 1,
    recordCount: sameUrlCount,
    trackingAdded: trackingAdded
  };
}

function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return {};
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    if (header) {
      map[header] = index + 1;
    }
  });
  return map;
}

/**
 * 重複URLをクリーニング（一括書き込み最適化版）
 * - 同じURLで複数レコードがある場合の優先順位:
 *   1. 新しいレコードに「24h購入確認あり（○）」がある → 新しい方を残す
 *   2. それ以外 → 価値ある最新レコードを残す
 * - 価値のない記録（高評価0 AND 24h購入確認なし）のみのURLは全て削除
 * ※ organizer/Main.js の cleanSourceData() と同等のロジック（処理済みフラグ判定を除く）
 */
function cleanDuplicates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return { success: false, error: 'シートが見つかりません' };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, message: 'クリーニング対象がありません', removed: 0 };
  }

  // 全データを取得（A列～L列：24h購入確認まで）
  const numCols = 12;
  const dataRange = sheet.getRange(2, 1, lastRow - 1, numCols);
  const data = dataRange.getValues();
  const originalCount = data.length;

  // 列インデックス定義
  const COL = {
    RECORD_DATE: 0,    // A列: 記録日時
    URL: 5,            // F列: URL
    HIGH_EVAL: 7,      // H列: 高評価数
    PURCHASED_24H: 11  // L列: 24h購入確認
  };

  // URLごとにグループ化
  const urlGroups = new Map();

  data.forEach((row, index) => {
    const url = row[COL.URL];

    if (!url) return;

    if (!urlGroups.has(url)) {
      urlGroups.set(url, []);
    }
    urlGroups.get(url).push({
      row,
      index,
      date: row[COL.RECORD_DATE],
      highEval: row[COL.HIGH_EVAL],
      purchased24h: row[COL.PURCHASED_24H]
    });
  });

  // 保持する行のインデックスセット
  const keepIndices = new Set();

  urlGroups.forEach((records, url) => {
    // 価値判定ヘルパー関数
    const isValuable = (record) => {
      return (record.highEval !== null && record.highEval !== '' && record.highEval > 0) ||
             record.purchased24h === '○';
    };

    if (records.length === 1) {
      // 1件のみの場合、価値があれば残す
      const record = records[0];
      if (isValuable(record)) {
        keepIndices.add(record.index);
      }
      return;
    }

    // 複数レコードがある場合
    // 日付順にソート（新しい順）
    const sortedRecords = records.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const newestRecord = sortedRecords[0];

    // 新しいレコードに24h購入確認ありがあるかチェック
    if (newestRecord.purchased24h === '○') {
      // 新しい方を優先
      keepIndices.add(newestRecord.index);
      return;
    }

    // 価値ある最新レコードを残す
    const valuableRecords = records.filter(isValuable);

    if (valuableRecords.length > 0) {
      const latestValuable = valuableRecords.reduce((prev, current) => {
        return new Date(current.date) > new Date(prev.date) ? current : prev;
      });
      keepIndices.add(latestValuable.index);
    }
    // 価値のある記録がない場合は、全て削除される
  });

  // 残すデータだけを収集（元の順序を維持）
  const keepData = [];
  data.forEach((row, index) => {
    if (keepIndices.has(index)) {
      keepData.push(row);
    }
  });

  const removedCount = originalCount - keepData.length;

  // データがない場合はヘッダー以外を全削除
  if (keepData.length === 0) {
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    return {
      success: true,
      message: 'クリーニング完了（全削除）',
      removed: removedCount,
      remaining: 0
    };
  }

  // 一括書き込みで置き換え
  // 1. データ領域をクリア
  dataRange.clearContent();

  // 2. 残すデータを一括書き込み
  sheet.getRange(2, 1, keepData.length, numCols).setValues(keepData);

  // 3. 余分な行を削除（残ったデータより後ろの行）
  const newLastRow = keepData.length + 1; // ヘッダー含む
  if (lastRow > newLastRow) {
    sheet.deleteRows(newLastRow + 1, lastRow - newLastRow);
  }

  return {
    success: true,
    message: 'クリーニング完了',
    removed: removedCount,
    remaining: keepData.length
  };
}

/**
 * 手動テスト用関数
 */
function testRecordArticle() {
  const testData = {
    url: 'https://note.com/test/n/test123',
    title: 'テスト記事タイトル',
    author: 'テスト著者',
    authorUrl: 'https://note.com/test',
    likes: 100,
    price: 500,
    tags: 'AI,ビジネス,副業',
    recordedAt: new Date().toISOString()
  };

  const result = recordArticle(testData);
  Logger.log(result);
}

// ============================================
// トラッキング機能
// ============================================

/**
 * トラッキングシートを初期化
 */
function initializeTrackingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TRACKING_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(TRACKING_SHEET_NAME);
  }

  // ヘッダー行が空の場合のみ設定
  const headerRange = sheet.getRange(1, 1, 1, 11);
  if (headerRange.getValues()[0][0] === '') {
    headerRange.setValues([[
      'URL',
      'タイトル',
      '著者',
      '価格',
      'リストイン日',
      '終了日',
      'チェック回数',
      'ヒット回数',
      '最終チェック日',
      'ステータス',
      'ヒット率(%)'
    ]]);

    // ヘッダー行の書式設定
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#9C27B0');  // 紫
    headerRange.setFontColor('#ffffff');

    // 列幅を調整
    sheet.setColumnWidth(1, 300);   // URL
    sheet.setColumnWidth(2, 250);   // タイトル
    sheet.setColumnWidth(3, 120);   // 著者
    sheet.setColumnWidth(4, 70);    // 価格
    sheet.setColumnWidth(5, 100);   // リストイン日
    sheet.setColumnWidth(6, 100);   // 終了日
    sheet.setColumnWidth(7, 90);    // チェック回数
    sheet.setColumnWidth(8, 80);    // ヒット回数
    sheet.setColumnWidth(9, 110);   // 最終チェック日
    sheet.setColumnWidth(10, 80);   // ステータス
    sheet.setColumnWidth(11, 80);   // ヒット率

    // フィルターを設定
    sheet.getRange(1, 1, 1, 11).createFilter();

    // 1行目を固定
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * トラッキングリストに記事を追加
 * @param {Object} data 記事データ
 * @return {boolean} 追加されたかどうか
 */
function addToTracking(data) {
  const sheet = initializeTrackingSheet();
  const lastRow = sheet.getLastRow();

  // 既にトラッキング中かチェック（URL列で検索）
  if (lastRow > 1) {
    const urls = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const statuses = sheet.getRange(2, 10, lastRow - 1, 1).getValues();

    for (let i = 0; i < urls.length; i++) {
      if (urls[i][0] === data.url && statuses[i][0] === '追跡中') {
        // 既に追跡中の場合はスキップ
        return false;
      }
    }
  }

  // 日付計算
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + TRACKING_DAYS);

  const formatDate = (date) => Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd');

  // 新しい行を追加
  const newRow = lastRow + 1;
  sheet.getRange(newRow, 1, 1, 11).setValues([[
    data.url,
    data.title || '',
    data.author || '',
    data.price || 0,
    formatDate(today),      // リストイン日
    formatDate(endDate),    // 終了日
    0,                      // チェック回数
    1,                      // ヒット回数（初回検出分）
    formatDate(today),      // 最終チェック日
    '追跡中',               // ステータス
    ''                      // ヒット率（後で計算）
  ]]);

  return true;
}

/**
 * 追跡中のURLリストを取得（APIエンドポイント用）
 * @return {Object} 追跡中URLリスト
 */
function getTrackingList() {
  const sheet = initializeTrackingSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return { success: true, urls: [], count: 0 };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const trackingUrls = [];

  data.forEach((row, index) => {
    if (row[9] === '追跡中') {  // ステータス列
      trackingUrls.push({
        row: index + 2,  // 実際の行番号
        url: row[0],
        title: row[1],
        author: row[2],
        price: row[3],
        listInDate: row[4],
        endDate: row[5],
        checkCount: row[6],
        hitCount: row[7]
      });
    }
  });

  return {
    success: true,
    urls: trackingUrls,
    count: trackingUrls.length
  };
}

/**
 * トラッキング結果を更新（APIエンドポイント用）
 * @param {Object} results チェック結果 { url: boolean, ... }
 * @return {Object} 更新結果
 */
function updateTrackingResults(results) {
  const sheet = initializeTrackingSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return { success: false, error: 'トラッキングデータがありません' };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  const today = new Date();
  const formatDate = (date) => Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd');

  let updatedCount = 0;
  let completedCount = 0;

  data.forEach((row, index) => {
    const url = row[0];
    const endDateStr = row[5];
    const status = row[9];

    if (status !== '追跡中') return;

    // 結果があれば更新
    if (url in results) {
      const actualRow = index + 2;
      const checkCount = (row[6] || 0) + 1;
      const hitCount = (row[7] || 0) + (results[url] ? 1 : 0);
      const hitRate = checkCount > 0 ? Math.round((hitCount / checkCount) * 100) : 0;

      // 終了日チェック
      const endDate = new Date(endDateStr);
      const isExpired = today >= endDate;
      const newStatus = isExpired ? '完了' : '追跡中';

      sheet.getRange(actualRow, 7).setValue(checkCount);      // チェック回数
      sheet.getRange(actualRow, 8).setValue(hitCount);        // ヒット回数
      sheet.getRange(actualRow, 9).setValue(formatDate(today)); // 最終チェック日
      sheet.getRange(actualRow, 10).setValue(newStatus);      // ステータス
      sheet.getRange(actualRow, 11).setValue(hitRate);        // ヒット率

      updatedCount++;
      if (isExpired) completedCount++;
    }
  });

  return {
    success: true,
    updated: updatedCount,
    completed: completedCount
  };
}

/**
 * 期限切れのトラッキングを完了に更新
 */
function expireOldTracking() {
  const sheet = initializeTrackingSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return { expired: 0 };

  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  const today = new Date();
  let expiredCount = 0;

  data.forEach((row, index) => {
    const endDateStr = row[5];
    const status = row[9];

    if (status !== '追跡中') return;

    const endDate = new Date(endDateStr);
    if (today >= endDate) {
      const actualRow = index + 2;
      const checkCount = row[6] || 0;
      const hitCount = row[7] || 0;
      const hitRate = checkCount > 0 ? Math.round((hitCount / checkCount) * 100) : 0;

      sheet.getRange(actualRow, 10).setValue('完了');
      sheet.getRange(actualRow, 11).setValue(hitRate);
      expiredCount++;
    }
  });

  return { expired: expiredCount };
}
