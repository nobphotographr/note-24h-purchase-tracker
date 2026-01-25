"""Slack通知モジュール"""
import os
from datetime import datetime
from typing import Optional

import requests


def notify_slack(message: str, level: str = "info") -> bool:
    """
    Slackに通知を送信

    Args:
        message: 通知メッセージ
        level: 通知レベル ("info", "success", "error", "warning")

    Returns:
        成功した場合True
    """
    webhook_url = os.getenv("SLACK_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return False

    emoji_map = {
        "info": "ℹ️",
        "success": "✅",
        "error": "🚨",
        "warning": "⚠️",
    }
    emoji = emoji_map.get(level, "📝")

    try:
        response = requests.post(
            webhook_url,
            json={"text": f"{emoji} {message}"},
            timeout=10,
        )
        return response.status_code == 200
    except Exception as e:
        print(f"[slack] Failed to send notification: {e}")
        return False


def notify_start(keywords_count: int, day_name: str, total_keywords: int) -> bool:
    """スクレイピング開始通知"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    message = f"スクレイピング開始\n• 日時: {now}\n• {day_name}曜日分: {keywords_count}/{total_keywords} キーワード"
    return notify_slack(message, "info")


def notify_complete(
    keywords_count: int,
    total_records: int,
    new_records: int,
    errors: int,
    elapsed_minutes: float,
) -> bool:
    """スクレイピング完了通知"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    status = "success" if errors == 0 else "warning"

    lines = [
        "スクレイピング完了",
        f"• 日時: {now}",
        f"• キーワード数: {keywords_count}",
        f"• 総記録数: {total_records}",
        f"• 新規記録: {new_records}",
        f"• 所要時間: {elapsed_minutes:.1f}分",
    ]
    if errors > 0:
        lines.append(f"• エラー数: {errors}")

    return notify_slack("\n".join(lines), status)


def notify_error(error_message: str, context: Optional[str] = None) -> bool:
    """エラー通知"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "エラー発生",
        f"• 日時: {now}",
        f"• エラー: {error_message}",
    ]
    if context:
        lines.append(f"• 詳細: {context}")

    return notify_slack("\n".join(lines), "error")


def notify_critical(error_message: str) -> bool:
    """重大エラー通知（プロセス停止など）"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    message = f"重大エラー - プロセス停止\n• 日時: {now}\n• エラー: {error_message}"
    return notify_slack(message, "error")
