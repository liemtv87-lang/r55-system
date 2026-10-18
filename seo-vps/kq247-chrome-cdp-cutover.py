#!/usr/bin/env python3
"""Reconfigure ONLY the dedicated SEO Chromium container for private CDP.

Never print environment, cookies, profile paths, or browser tabs. On failed
health checks restore the original container intact. Do not modify other
KQ247 containers, snapshot stores, or published URLs.
"""
import json
import os
import pathlib
import subprocess
import tempfile
import time

NAME = "kq247-seo-google-login"
STAGING = NAME + "-cdp-20261018"
BACKUP = NAME + "-rollback-20261018"

def run(*args, check=True):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=check)

def docker(*args, check=True):
    return run("docker", *args, check=check)

def inspect(name):
    r = docker("inspect", name)
    return json.loads(r.stdout)[0]

def exists(name):
    return docker("inspect", name, check=False).returncode == 0

def health():
    # Test from INSIDE container: no listening CDP port is published to host.
    for _ in range(30):
        r = docker("exec", NAME, "sh", "-c",
                   "wget -q -T 2 -O /dev/null http://127.0.0.1:9222/json/version",
                   check=False)
        if r.returncode == 0:
            return True
        time.sleep(2)
    return False

def main():
    if exists(STAGING) or exists(BACKUP):
        raise SystemExit("Existing staging/rollback container; inspect manually, no changes.")
    old = inspect(NAME)
    if not old["State"]["Running"]:
        raise SystemExit("Browser was not running; avoid unexpected cutover.")
    conf = old["Config"]
    host = old["HostConfig"]
    mounts = old.get("Mounts", [])
    confmount = next((m for m in mounts if m["Destination"] == "/config"
                      and m["Type"] == "bind" and m["RW"]), None)
    if not confmount or len(mounts) != 1:
        raise SystemExit("Unexpected browser mounts; leaving original untouched.")
    if conf["Image"] != "jlesage/chromium:latest":
        raise SystemExit("Unexpected image; leaving original untouched.")
    if host["NetworkMode"] != "football-staging_default":
        raise SystemExit("Unexpected network; leaving original untouched.")
    if host.get("PortBindings") not in ({}, None):
        raise SystemExit("Browser has published ports: preserve manually, no cutover.")
    image_id = old["Image"]
    env_lines = list(conf.get("Env", []))
    replaced = {}
    for entry in env_lines:
        key, sep, val = entry.partition("=")
        if sep:
            replaced[key] = val
    replaced["CHROMIUM_REMOTE_DEBUGGING"] = "1"
    replaced["CHROMIUM_REMOTE_DEBUGGING_PORT"] = "9222"
    custom = replaced.get("CHROMIUM_CUSTOM_ARGS", "")
    flag = "--remote-debugging-address=127.0.0.1"
    if flag not in custom:
        replaced["CHROMIUM_CUSTOM_ARGS"] = (custom + " " + flag).strip()
    args = [
        "docker", "create", "--name", NAME,
        "--network", host["NetworkMode"],
        "--restart", host["RestartPolicy"]["Name"],
        "--mount", "type=bind,src=" + confmount["Source"] + ",dst=/config",
    ]
    if host.get("ShmSize"):
        args += ["--shm-size", str(host["ShmSize"])]
    if host.get("Memory"):
        args += ["--memory", str(host["Memory"])]
    if host.get("CpuQuota") and host.get("CpuPeriod") and host["CpuQuota"] > 0:
        args += ["--cpu-period", str(host["CpuPeriod"]),
                 "--cpu-quota", str(host["CpuQuota"])]
    if host.get("Privileged"):
        args.append("--privileged")
    for cap in host.get("CapAdd") or []:
        args += ["--cap-add", cap]
    for option in host.get("SecurityOpt") or []:
        args += ["--security-opt", option]
    changed = False
    with tempfile.NamedTemporaryFile(mode="w", prefix="kq247-chrome-env-",
                                     dir="/root", delete=False) as f:
        env_path = pathlib.Path(f.name)
        os.chmod(env_path, 0o600)
        for key, val in replaced.items():
            f.write(key + "=" + val.replace("\n", "") + "\n")
    try:
        args += ["--env-file", str(env_path), image_id]
        # Check original process + image before any disruption.
        docker("image", "inspect", image_id)
        docker("stop", "--time", "15", NAME)
        changed = True
        docker("rename", NAME, BACKUP)
        try:
            result = run(*args)
            if result.returncode != 0:
                raise RuntimeError("docker_create_failed")
            docker("start", NAME)
            if not health():
                raise RuntimeError("cdp_health_failed")
            # Check transport exposure from host: no Docker port publishing.
            new = inspect(NAME)
            if new["HostConfig"].get("PortBindings") not in ({}, None):
                raise RuntimeError("unexpected_published_port")
            print("SEO_CHROME_CDP_READY=YES")
            print("PROFILE_PERSISTED=YES")
            print("CDP_PUBLIC_DOCKER_PORTS=NONE")
            # Keep stopped original as rollback artifact until separate QA.
            print("ROLLBACK_CONTAINER_RESERVED=YES")
        except Exception:
            docker("stop", "--time", "10", NAME, check=False)
            docker("rm", "--force", NAME, check=False)
            docker("rename", BACKUP, NAME, check=False)
            docker("start", NAME, check=False)
            raise
    finally:
        env_path.unlink(missing_ok=True)

if __name__ == "__main__":
    main()
