#!/bin/bash

echo "DEBUG: SCRIPT PATH=$(realpath "$0")"

# === 状态文件放在仓库目录（可被 GitHub Actions cache 持久化） ===
STATE="./.katabump_last_success"
RETRY="./.katabump_need_retry"

echo "DEBUG: USING STATE=$STATE"
echo "DEBUG: USING RETRY=$RETRY"

echo "=== Katabump Retry Check ==="

# 如果没有 retry 标记，直接退出
if [ ! -f "$RETRY" ]; then
    echo "无 retry 标记，跳过。"
    exit 0
fi

echo "检测到 retry 标记，开始补救续期..."

RESULT=$(xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node action_renew.js)

echo "$RESULT"

# 更稳健的 success 判断
if echo "$RESULT" | grep -qi '"success"[[:space:]]*:[[:space:]]*true'; then
    echo "补救续期成功！"

    NOW=$(date +%s)
    TODAY_ZERO=$(( NOW / 86400 * 86400 ))

    echo "DEBUG: TODAY_ZERO=$TODAY_ZERO"
    echo "DEBUG: STATE FILE PATH=$(realpath "$STATE")"

    echo $TODAY_ZERO > "$STATE"

    echo "DEBUG: Written content:"
    cat "$STATE"

    rm -f "$RETRY"
else
    echo "补救续期仍然失败，保留 retry 标记。"
fi

echo "=== 补救任务结束 ==="
