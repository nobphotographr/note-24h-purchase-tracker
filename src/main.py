import json
import os
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests
import yaml
from dotenv import load_dotenv
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from src.notifier import notify_complete, notify_critical, notify_error, notify_start

SEARCH_URL_PAID_POPULAR = "https://note.com/search?context=note_for_sale&q={keyword}&sort=popular"
SEARCH_URL_PAID_TREND = "https://note.com/search?context=note_for_sale&q={keyword}&sort=trend"
PURCHASED_SELECTOR = ".m-purchasedWithinLast24HoursBalloon"


@dataclass
class Config:
    keywords: List[str]
    results_per_keyword: int
    article_wait_ms: int
    between_articles_ms: Tuple[int, int]
    between_pages_ms: Tuple[int, int]
    headless: bool
    max_retries: int
    dry_run: bool
    split_days: int


def get_keywords_for_today(all_keywords: List[str], split_days: int) -> List[str]:
    """曜日に応じてキーワードを分割して返す"""
    if split_days <= 1:
        return all_keywords

    day_index = datetime.now().weekday() % split_days
    selected = all_keywords[day_index::split_days]
    return selected


def load_config(path: str) -> Config:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    def range_tuple(key: str, default_min: int, default_max: int) -> Tuple[int, int]:
        data = raw.get(key, {}) or {}
        return int(data.get("min", default_min)), int(data.get("max", default_max))

    return Config(
        keywords=list(raw.get("keywords", [])),
        results_per_keyword=int(raw.get("results_per_keyword", 100)),
        article_wait_ms=int(raw.get("article_wait_ms", 1500)),
        between_articles_ms=range_tuple("between_articles_ms", 2500, 4000),
        between_pages_ms=range_tuple("between_pages_ms", 3000, 5000),
        headless=bool(raw.get("headless", True)),
        max_retries=int(raw.get("max_retries", 2)),
        dry_run=bool(raw.get("dry_run", False)),
        split_days=int(raw.get("split_days", 1)),
    )


def rand_sleep(ms_range: Tuple[int, int]) -> None:
    low, high = ms_range
    delay = random.uniform(low / 1000.0, high / 1000.0)
    time.sleep(delay)


def normalize_url(url: str) -> str:
    if not url:
        return ""
    url = url.split("#", 1)[0]
    url = url.split("?", 1)[0]
    return url.rstrip("/")


def extract_article_urls(page) -> List[str]:
    anchors = page.eval_on_selector_all(
        "a[href]",
        """
        (elements) => elements.map(a => a.getAttribute('href'))
        """,
    )
    urls = []
    for href in anchors:
        if not href:
            continue
        if href.startswith("/"):
            href = f"https://note.com{href}"
        if not href.startswith("https://note.com/"):
            continue
        if re.search(r"https://note\.com/[^/]+/n/[^/]+", href):
            urls.append(normalize_url(href))
    deduped = list(dict.fromkeys(urls))
    return deduped


def collect_from_single_sort(page, search_url: str, limit: int, between_pages_ms: Tuple[int, int]) -> List[str]:
    """単一のソート順で記事URLを収集"""
    page.goto(search_url, wait_until="networkidle")
    # 初期読み込み待機
    time.sleep(random.uniform(3, 4))

    collected: List[str] = []
    stagnant_rounds = 0
    max_scrolls = 50  # 最大スクロール回数

    for scroll_count in range(max_scrolls):
        if len(collected) >= limit:
            break

        current = extract_article_urls(page)
        before = len(collected)
        for url in current:
            if url not in collected:
                collected.append(url)
            if len(collected) >= limit:
                break

        print(f"  [scroll {scroll_count + 1}] {len(collected)} urls collected")

        if len(collected) == before:
            stagnant_rounds += 1
            if stagnant_rounds >= 5:
                print(f"  [scroll] No new articles after {stagnant_rounds} attempts, stopping")
                break
        else:
            stagnant_rounds = 0

        if len(collected) >= limit:
            break

        # ページ最下部までスクロール
        page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")

        # スクロール後の待機時間（新しいコンテンツの読み込みを待つ）
        time.sleep(random.uniform(4, 6))

    return collected[:limit]


