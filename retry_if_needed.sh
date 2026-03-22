#!/bin/bash

STATE=".last_success"
RETRY=".need_retry"

if [ -f "$RETRY" ]; then
    echo "Retrying task..."

    if xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node action_renew.js; then
        echo "Retry succeeded."
        date +%s > $STATE
        rm -f "$RETRY"
    else
        echo "Retry failed. Will try again in 4 hours."
    fi
else
    echo "No retry needed."
fi
