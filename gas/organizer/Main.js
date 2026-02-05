/**
 * メイン処理
 * ソーススプレッドシートからデータを取得し、ジャンル別にターゲットスプレッドシートへ転記
 */

/**
 * メイン実行関数
 * 日次トリガーから呼び出される
 */
function organizeNoteData() {
  try {
    Logger.log('=== データ整理処理開始 ===');

    // 1. ソースデータのクリーニング
    Logger.log('--- クリーニング開始 ---');
    const cleanResult = cleanSourceData();
    Logger.log(`クリーニング完了: ${cleanResult.removed}件削除、${cleanResult.remaining}件残存`);

    // 2. ターゲットスプレッドシートの準備
    const targetSpreadsheet = getOrCreateTargetSpreadsheet();
    Logger.log(`ターゲットスプレッドシート: ${targetSpreadsheet.getName()}`);

    // 3. ソースデータの取得（未処理のみ）
    const result = getSourceData();
    const sourceData = result.data;
    const rowNumbers = result.rowNumbers;
    Logger.log(`取得データ件数: ${sourceData.length}`);

    if (sourceData.length === 0) {
      Logger.log('処理対象データがありません');
      formatAllGenreSheets();
      notifyGasNoData();
      return;
    }

    // 新着一覧を更新（当日分のデータ）
    const newArrivalsCount = updateNewArrivalsSheet(targetSpreadsheet, sourceData);
    Logger.log(`新着一覧: ${newArrivalsCount}件`);

    // ジャンル別にデータを分類
    const categorizedData = categorizeData(sourceData);

    // ジャンルごとに処理（優先順序に従う）
    const genreCounts = {};
    GENRE_PRIORITY.forEach(genre => {
      const data = categorizedData[genre] || [];
      genreCounts[genre] = data.length;
      Logger.log(`${genre}: ${data.length}件`);

      if (data.length > 0) {
        updateGenreSheet(targetSpreadsheet, genre, data);
      }
    });

    // 処理済みフラグを更新
    markAsProcessed(rowNumbers);
    formatAllGenreSheets();

    // 完了通知
    notifyGasComplete(sourceData.length, cleanResult.removed, genreCounts, newArrivalsCount);

    Logger.log('=== データ整理処理完了 ===');

  } catch (error) {
    Logger.log(`エラー発生: ${error.message}`);
    notifyGasError(error.message);
    throw error;
  }
}

/**
 * ソーススプレッドシートから未処理データを取得
 * @return {Object} {data: データ配列, rowNumbers: 行番号配列}
 */
function getSourceData() {
  const sourceSheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(SOURCE_SHEET_NAME);

  if (!sourceSheet) {
    throw new Error(`シート「${SOURCE_SHEET_NAME}」が見つかりません`);
  }

  const lastRow = sourceSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('データが存在しません');
    return { data: [], rowNumbers: [] };
  }

  // P列（処理済みフラグ）まで取得
  const allData = sourceSheet.getRange(2, 1, lastRow - 1, COLUMNS.PROCESSED + 1).getValues();

  const filteredData = [];
  const rowNumbers = [];

  allData.forEach((row, index) => {
    const highEval = row[COLUMNS.HIGH_EVAL];
    const purchased24h = row[COLUMNS.PURCHASED_24H];
    const processed = row[COLUMNS.PROCESSED];

    // 価値あるデータ（高評価 > 0 OR 24h購入確認あり）かつ未処理の行のみ
    const isValuable = (highEval !== null && highEval !== '' && highEval > 0) || purchased24h === '○';
    if (isValuable && !processed) {
      filteredData.push(row);
      rowNumbers.push(index + 2); // 実際の行番号（ヘッダー分+1）
    }
  });

  return { data: filteredData, rowNumbers: rowNumbers };
}

/**
 * データをジャンル別に分類
 * @param {Array} data データ配列
 * @return {Object} ジャンル別データオブジェクト
 */
function categorizeData(data) {
  const result = {};

  // ジャンルの初期化（優先順序に従う）
  GENRE_PRIORITY.forEach(genre => {
    result[genre] = [];
  });

  data.forEach(row => {
    const tag = row[COLUMNS.TAG] || '';
    const title = row[COLUMNS.TITLE] || '';
    const author = row[COLUMNS.AUTHOR] || '';

    // ジャンル判定（著者ルール → タグ → タイトルの優先順）
    const genre = detectGenre(tag, title, author);
    result[genre].push(row);
  });

  return result;
}

/**
 * タグ・タイトル・著者からジャンルを判定
 * @param {string} tag タグ
 * @param {string} title タイトル
 * @param {string} author 著者名
 * @return {string} ジャンル名
 */
