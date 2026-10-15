#!/usr/bin/env bash
# Install a dedicated non-root GitHub Actions runner; no existing service restarts.
set -Eeuo pipefail
umask 077
repo="https://github.com/liemtv87-lang/vietlott-auto-hoc"
user="kq247ci"
name="kq247-vps-vietlott"
label="kq247-vietlott-ci"
dir="/opt/kq247/ci/vietlott-runner"
fail(){ echo "KQ247_RUNNER_SETUP_ERROR=$1" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || fail "RUN_AS_ROOT_VPS_TERMINAL"
[[ "$(uname -s)" == "Linux" ]] || fail "LINUX_ONLY"
[[ -t 0 && -t 1 ]] || fail "INTERACTIVE_TERMINAL_REQUIRED"
for bin in curl python3 sha256sum tar runuser systemctl useradd df; do
  command -v "$bin" >/dev/null || fail "MISSING_$bin"
done
case "$(uname -m)" in
 x86_64) asset="actions-runner-linux-x64-" ;;
 aarch64|arm64) asset="actions-runner-linux-arm64-" ;;
 *) fail "CPU_ARCH_UNSUPPORTED" ;;
esac
if [[ -e "$dir/.runner" ]]; then
 echo "KQ247_RUNNER_ALREADY_REGISTERED=YES"
 exit 0
fi
if ! id "$user" >/dev/null 2>&1; then
 useradd --create-home --user-group --shell /bin/bash "$user"
fi
for forbidden in docker sudo wheel; do
 if id -nG "$user" | tr ' ' '\n' | grep -qx "$forbidden"; then
   fail "RUNNER_USER_HAS_PRIVILEGED_GROUP_$forbidden"
 fi
done
install -d -m 0755 /opt/kq247 /opt/kq247/ci
install -d -o "$user" -g "$user" -m 0700 "$dir"
free="$(df -Pm "$dir" | awk 'NR==2{print $4}')"
[[ "$free" =~ ^[0-9]+$ ]] || fail "DISK_MEASURE_FAILED"
(( free >= 2048 )) || fail "AT_LEAST_2GB_FREE_SPACE_NEEDED"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 2 --connect-timeout 15 --max-time 60 \
 "https://api.github.com/repos/actions/runner/releases/latest" -o "$tmp/release.json"
python3 - "$tmp/release.json" "$asset" > "$tmp/asset.txt" <<'PY'
import json,sys
release=json.load(open(sys.argv[1]))
assets=[a for a in release.get('assets',[])
 if a.get('name','').startswith(sys.argv[2]) and a.get('name','').endswith('.tar.gz')]
if len(assets)!=1: raise SystemExit('Runner tarball not uniquely available')
a=assets[0]
digest=a.get('digest') or ''
if not digest.startswith('sha256:') or len(digest)!=71:
 raise SystemExit('Official GitHub checksum not available; abort')
url=a['browser_download_url']
if not url.startswith('https://github.com/actions/runner/releases/download/'):
 raise SystemExit('Unexpected source domain')
print(url)
print(digest[7:])
PY
url="$(sed -n '1p' "$tmp/asset.txt")"
sha="$(sed -n '2p' "$tmp/asset.txt")"
curl -fsSL --retry 2 --connect-timeout 15 --max-time 240 "$url" -o "$tmp/runner.tgz"
printf '%s  %s\n' "$sha" "$tmp/runner.tgz" | sha256sum --check --status ||
 fail "OFFICIAL_SHA256_CHECK_FAILED"
echo "KQ247_RUNNER_OFFICIAL_SHA256=PASS"
tar -xzf "$tmp/runner.tgz" -C "$dir" --no-same-owner
chown -R "$user:$user" "$dir"
echo "Mở github.com/liemtv87-lang/vietlott-auto-hoc/settings/actions/runners"
echo "Chọn New self-hosted runner, Linux. Dán mã đăng ký một lần vào đây (không hiện trên màn hình):"
read -r -s -p "GitHub runner registration token: " token
echo
[[ -n "$token" ]] || fail "MISSING_GITHUB_RUNNER_TOKEN"
runuser -u "$user" -- "$dir/config.sh" --unattended \
 --url "$repo" --token "$token" --name "$name" \
 --labels "$label" --work "_work" --replace ||
 fail "GITHUB_RUNNER_REGISTRATION_FAILED"
unset token
cd "$dir"
./svc.sh install "$user"
./svc.sh start
echo "KQ247_VIETLOTT_RUNNER_INSTALLED=YES"
echo "KQ247_VIETLOTT_RUNNER_LABEL=$label"
echo "KQ247_EXISTING_CONTAINERS_CHANGED=NO"
