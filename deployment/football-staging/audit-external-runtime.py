#!/usr/bin/env python3
"""Read-only audit of active KQ247 VPS containers and their runtime dependencies.

Runs *on* VPS with Docker access. Never prints environment values, secrets,
client codes, DSNs, IP addresses, passwords or database contents.
"""
import json
import re
import subprocess
import sys
from urllib.parse import urlsplit

ALLOWED_DB_HOSTS = {
    "football-db", "kq247-r55-postgres", "localhost", "127.0.0.1",
    "postgres", "db", "host.docker.internal"
}
DB_KEYS = ("DATABASE_URL", "DB_URL", "POSTGRES_URL", "SALES_DATABASE_URL", "AUTH_DATABASE_URL")
EXTERNAL_DB_MARKERS = (
    "NEON", "SUPABASE", "RAILWAY_DATABASE", "RENDER_DATABASE",
    "PLANETSCALE", "MONGODB_ATLAS"
)
EXTERNAL_EXECUTION_MARKERS = ("RENDER_SERVICE_ID", "RAILWAY_SERVICE_ID", "NEON_API_URL")
EXPECTED_SERVICES = (
    "kq247-r55-postgres", "kq247-football-original",
    "kq247-r55-group-bot", "kq247-sales-bot-primary",
    "kq247-customer-auth-fixed-20261018"
)

def docker(*args):
    p = subprocess.run(["docker", *args], capture_output=True, text=True,
                       check=False, timeout=30)
    if p.returncode:
        raise RuntimeError("docker_audit_command_failed")
    return p.stdout

def main():
    all_names = set(docker("ps", "--all", "--format", "{{.Names}}").splitlines())
    names = sorted(x for x in all_names if x.startswith("kq247-"))
    violations = []
    for required in EXPECTED_SERVICES:
        if required not in all_names:
            violations.append({"service": required, "check": "required_container_absent"})
    if not names:
        raise RuntimeError("no_kq247_containers_found")
    # Output no variables or values, only categories of risky configuration.
    for name in names:
        info = json.loads(docker("inspect", name))[0]
        if not info.get("State", {}).get("Running"):
            continue
        values = info.get("Config", {}).get("Env", []) or []
        env = dict(v.split("=", 1) for v in values if "=" in v)
        for key, value in env.items():
            upper = key.upper()
            if not value.strip():
                continue
            if any(tag in upper for tag in EXTERNAL_DB_MARKERS):
                violations.append({"service": name, "check": "external_database_config"})
            if upper in EXTERNAL_EXECUTION_MARKERS:
                violations.append({"service": name, "check": "external_execution_config"})
            if any(upper == k or upper.endswith("_"+k) for k in DB_KEYS):
                try:
                    host = (urlsplit(value).hostname or "").lower()
                except ValueError:
                    host = ""
                if host not in ALLOWED_DB_HOSTS:
                    violations.append({"service": name, "check": "database_host_not_local"})
        # The dedicated group bot must never fall back to lottery token.
        if name == "kq247-r55-group-bot":
            if env.get("R55_VPS_GROUP_BOT_ACTIVE") == "1" and not env.get("R55_GROUP_BOT_TOKEN"):
                violations.append({"service": name, "check": "football_group_token_missing"})
    print("KQ247_ACTIVE_CONTAINER_COUNT", sum(
        1 for name in names if json.loads(docker("inspect", name))[0].get("State", {}).get("Running")
    ))
    if violations:
        seen = set()
        for entry in violations:
            key = (entry["service"], entry["check"])
            if key not in seen:
                print("BLOCK", json.dumps(entry, ensure_ascii=False))
                seen.add(key)
        print("EXTERNAL_RUNTIME_AUDIT_NOT_READY")
        return 2
    print("EXTERNAL_RUNTIME_ENV_AUDIT_PASS")
    print("NOTE: this validates configuration only; still verify deployed code, host DNS, snapshots, license parity, other systemd workers, and external SaaS URLs")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        print("BLOCK", type(exc).__name__)
        sys.exit(2)