function detectGenre(tag, title, author) {
  // 文字列に変換（null/undefined/数値対策）
  const tagStr = String(tag || '');
  const titleStr = String(title || '');
  const authorStr = String(author || '');

  // 0. 著者ルールでマッチング（最優先）
  if (authorStr) {
    for (const genre of Object.keys(AUTHOR_RULES)) {
      const authors = AUTHOR_RULES[genre] || [];
      for (const authorName of authors) {
        if (authorStr.includes(authorName)) {
          return genre;
        }
      }
    }
  }

  // 1. タグでマッチング（優先順序に従う）
  for (const genre of GENRE_PRIORITY) {
    if (genre === 'その他') continue;

    const keywords = GENRE_RULES[genre] || [];
    for (const keyword of keywords) {
      if (tagStr.includes(keyword)) {
        return genre;
      }
    }
  }

  // 2. タグが空白またはマッチしない場合、タイトルでマッチング
  for (const genre of GENRE_PRIORITY) {
    if (genre === 'その他') continue;

    const keywords = GENRE_RULES[genre] || [];
    for (const keyword of keywords) {
      if (titleStr.includes(keyword)) {
        return genre;
      }
    }
  }

  // 3. どちらもマッチしない場合は「その他」
  return 'その他';
}

/**
 * ターゲットスプレッドシートを取得または作成
 * @return {Spreadsheet} スプレッドシートオブジェクト
 */
function getOrCreateTargetSpreadsheet() {
  if (TARGET_SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    } catch (error) {
      Logger.log(`指定されたIDのスプレッドシートが見つかりません: ${TARGET_SPREADSHEET_ID}`);
    }
  }

  // 新規作成
  const newSpreadsheet = SpreadsheetApp.create('Note投稿データ（整理後）');
  Logger.log(`新しいスプレッドシートを作成しました: ${newSpreadsheet.getUrl()}`);
  Logger.log(`Config.jsのTARGET_SPREADSHEET_IDに以下のIDを設定してください: ${newSpreadsheet.getId()}`);

  // デフォルトシート（シート1）はそのまま残す
  // ジャンル別シートが作成された後、手動で削除可能

  return newSpreadsheet;
}

/**
 * ジャンルシートにデータを更新
 * @param {Spreadsheet} spreadsheet ターゲットスプレッドシート
 * @param {string} genre ジャンル名
 * @param {Array} newData 新規データ配列
 */
function updateGenreSheet(spreadsheet, genre, newData) {
  let sheet = spreadsheet.getSheetByName(genre);

  // シートが存在しない場合は作成
  if (!sheet) {
    sheet = spreadsheet.insertSheet(genre);
    initializeSheetHeaders(sheet);
  }

  // 既存データを取得
  const lastRow = sheet.getLastRow();
  let existingData = [];
  let existingUrls = {};

  if (lastRow > 1) {
    existingData = sheet.getRange(2, 1, lastRow - 1, OUTPUT_END_COL - OUTPUT_START_COL + 1).getValues();

    // URL -> 行番号のマップを作成（F列 = URL）
    existingData.forEach((row, index) => {
      const url = row[COLUMNS.URL - OUTPUT_START_COL];
      if (url) {
        existingUrls[url] = index + 2; // 行番号（ヘッダー分+1）
      }
    });
  }

  // 新規データを処理
  newData.forEach(row => {
    const url = row[COLUMNS.URL];
    const outputRow = row.slice(OUTPUT_START_COL, OUTPUT_END_COL + 1);

    if (existingUrls[url]) {
      // 既存データと比較して、変更があれば更新
      const existingRowIndex = existingUrls[url] - 2;
      const existingRow = existingData[existingRowIndex];

      if (!arraysEqual(outputRow, existingRow)) {
        // 更新
        sheet.getRange(existingUrls[url], 1, 1, outputRow.length).setValues([outputRow]);
        Logger.log(`更新: ${genre} - ${url}`);
      }
    } else {
      // 新規追加
      sheet.appendRow(outputRow);
      Logger.log(`追加: ${genre} - ${url}`);
    }
  });

  sortSheetByHighEval(sheet);
  applySheetFormatting(sheet);
}

/**
 * シートにヘッダー行を初期化
 * @param {Sheet} sheet シートオブジェクト
 */
