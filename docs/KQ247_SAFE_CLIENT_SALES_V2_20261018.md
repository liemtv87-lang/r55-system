# VPS health and frontend integration probe
```text
CHECKED_UTC=2026-10-18T16:34:55Z
WEB_HOST_ROUTE_MAP:
unknown => reverse_proxy kq247-customer-auth-fixed-20261018:3039
unknown => reverse_proxy kq247-sales-bot-primary:3032
unknown => reverse_proxy kq247-xs-v112-stats-live:3004
unknown => reverse_proxy kq247-xs-v112-stats-live:3004
vietlott.64-120-92-172.sslip.io => reverse_proxy kq247-vietlott-r34-production-20261018:8080
seo-login.64-120-92-172.sslip.io => reverse_proxy https://kq247-seo-google-login:5800 {
FRONTEND_AUDIT:
PAGE 18088 / len 68184 markers {'R33': 3, 'R34': 8, '/api/state': 1, 'snapshot': 46, '34 điều kiện': 1, 'đăng nhập': 0}
PAGE 18088 /client.html len 9444 markers {'R33': 0, 'R34': 0, '/api/state': 0, 'snapshot': 1, '34 điều kiện': 0, 'đăng nhập': 0}
PAGE_ERROR 18088 /guest-snapshot.html HTTPError
PAGE 18153 / len 63303 markers {'R33': 0, 'R34': 27, '/api/state': 1, 'snapshot': 49, '34 điều kiện': 2, 'đăng nhập': 0}
PAGE 18153 /client.html len 9375 markers {'R33': 0, 'R34': 0, '/api/state': 0, 'snapshot': 2, '34 điều kiện': 0, 'đăng nhập': 0}
PAGE 18153 /guest-snapshot.html len 63213 markers {'R33': 0, 'R34': 27, '/api/state': 1, 'snapshot': 49, '34 điều kiện': 2, 'đăng nhập': 0}
SALES_BOT_AND_AUTH_READONLY_WEB_CHECK:
CONTAINER kq247-sales-bot-primary running True network_count 1
PROBE kq247-sales-bot-primary /health error_type HTTPError
PROBE kq247-sales-bot-primary / error_type HTTPError
CONTAINER kq247-customer-auth-fixed-20261018 running True network_count 1
PROBE kq247-customer-auth-fixed-20261018 /health error_type HTTPError
PROBE kq247-customer-auth-fixed-20261018 / error_type HTTPError
CONTAINER kq247-sales-vps running True network_count 1
PROBE kq247-sales-vps /health error_type HTTPError
PROBE kq247-sales-vps / error_type HTTPError
BOT_LAST_250_LOG_ERROR_CATEGORY_COUNTS:
kq247-sales-bot-primary
{'error': 5, 'failed': 4, '409 conflict': 0, 'timeout': 0, 'database': 0, 'payment': 0, 'rate limit': 0}
kq247-customer-auth-fixed-20261018
{'error': 0, 'failed': 0, '409 conflict': 0, 'timeout': 0, 'database': 0, 'payment': 0, 'rate limit': 0}
kq247-lottery-bot
{'error': 0, 'failed': 0, '409 conflict': 0, 'timeout': 0, 'database': 0, 'payment': 0, 'rate limit': 0}
kq247-r55-group-bot
{'error': 0, 'failed': 0, '409 conflict': 0, 'timeout': 0, 'database': 0, 'payment': 0, 'rate limit': 0}
R34_READONLY_SOURCE_FILES:
/app/scripts/update-data.mjs
/app/vietlott-vps-server.mjs
AUTH_PUBLIC_HOST_IDENTIFICATION:
CADDY 2 (r55routes) {
CADDY 7 handle /_kq247/cache-health {
CADDY 9 reverse_proxy football-cache:3000
CADDY 11 handle /_kq247/native-health {
CADDY 13 reverse_proxy football-native:3001
CADDY 15 handle_path /api/customer-auth/* {
CADDY 16 reverse_proxy kq247-customer-auth-fixed-20261018:3039
CADDY 22 handle @payos_callback {
CADDY 23 reverse_proxy kq247-sales-bot-primary:3032
CADDY 28 @original_main {
CADDY 32 handle /api/main-football {
CADDY 33 route {
CADDY 34 reverse_proxy @original_main football-original:3002
CADDY 35 reverse_proxy football-native:3001
AUTH_UPSTREAM_LINE 16
VIETLOTT_CLIENT_API_ORIGIN https://64-120-92-172.sslip.io/api/customer-auth/
READ_ONLY_PROBES_DONE
```
