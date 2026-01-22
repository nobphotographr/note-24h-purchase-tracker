"""VPS環境でのスクロール動作テスト"""
import time
import random
from playwright.sync_api import sync_playwright

def test_scroll():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
        )
        page = context.new_page()

        url = "https://note.com/search?context=note_for_sale&q=副業&sort=popular"
        print(f"[1] Navigating to {url}")
        page.goto(url, wait_until="networkidle")
        print("[2] Page loaded")

        time.sleep(3)
        print("[3] Initial wait complete")

        for i in range(3):
            # スクロール前の記事数を取得
            articles_before = page.eval_on_selector_all(
                "a[href]",
                "elements => elements.filter(a => /https:\\/\\/note\\.com\\/[^/]+\\/n\\/[^/]+/.test(a.href)).length"
            )
            print(f"[scroll {i+1}] Articles before scroll: {articles_before}")

            # スクロール実行
            page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            print(f"[scroll {i+1}] Scroll executed")

            # 待機
            wait_time = random.uniform(4, 6)
            print(f"[scroll {i+1}] Waiting {wait_time:.1f} seconds...")
            time.sleep(wait_time)

            # スクロール後の記事数を取得
            articles_after = page.eval_on_selector_all(
                "a[href]",
                "elements => elements.filter(a => /https:\\/\\/note\\.com\\/[^/]+\\/n\\/[^/]+/.test(a.href)).length"
            )
            print(f"[scroll {i+1}] Articles after scroll: {articles_after}")
            print(f"[scroll {i+1}] Delta: {articles_after - articles_before}")

        browser.close()
        print("[done] Test complete")

if __name__ == "__main__":
    test_scroll()