function initializeSheetHeaders(sheet) {
  const headers = [
    '記録日時', '作成日', 'タイトル', '著者', '著者URL', 'URL',
    'スキ数', '高評価数', '価格', 'タグ', '販売主張',
    '24h購入確認', '経過日数', '最低売上推定', '購入者率(%)'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderFormatting(sheet, headers.length);
  sheet.setFrozenRows(1);
}

function sortSheetByHighEval(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 2) {
    return;
  }

  const lastCol = sheet.getLastColumn();
  const highEvalCol = getOutputColumnNumber(COLUMNS.HIGH_EVAL);
  sheet.getRange(2, 1, lastRow - 1, lastCol).sort({ column: highEvalCol, ascending: false });
}

function applyHeaderFormatting(sheet, headerColCount) {
  const lastCol = headerColCount || sheet.getLastColumn();
  if (lastCol === 0) {
    return;
  }

  sheet.getRange(1, 1, 1, lastCol)
    .setFontWeight('bold')
    .setBackground('#d9e2f3')
    .setFontColor('#000000');
}

function applySheetFormatting(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    return;
  }

  const lastCol = sheet.getLastColumn();
  applyHeaderFormatting(sheet, lastCol);
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  range.setBorder(true, true, true, true, true, true, '#b7b7b7', SpreadsheetApp.BorderStyle.SOLID);
}

function formatAllGenreSheets() {
  const targetSpreadsheet = getOrCreateTargetSpreadsheet();
  const excludeSheets = ['概要', 'シート1']; // 書式を上書きしないシート

  targetSpreadsheet.getSheets().forEach(sheet => {
    if (sheet.getLastRow() === 0) {
      return;
    }
    if (excludeSheets.includes(sheet.getName())) {
      return; // 除外シートはスキップ
    }
    applySheetFormatting(sheet);
  });
}

function resetTargetSheets() {
  const targetSpreadsheet = getOrCreateTargetSpreadsheet();
  const sheets = targetSpreadsheet.getSheets();
  const tempSheet = targetSpreadsheet.insertSheet('_temp');

  sheets.forEach(sheet => {
    targetSpreadsheet.deleteSheet(sheet);
  });

  GENRE_PRIORITY.forEach(genre => {
    const sheet = targetSpreadsheet.insertSheet(genre);
    initializeSheetHeaders(sheet);
  });

  targetSpreadsheet.deleteSheet(tempSheet);
}

function getOutputColumnNumber(columnIndex) {
  return columnIndex - OUTPUT_START_COL + 1;
}

/**
 * 配列の内容が等しいかチェック
 * @param {Array} arr1 配列1
 * @param {Array} arr2 配列2
 * @return {boolean} 等しい場合true
 */
function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;

  for (let i = 0; i < arr1.length; i++) {
    // 日付型の比較
    if (arr1[i] instanceof Date && arr2[i] instanceof Date) {
      if (arr1[i].getTime() !== arr2[i].getTime()) return false;
    } else if (arr1[i] !== arr2[i]) {
      return false;
    }
  }

  return true;
}

/**
 * 処理済みフラグを更新（一括書き込み最適化版）
 * @param {Array} rowNumbers 処理した行番号の配列
 */
function markAsProcessed(rowNumbers) {
  if (rowNumbers.length === 0) {
    return;
  }

  const sourceSheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(SOURCE_SHEET_NAME);
  const processedDate = new Date();
  const lastRow = sourceSheet.getLastRow();

  // P列の全データを取得
  const processedCol = COLUMNS.PROCESSED + 1;
  const processedData = sourceSheet.getRange(2, processedCol, lastRow - 1, 1).getValues();

  // 行番号セットを作成
  const rowNumberSet = new Set(rowNumbers);

  // 該当行に処理日時を設定
  for (let i = 0; i < processedData.length; i++) {
    const actualRow = i + 2; // ヘッダー分を加算
    if (rowNumberSet.has(actualRow)) {
      processedData[i][0] = processedDate;
    }
  }

  // 一括書き込み
  sourceSheet.getRange(2, processedCol, processedData.length, 1).setValues(processedData);

  Logger.log(`${rowNumbers.length}件の処理済みフラグを更新しました`);
}

/**
 * ソーススプレッドシートのクリーニング（一括書き込み最適化版）
 * - 同じURLで複数レコードがある場合の優先順位:
 *   1. 新しいレコードに「24h購入確認あり（○）」がある → 新しい方を残す
 *   2. それ以外 → 処理済み（P列あり）のレコードを残す
 *   3. 処理済みがなければ、価値ある最新レコードを残す
 * - 価値のない記録（高評価0 AND 24h購入確認なし）のみのURLは全て削除
 * @return {Object} {success: boolean, removed: 削除数, remaining: 残存数}
 */
