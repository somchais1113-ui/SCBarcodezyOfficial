#!/bin/bash
cd "$(dirname "$0")" || exit 1
for candidate in python3.11 python3.12 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys;sys.exit(sys.version_info[:2] not in ((3,11),(3,12)))'; then
    "$candidate" deep-analysis/launch_local.py
    status=$?
    if [ "$status" -ne 0 ]; then read -r -p 'Press Return to close... '; fi
    exit "$status"
  fi
done
printf '%s\n' 'Install Python 3.11 or 3.12 from https://www.python.org/downloads/ and reopen this file.'
read -r -p 'Press Return to close... '
exit 1
