#!/bin/bash

STATE=".last_success"
RETRY=".need_retry"

echo "=== Katabump Daily Check ==="

# 读取上次成功时间（归一化后的 0 点时间戳）
if [ -f "$STATE" ]; then
    LAST=$(cat "$STATE")
else
    LAST=0
fi

NOW=$(date +%s)
DIFF_SEC=$((NOW - LAST))
THRESHOLD=$((4 * 86400))

echo "上次成功续期（0 点归一化）: $LAST"
echo "距离上次成功秒数: $DIFF_SEC"

# 未到 4 天且没有 retry 标记 → 跳过
if [ $DIFF_SEC -lt $THRESHOLD ] && [ ! -f "$RETRY" ]; then
    echo "未到续期周期，跳过执行。"
    exit 0
fi

echo "开始执行续期任务..."

RESULT=$(xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node action_renew.js)

echo "$RESULT"

# 判断是否真正续期成功
if echo "$RESULT" | grep -q '"success":true'; then
    echo "真正续期成功！"

    # 归一化到当天 0 点
    TODAY_ZERO=$(( NOW / 86400 * 86400 ))
    echo $TODAY_ZERO > "$STATE"

    rm -f "$RETRY"
else
    echo "未续期成功（可能还没到时间）"
    touch "$RETRY"
fi

echo "=== 主任务结束 ==="