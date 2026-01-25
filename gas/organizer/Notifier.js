/**
 * Slack通知モジュール
 * GASからSlackへ通知を送信
 */

/**
 * Slack Webhook URLを取得
 * Script Propertiesから取得
 * @return {string} Webhook URL
 */
function getSlackWebhookUrl() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('SLACK_WEBHOOK_URL') || '';
}

/**
 * Slack Webhook URLを設定（初回のみ手動実行）
 * @param {string} url Webhook URL
 */
function setSlackWebhookUrl(url) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SLACK_WEBHOOK_URL', url);
  Logger.log('Slack Webhook URLを設定しました');
}

/**
 * Slackに通知を送信
 * @param {string} message メッセージ
 * @param {string} level 通知レベル (info, success, error, warning)
 * @return {boolean} 成功した場合true
 */
function notifySlack(message, level) {
  const webhookUrl = getSlackWebhookUrl();
  if (!webhookUrl) {
    Logger.log('[slack] Webhook URL not configured');
    return false;
  }

  const emojiMap = {
    'info': 'ℹ️',
    'success': '✅',
    'error': '🚨',
    'warning': '⚠️'
  };
  const emoji = emojiMap[level] || '📝';

  try {
    const payload = {
      text: `${emoji} ${message}`
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(webhookUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      Logger.log('[slack] Notification sent successfully');
      return true;
    } else {
      Logger.log(`[slack] Failed with status ${responseCode}: ${response.getContentText()}`);
      return false;
    }
  } catch (error) {
    Logger.log(`[slack] Error sending notification: ${error.message}`);
    return false;
  }
}

/**
 * GAS整理処理完了通知
 * @param {number} processedCount 処理件数
 * @param {number} cleanedCount クリーニングで削除した件数
 * @param {Object} genreCounts ジャンル別件数
 */
function notifyGasComplete(processedCount, cleanedCount, genreCounts) {
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

  const lines = [
    '[GAS] データ整理完了',
    `• 日時: ${now}`,
    `• 処理件数: ${processedCount}件`,
    `• クリーニング削除: ${cleanedCount}件`
  ];

  // ジャンル別件数を追加（0件以外）
  if (genreCounts && Object.keys(genreCounts).length > 0) {
    const genreLines = Object.entries(genreCounts)
      .filter(([_, count]) => count > 0)
      .map(([genre, count]) => `  - ${genre}: ${count}件`);

    if (genreLines.length > 0) {
      lines.push('• ジャンル内訳:');
      lines.push(...genreLines);
    }
  }

  return notifySlack(lines.join('\n'), 'success');
}

/**
 * GAS処理なし通知（処理対象がなかった場合）
 */
function notifyGasNoData() {
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  const message = `[GAS] データ整理完了\n• 日時: ${now}\n• 処理対象データなし`;
  return notifySlack(message, 'info');
}

/**
 * GASエラー通知
 * @param {string} errorMessage エラーメッセージ
 */
function notifyGasError(errorMessage) {
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  const message = `[GAS] エラー発生\n• 日時: ${now}\n• エラー: ${errorMessage}`;
  return notifySlack(message, 'error');
}

/**
 * テスト通知を送信
 */
function testSlackNotification() {
  const result = notifySlack('GASからのテスト通知です', 'info');
  Logger.log(`Test notification result: ${result}`);
}
