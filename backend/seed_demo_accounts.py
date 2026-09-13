"""
Seed / reset demo account passwords in the database.
Usage:
    python seed_demo_accounts.py
"""
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from app.seed import seed, DEMO_ACCOUNTS

if __name__ == "__main__":
    seed()
