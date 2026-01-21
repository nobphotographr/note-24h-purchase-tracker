import json
import os
import random
import re
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import requests
import yaml
from dotenv import load_dotenv
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

SEARCH_URL_TEMPLATE = "https://note.com/search?q={keyword}"
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


def collect_article_urls(page, keyword: str, limit: int, between_pages_ms: Tuple[int, int]) -> List[str]:
    search_url = SEARCH_URL_TEMPLATE.format(keyword=keyword)
    print(f"[search] {search_url}")
    page.goto(search_url, wait_until="domcontentloaded")
    time.sleep(1)

    collected: List[str] = []
    stagnant_rounds = 0

    while len(collected) < limit and stagnant_rounds < 3:
        current = extract_article_urls(page)
        before = len(collected)
        for url in current:
            if url not in collected:
                collected.append(url)
            if len(collected) >= limit:
                break

        if len(collected) == before:
            stagnant_rounds += 1
        else:
            stagnant_rounds = 0

        page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
        rand_sleep(between_pages_ms)

    return collected[:limit]


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
    selectors = [
        ".o-noteContentHeader__price",
        ".p-article__price",
        "[class*='ContentHeader'] [class*='price']",
    ]
    for selector in selectors:
        el = page.query_selector(selector)
        if el:
            text = el.inner_text().strip()
            if re.search(r"¥\s*0\s*[〜~]", text):
                return 0
            return parse_int(text)
    return 0


def extract_tags(page) -> str:
    tags = page.eval_on_selector_all(
        "a[href*='/tags/']",
        """
        (elements) => elements.map(e => e.textContent.trim()).filter(Boolean)
        """,
    )
    if not tags:
        return ""
    deduped = list(dict.fromkeys(tags))
    return ", ".join(deduped)


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
            price = extract_price(page)
            tags = extract_tags(page)
            created_at = extract_created_at(page)

            payload = {
                "url": url,
                "title": title,
                "author": author,
                "authorUrl": author_url,
                "likes": likes,
                "highRating": 0,
                "price": price,
                "tags": tags,
                "createdAt": created_at,
                "salesClaim": "",
                "hasSalesInfo": purchased_24h,
                "salesMessage": "買われています 過去24時間" if purchased_24h else "",
                "purchased24h": purchased_24h,
                "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            return payload
        except Exception as exc:
            last_error = exc
            time.sleep(1)
    raise RuntimeError(f"Failed to scrape {url}: {last_error}")


def run() -> None:
    load_dotenv()
    gas_url = os.getenv("GAS_WEB_APP_URL", "").strip()

    config = load_config("config.yaml")
    if not config.keywords:
        raise RuntimeError("keywords is empty in config.yaml")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=config.headless)
        context = browser.new_context()
        search_page = context.new_page()
        article_page = context.new_page()

        for keyword in config.keywords:
            urls = collect_article_urls(
                search_page,
                keyword,
                config.results_per_keyword,
                config.between_pages_ms,
            )
            print(f"[search] keyword='{keyword}' urls={len(urls)}")

            for idx, url in enumerate(urls, start=1):
                print(f"[article] {idx}/{len(urls)} {url}")
                payload = scrape_article(
                    article_page,
                    url,
                    config.article_wait_ms,
                    config.max_retries,
                )
                result = send_to_gas(gas_url, payload)
                print(f"[gas] {result}")
                rand_sleep(config.between_articles_ms)

        browser.close()


if __name__ == "__main__":
    run()
