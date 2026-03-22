#!/bin/bash

STATE=".last_success"
RETRY=".need_retry"

echo "Running renew task..."

# 执行 action_renew.js 并捕获输出
RESULT=$(xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node action_renew.js)

echo "$RESULT"

# 判断是否真正续期成功
if echo "$RESULT" | grep -q '"success":true'; then
    echo "真正续期成功！"
    date +%s > "$STATE"
    rm -f "$RETRY"
else
    echo "未续期成功（可能还没到时间）"
    touch "$RETRY"
fi
