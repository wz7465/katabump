name: Katabump Auto Renew

on:
  schedule:
    - cron: '0 0 * * *'        # 每天检查是否到达 4 天周期
    - cron: '0 */4 * * *'      # 当天失败时每 4 小时重试
  workflow_dispatch:

# 🔒 加锁：避免 daily check 和 retry 并发运行
concurrency:
  group: renew-lock
  cancel-in-progress: false

jobs:
  renew:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    # 恢复状态文件（使用 restore-keys 匹配最新版本）
    - name: Restore state cache
      uses: actions/cache@v4
      with:
        path: |
          .last_success
          .need_retry
        key: renew-state-${{ github.run_id }}
        restore-keys: |
          renew-state-

    - name: Make scripts executable
      run: chmod +x *.sh

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Install Dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y xvfb
        npm install
        npx playwright install-deps chrome

    - name: Run Check or Retry
      env:
        USERS_JSON: ${{ secrets.USERS_JSON }}
        HTTP_PROXY: ${{ secrets.HTTP_PROXY }}
        TG_BOT_TOKEN: ${{ secrets.TG_BOT_TOKEN }}
        TG_CHAT_ID: ${{ secrets.TG_CHAT_ID }}
      run: |
        if [ "${{ github.event.schedule }}" = "0 0 * * *" ]; then
          echo "Running daily check..."
          ./check_and_trigger.sh
        else
          echo "Running retry..."
          ./retry_if_needed.sh
        fi

    # 保存状态文件（每次运行都会生成新的 cache）
    - name: Save state cache
      uses: actions/cache@v4
      with:
        path: |
          .last_success
          .need_retry
        key: renew-state-${{ github.run_id }}

    - name: Upload Screenshots
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: screenshots
        path: screenshots/
