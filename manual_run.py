#!/usr/bin/env python3
"""
手動実行用スクリプト - キーワードを直接指定して処理

使い方:
  python manual_run.py config.yaml メイク 転職 キャリア
  python manual_run.py config.yaml 占い タロット 星座
"""
import sys
from src.main import run

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python manual_run.py <config.yaml> <keyword1> [keyword2] [keyword3] ...")
        print("\nExample:")
        print("  python manual_run.py config.yaml メイク 転職 キャリア")
        sys.exit(1)

    config_path = sys.argv[1]
    specified_keywords = sys.argv[2:]

    # 指定されたキーワードで実行
    run(config_path, keywords_override=specified_keywords)
