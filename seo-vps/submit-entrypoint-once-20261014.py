#!/usr/bin/env python3
"""One-time read-only audit of *submission routes*, not sitemap pages.
No forms posted, no accounts registered, no production services modified.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import importlib.util
import json

source = Path(__file__).with_name("bulk-sitemap-audit.py")
spec = importlib.util.spec_from_file_location("bulk_sitemap_audit", source)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def audit(base):
    try:
        return mod.audit_submit_entries(base)
    except Exception as exc:
        return {"domain": base, "candidates": [], "error": type(exc).__name__+":"+str(exc)[:160]}

def main():
    domains = sorted(set(mod.DOMAINS) | set(mod.SUBMIT_ROUTES))
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(audit, domains))
    forms = []
    no_form = []
    blocked = []
    for row in rows:
        for r in row.get("candidates", []):
            record = {"domain": row["domain"], **r}
            if r.get("status") == "http_200":
                (forms if r.get("forms", 0) else no_form).append(record)
            else:
                blocked.append(record)
    report = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "read_only_public_submission_endpoint_audit",
        "domains_checked": len(domains),
        "entrypoints_checked": len(forms)+len(no_form)+len(blocked),
        "http_200_form_pages": forms,
        "http_200_without_form": no_form,
        "unavailable_or_blocked": blocked,
        "domain_details": rows,
        "submissions_attempted": 0,
        "published_backlinks_claimed": 0,
        "notice": "A visible HTML form is only a candidate, not proof registration or approval is allowed; validate terms/captcha/login before any one-time submission."
    }
    Path("reports").mkdir(exist_ok=True)
    Path("reports/kq247-submission-entrypoints-20261014.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf8"
    )
    print("KQ247_ENTRYPOINT_AUDIT=" + json.dumps({
        "domains": len(domains), "tested": report["entrypoints_checked"],
        "form_pages": len(forms), "non_forms": len(no_form),
        "blocked": len(blocked), "potential_form_pages": forms[:30],
        "submissions": 0}, ensure_ascii=False), flush=True)
if __name__ == "__main__":
    main()
