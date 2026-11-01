#!/bin/sh
# Revive contract: bring the preview server back if it is down.
cd /workspace || exit 1
if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
  exit 0
fi
nohup npm run dev > /tmp/narrow-seam-dev.log 2>&1 &
exit 0
