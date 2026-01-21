/**
 * note-sales-tracker GAS Web API
 * 拡張機能からのデータを受信してスプレッドシートに記録する
 */

// スプレッドシートのシート名
const SHEET_NAME = '記録データ';

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

  return {
    success: true,
    message: sameUrlCount > 1
      ? `更新として記録しました（${sameUrlCount}回目）`
      : '新規記録しました',
    row: lastRow,
    isUpdate: sameUrlCount > 1,
    recordCount: sameUrlCount
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
 * 重複URLをクリーニング
 * - 各URLの価値のある記録（高評価1以上 OR 24h購入確認あり）の最新版を保持
 * - 価値のない記録（高評価0 AND 24h購入確認なし）は削除
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
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 12);
  const data = dataRange.getValues();

  // URLごとにグループ化
  const urlGroups = new Map();

  data.forEach((row, index) => {
    const url = row[5]; // URL列（インデックス5）

    if (!url) return;

    if (!urlGroups.has(url)) {
      urlGroups.set(url, []);
    }
    urlGroups.get(url).push({ row, index, date: row[0] });
  });

  // 保持する行のインデックスセット
  const keepIndices = new Set();

  urlGroups.forEach((records, url) => {
    // 価値のある記録（高評価1以上 OR 24h購入確認あり）を抽出
    const valuableRecords = records.filter(record => {
      const highRating = record.row[7]; // 高評価数（インデックス7）
      const purchased24h = record.row[11]; // 24h購入確認（インデックス11）
      return (highRating !== null && highRating !== '' && highRating > 0) || purchased24h === '○';
    });

    if (valuableRecords.length > 0) {
      // 価値のある記録がある場合、その中で最新のものを保持
      const latest = valuableRecords.reduce((prev, current) => {
        return new Date(current.date) > new Date(prev.date) ? current : prev;
      });
      keepIndices.add(latest.index);
    }
    // 価値のある記録がない場合は、全て削除される（keepIndicesに追加しない）
  });

  // 削除する行を特定（下から削除するために逆順でソート）
  const deleteRows = [];
  data.forEach((row, index) => {
    if (row[5] && !keepIndices.has(index)) {  // URL列（インデックス5）
      deleteRows.push(index + 2); // ヘッダー行分を加算
    }
  });

  // 下から順に削除
  deleteRows.sort((a, b) => b - a);
  deleteRows.forEach(rowNum => {
    sheet.deleteRow(rowNum);
  });

  return {
    success: true,
    message: `クリーニング完了`,
    removed: deleteRows.length,
    remaining: lastRow - 1 - deleteRows.length
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
