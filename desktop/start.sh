#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null; then
  echo "Install Node.js 20+ first."
  exit 1
fi

if ! nc -z 127.0.0.1 27017 >/dev/null 2>&1; then
  echo "MongoDB is not running on this computer."
  echo "Start mongod, then run this again."
  exit 1
fi

npm install --prefix backend
npm install --prefix frontend

node desktop/launch.cjs