def collect_article_urls(page, keyword: str, limit: int, between_pages_ms: Tuple[int, int]) -> List[str]:
    """人気順と急上昇の両方から記事URLを収集（重複除去）"""
    all_urls: List[str] = []

    # 人気順
    popular_url = SEARCH_URL_PAID_POPULAR.format(keyword=keyword)
    print(f"[search] {popular_url} (popular)")
    popular_urls = collect_from_single_sort(page, popular_url, limit, between_pages_ms)
    print(f"[popular] {len(popular_urls)} urls")
    all_urls.extend(popular_urls)

    # 急上昇
    trend_url = SEARCH_URL_PAID_TREND.format(keyword=keyword)
    print(f"[search] {trend_url} (trend)")
    trend_urls = collect_from_single_sort(page, trend_url, limit, between_pages_ms)
    print(f"[trend] {len(trend_urls)} urls")
    for url in trend_urls:
        if url not in all_urls:
            all_urls.append(url)

    print(f"[total] {len(all_urls)} unique urls")
    return all_urls[:limit * 2]  # 両方から取るので上限を2倍に


def text_from_selectors(page, selectors: List[str]) -> str:
    for selector in selectors:
        el = page.query_selector(selector)
        if not el:
            continue
        if selector.startswith("meta"):
            content = el.get_attribute("content") or ""
            if content:
                return content.strip()
        else:
            text = el.inner_text().strip()
            if text:
                return text
    return ""


def parse_int(text: str) -> int:
    if not text:
        return 0
    match = re.search(r"([0-9,]+)", text)
    if not match:
        return 0
    return int(match.group(1).replace(",", ""))


def extract_title(page) -> str:
    selectors = [
        "h1.o-noteContentText__title",
        "h1.note-title",
        ".p-note__title h1",
        "h1",
        'meta[property="og:title"]',
    ]
    return text_from_selectors(page, selectors) or page.title().replace(" | note", "").strip()


def extract_author(page) -> str:
    selectors = [
        ".o-noteContentHeader__name a",
        ".o-noteContentHeader__author a",
        ".o-noteContentHeader__author",
        ".p-noteHeader__author",
        ".note-author-name",
        'meta[name="author"]',
    ]
    return text_from_selectors(page, selectors)


def extract_author_url(page) -> str:
    selectors = [
        ".o-noteContentHeader__name a",
        ".o-noteContentHeader__author a",
        ".p-noteHeader__author a",
        ".note-author-link",
    ]
    for selector in selectors:
        el = page.query_selector(selector)
        if el:
            href = el.get_attribute("href") or ""
            if href and not href.startswith("/"):
                return href
            if href.startswith("/"):
                return f"https://note.com{href}"
    return ""


def extract_like_count(page) -> int:
    selectors = [
        ".o-noteLikeV3__count",
        "[data-like-count]",
        ".note-like-count",
        ".js-like-count",
    ]
    for selector in selectors:
        el = page.query_selector(selector)
        if el:
            return parse_int(el.inner_text())
    return 0


def extract_price(page) -> int:
    # 優先順位0: ヘッダー内のステータスボタン（¥0~ など）
    header_status_el = page.query_selector(".o-noteContentHeader__status .a-button__inner")
    if header_status_el:
        text = header_status_el.inner_text().strip()
        if re.search(r"¥\s*0\s*[〜~]", text):
            return 0
        match = re.search(r"¥\s*([\d,]+)", text)
        if match:
            return int(match.group(1).replace(",", ""))

    # 優先順位1: ヘッダー付近の価格表示
    header_selectors = [
        ".o-noteContentHeader__price",
        ".p-article__price",
        "[class*='ContentHeader'] [class*='price']",
    ]
    for selector in header_selectors:
        el = page.query_selector(selector)
        if el:
            text = el.inner_text().strip()
            if re.search(r"¥\s*0\s*[〜~]", text):
                return 0
            match = re.search(r"¥\s*([\d,]+)", text)
            if match:
                return int(match.group(1).replace(",", ""))

    # 優先順位2: 売り切れ時のペイウォール内の価格表示
    paywall_selectors = [
        ".o-accordionPaywall .text-xl",
        ".o-paywall .text-2xl",
        ".o-singlePaywall .text-2xl",
        "section.o-paywall span.text-2xl",
    ]
    for selector in paywall_selectors:
        el = page.query_selector(selector)
        if el:
            text = el.inner_text().strip()
            match = re.search(r"([\d,]+)", text)
            if match:
                price = int(match.group(1).replace(",", ""))
                if price > 0:
                    return price

    # 優先順位3: 購入ボタン周辺から価格を探す
    button_selectors = [
        "button.a-button span",
        "button[class*='button'] span",
        ".a-button__inner span",
        "[class*='price']",
    ]
    for selector in button_selectors:
        elements = page.query_selector_all(selector)
        for el in elements:
            text = el.inner_text().strip()
            match = re.search(r"¥([\d,]+)", text)
            if match:
                price = int(match.group(1).replace(",", ""))
                if price > 0:
                    return price

    # 優先順位4: ページ全体から価格キーワード付きの¥を探す
    price_keywords = ["返金可", "購入", "買う", "この記事は"]
    all_elements = page.query_selector_all("p, div, span, button")
    for el in all_elements:
        try:
            text = el.inner_text().strip()
            has_keyword = any(kw in text for kw in price_keywords)
            if has_keyword:
                match = re.search(r"¥([\d,]+)", text)
                if match:
                    price = int(match.group(1).replace(",", ""))
                    if price > 0:
                        return price
        except Exception:
            continue

    return 0


