#!/usr/bin/env python3
"""
トラッキングチェッカー実行スクリプト
毎日19:00にcronで実行
"""
from src.tracker import run_tracker

if __name__ == '__main__':
    run_tracker()
