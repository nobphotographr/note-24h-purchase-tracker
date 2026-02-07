#!/usr/bin/env python3
"""
note 24h購入トラッキングチェッカー
- GASから追跡中URLリストを取得
- 各URLにアクセスして24hポップアップの有無を確認
- 結果をGASに送信
"""
import json
import os
import random
import time
from datetime import datetime
from typing import Dict, List

import requests
from dotenv import load_dotenv
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

# 24h購入ポップアップのセレクタ
PURCHASED_SELECTOR = ".m-purchasedWithinLast24HoursBalloon"


def get_tracking_list(gas_url: str) -> List[Dict]:
    """GASから追跡中URLリストを取得"""
    response = requests.get(f"{gas_url}?action=getTrackingList", timeout=30)
    response.raise_for_status()
    data = response.json()

    if not data.get("success"):
        raise RuntimeError(f"Failed to get tracking list: {data.get('error')}")

    return data.get("urls", [])


def update_tracking_results(gas_url: str, results: Dict[str, bool]) -> Dict:
    """トラッキング結果をGASに送信"""
    payload = {
        "action": "updateTrackingResults",
        "results": results
    }
    response = requests.post(gas_url, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()


def check_purchased_24h(page, url: str, timeout_ms: int = 1500) -> bool:
    """URLにアクセスして24hポップアップの有無を確認"""
    try:
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector(PURCHASED_SELECTOR, timeout=timeout_ms, state="attached")
        return True
    except PlaywrightTimeoutError:
        return False
    except Exception as e:
        print(f"[error] Failed to check {url}: {e}")
        return False


def run_tracker():
    """トラッキングチェッカーのメイン処理"""
    load_dotenv()
    gas_url = os.getenv("GAS_WEB_APP_URL", "").strip()

    if not gas_url:
        raise RuntimeError("GAS_WEB_APP_URL is not set")

    print(f"[tracker] Starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 追跡中URLリストを取得
    tracking_list = get_tracking_list(gas_url)
    print(f"[tracker] {len(tracking_list)} URLs to check")

    if not tracking_list:
        print("[tracker] No URLs to track")
        return

    # 結果を格納
    results: Dict[str, bool] = {}
    hit_count = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
        )
        page = context.new_page()

        for i, item in enumerate(tracking_list, 1):
            url = item["url"]
            title = item.get("title", "")[:30]

            print(f"[check] {i}/{len(tracking_list)} {url}")

            is_hit = check_purchased_24h(page, url)
            results[url] = is_hit

            if is_hit:
                hit_count += 1
                print(f"  -> HIT! {title}")
            else:
                print(f"  -> miss {title}")

            # 待機（2-4秒）
            time.sleep(random.uniform(2, 4))

        browser.close()

    # 結果をGASに送信
    print(f"[tracker] Sending results: {hit_count}/{len(tracking_list)} hits")
    update_result = update_tracking_results(gas_url, results)
    print(f"[tracker] Update result: {update_result}")

    print(f"[tracker] Completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    run_tracker()
