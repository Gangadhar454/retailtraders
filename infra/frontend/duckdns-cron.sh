#!/bin/bash
# Pings DuckDNS every run to keep retailtraders.duckdns.org pointed at this Frontend VM's public IP.
# Usage:
#   Add to crontab: */5 * * * * /opt/netpnl/duckdns-cron.sh >> /var/log/duckdns.log 2>&1

DUCKDNS_DOMAIN="retailtraders"
DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-REPLACE_WITH_YOUR_DUCKDNS_TOKEN}"

if [ -z "$DUCKDNS_TOKEN" ] || [ "$DUCKDNS_TOKEN" = "REPLACE_WITH_YOUR_DUCKDNS_TOKEN" ]; then
    echo "$(date): Error: DUCKDNS_TOKEN is not configured."
    exit 1
fi

RESPONSE=$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")
echo "$(date): DuckDNS update for ${DUCKDNS_DOMAIN}.duckdns.org: ${RESPONSE}"
