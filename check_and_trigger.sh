#!/bin/bash

STATE=".last_success"
RETRY=".need_retry"

echo "=== Katabump Renew Task ==="

if [ -f "$STATE" ]; then
    LAST=$(cat "$STATE")
else
    LAST=0
fi

NOW=$(date +%s)
DIFF=$(( (NOW - LAST) / 86400 ))

echo "上次成功续期: $LAST"
echo "距离上次成功天数: $DIFF 天"

if [ $DIFF -lt 4 ] && [ ! -f "$RETRY" ]; then
    echo "未到续期周期，跳过执行。"
    exit 0
fi

echo "开始执行续期任务..."

RESULT=$(xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node action_renew.js)

echo "$RESULT"

# 更稳健判断（只看最后输出）
if echo "$RESULT" | tail -n 20 | grep -q '"success":true'; then
    echo "真正续期成功！"
    date +%s > "$STATE"
    rm -f "$RETRY"
else
    echo "未续期成功（可能还没到时间）"
    touch "$RETRY"
fi

echo "=== 任务结束 ==="