def extract_tags(page) -> str:
    """タグを抽出（カンマ区切りの文字列で返す）"""
    tags = []

    # noteのタグセレクタ（複数パターンに対応）
    selectors = [
        ".m-tagList__item a",
        ".o-noteHashtag a",
        'a[href*="/hashtag/"]',
        ".note-hashtag",
        "[class*='hashtag'] a",
    ]

    for selector in selectors:
        elements = page.query_selector_all(selector)
        if elements:
            for el in elements:
                tag_text = el.inner_text().strip()
                # #を除去
                tag_text = tag_text.lstrip("#")
                if tag_text and tag_text not in tags:
                    tags.append(tag_text)
            if tags:
                break  # 最初にマッチしたセレクタのタグを使用

    return ",".join(tags)


def extract_created_at(page) -> str:
    meta = page.query_selector('meta[property="article:published_time"]')
    if meta:
        content = meta.get_attribute("content") or ""
        if content:
            return content
    time_el = page.query_selector("time")
    if time_el:
        datetime_value = time_el.get_attribute("datetime")
        if datetime_value:
            return datetime_value
        text = time_el.inner_text().strip()
        if text:
            return text
    return ""


def extract_high_rating(page) -> int:
    """高評価数を抽出（購入者のみが付けられる）"""
    selectors = [
        ".m-contentRaters__label",
        "[class*='contentRaters'] button",
        "[class*='Raters']",
    ]
    for selector in selectors:
        el = page.query_selector(selector)
        if el:
            text = el.inner_text().strip()
            match = re.search(r"(\d+)人が高評価", text)
            if match:
                return int(match.group(1))
    return 0


def extract_sales_claim(page) -> str:
    """販売主張テキストを検索（本文中の「○部完売」など）"""
    body_text = page.evaluate("() => document.body.innerText")
    patterns = [
        r"\d+部完売",
        r"\d+部販売",
        r"\d+部突破",
        r"\d+部売れ",
        r"\d+部達成",
        r"\d+冊完売",
        r"\d+冊販売",
        r"\d+冊突破",
    ]
    for pattern in patterns:
        if re.search(pattern, body_text):
            return "○"
    return ""


def detect_purchased_24h(page, timeout_ms: int) -> bool:
    try:
        page.wait_for_selector(PURCHASED_SELECTOR, timeout=timeout_ms, state="attached")
        return True
    except PlaywrightTimeoutError:
        return False


def send_to_gas(url: str, payload: Dict) -> Dict:
    if not url:
        raise RuntimeError("GAS_WEB_APP_URL is not set")
    response = requests.post(url, json=payload, timeout=15)
    response.raise_for_status()
    try:
        return response.json()
    except json.JSONDecodeError:
        return {"success": False, "error": "Invalid JSON response"}


