# KQ247 R55 staging on VinaHost

Staging proxy for verification; NOT a migrated standalone R55 backend. It currently relays to Hatchable, which remains the source of truth for snapshot, app, codes and APIs. Never cut over customer DNS or disable Hatchable based solely on this proxy.

Deploy from GitHub Actions. Test on VPS localhost 127.0.0.1:18080 /_kq247/health and /api/health. Do not expose administrative endpoints or public port until secrets, authentication and reverse-proxy ACL are verified.