function cleanSourceData() {
  const sourceSheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(SOURCE_SHEET_NAME);

  if (!sourceSheet) {
    return { success: false, error: 'シートが見つかりません', removed: 0, remaining: 0 };
  }

  const lastRow = sourceSheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, message: 'クリーニング対象がありません', removed: 0, remaining: 0 };
  }

  // 全データを取得（A列～P列：処理済みフラグまで）
  const numCols = COLUMNS.PROCESSED + 1;
  const dataRange = sourceSheet.getRange(2, 1, lastRow - 1, numCols);
  const data = dataRange.getValues();
  const originalCount = data.length;

  // URLごとにグループ化
  const urlGroups = new Map();

  data.forEach((row, index) => {
    const url = row[COLUMNS.URL];

    if (!url) return;

    if (!urlGroups.has(url)) {
      urlGroups.set(url, []);
    }
    urlGroups.get(url).push({
      row,
      index,
      date: row[COLUMNS.RECORD_DATE],
      highEval: row[COLUMNS.HIGH_EVAL],
      purchased24h: row[COLUMNS.PURCHASED_24H],
      processed: row[COLUMNS.PROCESSED]
    });
  });

  // 保持する行のインデックスセット
  const keepIndices = new Set();

  urlGroups.forEach((records, url) => {
    if (records.length === 1) {
      // 1件のみの場合、価値があれば残す
      const record = records[0];
      const isValuable = (record.highEval !== null && record.highEval !== '' && record.highEval > 0) ||
                         record.purchased24h === '○';
      if (isValuable) {
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

    // 処理済みレコードを探す
    const processedRecords = records.filter(r => r.processed);
    if (processedRecords.length > 0) {
      // 処理済みレコードがあれば、その中で最新を残す
      const latestProcessed = processedRecords.reduce((prev, current) => {
        return new Date(current.date) > new Date(prev.date) ? current : prev;
      });
      keepIndices.add(latestProcessed.index);
      return;
    }

    // 処理済みがなければ、価値ある最新レコードを残す
    const valuableRecords = records.filter(record => {
      return (record.highEval !== null && record.highEval !== '' && record.highEval > 0) ||
             record.purchased24h === '○';
    });

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
      sourceSheet.deleteRows(2, lastRow - 1);
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
  sourceSheet.getRange(2, 1, keepData.length, numCols).setValues(keepData);

  // 3. 余分な行を削除（残ったデータより後ろの行）
  const newLastRow = keepData.length + 1; // ヘッダー含む
  if (lastRow > newLastRow) {
    sourceSheet.deleteRows(newLastRow + 1, lastRow - newLastRow);
  }

  return {
    success: true,
    message: 'クリーニング完了',
    removed: removedCount,
    remaining: keepData.length
  };
}

/**
 * 日次トリガーを設定（初回のみ手動実行）
 */
function setupDailyTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'organizeNoteData') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 新しいトリガーを作成（毎日午前2時に実行）
  ScriptApp.newTrigger('organizeNoteData')
    .timeBased()
    .atHour(2)
    .everyDays(1)
    .create();

  Logger.log('日次トリガーを設定しました（毎日午前2時実行）');
}

/**
 * 新着一覧シートを更新
 * 当日の記録日時のデータのみを表示（毎日リセット）
 * @param {Spreadsheet} spreadsheet ターゲットスプレッドシート
 * @param {Array} sourceData ソースデータ配列
 * @return {number} 新着件数
 */
function updateNewArrivalsSheet(spreadsheet, sourceData) {
  const SHEET_NAME = '新着一覧';
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  // シートが存在しない場合は作成
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME, 0); // 先頭に挿入
    initializeSheetHeaders(sheet);
  }

  // ヘッダー行以外をクリア（deleteRowsはエラーになる場合があるため）
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn() || OUTPUT_END_COL + 1;
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }

  // 当日の日付を取得（日本時間）
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

  // 当日分のデータをフィルタリング
  const todayData = sourceData.filter(row => {
    const recordDate = row[COLUMNS.RECORD_DATE];
    if (!recordDate) return false;

    // 日付部分のみを比較
    const recordDateStr = Utilities.formatDate(new Date(recordDate), 'Asia/Tokyo', 'yyyy/MM/dd');
    return recordDateStr === today;
  });

  if (todayData.length === 0) {
    Logger.log('新着一覧: 当日データなし');
    return 0;
  }

  // データを書き込み（A〜O列）
  const outputData = todayData.map(row => row.slice(OUTPUT_START_COL, OUTPUT_END_COL + 1));
  sheet.getRange(2, 1, outputData.length, outputData[0].length).setValues(outputData);

  // 書式設定
  sortSheetByHighEval(sheet);
  applySheetFormatting(sheet);

  return todayData.length;
}