def scrape_article(page, url: str, timeout_ms: int, max_retries: int) -> Dict:
    last_error: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            page.goto(url, wait_until="domcontentloaded")
            purchased_24h = detect_purchased_24h(page, timeout_ms)
            title = extract_title(page)
            author = extract_author(page)
            author_url = extract_author_url(page)
            likes = extract_like_count(page)
            high_rating = extract_high_rating(page)
            price = extract_price(page)
            tags = extract_tags(page)
            created_at = extract_created_at(page)
            sales_claim = extract_sales_claim(page)

            # note-sales-tracker Chrome拡張と同じ形式
            payload = {
                "url": url,
                "title": title,
                "author": author,
                "authorUrl": author_url,
                "likes": likes,
                "highRating": high_rating,
                "price": price,
                "tags": tags,
                "createdAt": created_at,
                "salesClaim": sales_claim,
                "hasSalesInfo": purchased_24h,
                "salesMessage": "買われています 過去24時間" if purchased_24h else None,
                "purchased24h": purchased_24h,
                "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            return payload
        except Exception as exc:
            last_error = exc
            time.sleep(1)
    raise RuntimeError(f"Failed to scrape {url}: {last_error}")


def run(config_path: str = "config.yaml", keywords_override: Optional[List[str]] = None) -> None:
    load_dotenv()
    gas_url = os.getenv("GAS_WEB_APP_URL", "").strip()

    config = load_config(config_path)
    if not config.keywords:
        raise RuntimeError("keywords is empty in config.yaml")

    # キーワードが外部から指定されている場合はそれを使用
    day_names_ja = ["月", "火", "水", "木", "金", "土", "日"]
    day_name_ja = day_names_ja[datetime.now().weekday()]

    if keywords_override:
        keywords = keywords_override
        print(f"[manual] {len(keywords)} keywords specified: {', '.join(keywords)}")
    else:
        keywords = get_keywords_for_today(config.keywords, config.split_days)
        if not keywords:
            print("[skip] No keywords for today")
            return

        day_name = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][datetime.now().weekday()]
        print(f"[split] {day_name}: {len(keywords)}/{len(config.keywords)} keywords (split_days={config.split_days})")

    if config.dry_run:
        print("[mode] DRY RUN - GAS will be skipped")

    # 統計情報
    start_time = time.time()
    total_records = 0
    new_records = 0
    error_count = 0

    # 開始通知
    if not config.dry_run:
        notify_start(len(keywords), day_name_ja, len(config.keywords))

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=config.headless)
            # Bot検出回避のための設定
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                locale="ja-JP",
                timezone_id="Asia/Tokyo",
            )
            search_page = context.new_page()
            article_page = context.new_page()

            for keyword in keywords:
                urls = collect_article_urls(
                    search_page,
                    keyword,
                    config.results_per_keyword,
                    config.between_pages_ms,
                )
                print(f"[search] keyword='{keyword}' urls={len(urls)}")

                for idx, url in enumerate(urls, start=1):
                    print(f"[article] {idx}/{len(urls)} {url}")
                    try:
                        payload = scrape_article(
                            article_page,
                            url,
                            config.article_wait_ms,
                            config.max_retries,
                        )
                        if config.dry_run:
                            purchased_mark = "[24h]" if payload.get("purchased24h") else ""
                            title = payload.get('title', '')[:40].encode('ascii', 'replace').decode('ascii')
                            author = payload.get('author', '').encode('ascii', 'replace').decode('ascii')
                            hr = payload.get('highRating', 0)
                            hr_mark = f" HR:{hr}" if hr > 0 else ""
                            sc_mark = " [claim]" if payload.get('salesClaim') else ""
                            tags = payload.get('tags', '').encode('ascii', 'replace').decode('ascii')[:30]
                            tags_mark = f" [{tags}]" if tags else ""
                            print(f"[dry] {purchased_mark}{sc_mark} {title} by {author} {payload.get('price', 0)}yen{hr_mark}{tags_mark}")
                            total_records += 1
                        else:
                            result = send_to_gas(gas_url, payload)
                            print(f"[gas] {result}")
                            total_records += 1
                            if result.get("isUpdate") is False:
                                new_records += 1
                    except Exception as e:
                        print(f"[error] Skipping {url}: {e}")
                        error_count += 1
                    rand_sleep(config.between_articles_ms)

            browser.close()

        # 完了通知
        elapsed_minutes = (time.time() - start_time) / 60
        if not config.dry_run:
            notify_complete(len(keywords), total_records, new_records, error_count, elapsed_minutes)

    except Exception as e:
        # 重大エラー通知
        if not config.dry_run:
            notify_critical(str(e))
        raise


if __name__ == "__main__":
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"
    run(config_path)
