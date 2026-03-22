#!/bin/bash

STATE=".last_success"
RETRY=".need_retry"

# 如果没有记录，初始化为 5 天前（确保第一次会执行）
if [ ! -f "$STATE" ]; then
    date -d "5 days ago" +%s > $STATE
fi

LAST=$(cat $STATE)
NOW=$(date +%s)
DIFF=$(( (NOW - LAST) / 86400 ))

echo "Last success: $DIFF days ago"

if [ $DIFF -ge 4 ]; then
    echo "It's time to run the task."

    if xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node action_renew.js; then
        echo "Task succeeded."
        date +%s > $STATE
        rm -f "$RETRY"
    else
        echo "Task failed. Marking for retry."
        touch "$RETRY"
    fi
else
    echo "Not time yet. No action."
fi
