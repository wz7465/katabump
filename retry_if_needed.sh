#!/bin/bash

STATE=".last_success"
RETRY=".need_retry"

echo "=== Katabump Retry Check ==="

# 如果没有 retry 标记，直接退出
if [ ! -f "$RETRY" ]; then
    echo "无 retry 标记，跳过。"
    exit 0
fi

echo "检测到 retry 标记，开始补救续期..."

RESULT=$(xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node action_renew.js)

echo "$RESULT"

if echo "$RESULT" | grep -q '"success":true'; then
    echo "补救续期成功！"

    NOW=$(date +%s)
    TODAY_ZERO=$(( NOW / 86400 * 86400 ))
    echo $TODAY_ZERO > "$STATE"

    rm -f "$RETRY"
else
    echo "补救续期仍然失败，保留 retry 标记。"
fi

echo "=== 补救任务结束 ==="