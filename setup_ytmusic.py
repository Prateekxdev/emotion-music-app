"""Create a local YouTube Music browser.json credential file safely.

Run this once from the project directory. Paste request headers into the
interactive prompt when asked; do not save those headers in source code.
"""

from ytmusicapi import setup


if __name__ == "__main__":
    setup(filepath="browser.json")
