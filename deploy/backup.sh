#!/bin/sh
# 每天备份一次存档卷。由服务器上的 cron 调用（/etc/cron.d/5ele-backup），保留最近 30 天。
set -e
DIR=/root/5ele-backups
mkdir -p "$DIR"
docker run --rm -v 5ele_5ele-data:/data:ro -v "$DIR":/backup alpine \
  tar czf "/backup/5ele-daily-$(date +%Y%m%d).tgz" -C /data .
find "$DIR" -name '5ele-daily-*.tgz' -mtime +30 -delete
echo "$(date '+%F %T') ok $(ls -la "$DIR/5ele-daily-$(date +%Y%m%d).tgz" | awk '{print $5}') bytes"
