#!/usr/bin/env bash
set -e

PORT=8999
python3 benchmarks/server.py &
SERVER_PID=$!

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

sleep 1

echo "=========================================="
echo "NODE.JS BENCHMARK RESULTS"
echo "=========================================="
node benchmarks/benchmark_node.mjs http://127.0.0.1:$PORT

echo ""
echo "=========================================="
echo "PYTHON BENCHMARK RESULTS"
echo "=========================================="
PYTHONPATH=packages/python python3 benchmarks/benchmark_python.py http://127.0.0.1:$PORT
