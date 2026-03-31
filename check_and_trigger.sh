#!/bin/bash

echo "DEBUG: SCRIPT PATH=$(realpath "$0")"

# === 状态文件放在仓库目录（可被 GitHub Actions cache 持久化） ===
STATE="$GITHUB_WORKSPACE/.katabump_last_success"
RETRY="$GITHUB_WORKSPACE/.katabump_need_retry"

echo "DEBUG: USING STATE=$STATE"
echo "DEBUG: USING RETRY=$RETRY"

echo "=== Katabump Daily Check ==="

# 读取上次成功时间
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

# 更稳健的 success 判断
if echo "$RESULT" | grep -qi '"success"[[:space:]]*:[[:space:]]*true'; then
    echo "真正续期成功！"

    TODAY_ZERO=$(( NOW / 86400 * 86400 ))

    echo "DEBUG: TODAY_ZERO=$TODAY_ZERO"
    echo "DEBUG: STATE FILE PATH=$(realpath "$STATE")"

    echo $TODAY_ZERO > "$STATE"

    echo "DEBUG: Written content:"
    cat "$STATE"

    rm -f "$RETRY"
else
    echo "未续期成功（可能还没到时间）"
    touch "$RETRY"
fi

echo "=== 主任务结束 ==="
