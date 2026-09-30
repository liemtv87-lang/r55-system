const el = document.querySelector("#status");
fetch("./health", { cache: "no-store" })
  .then(async (r) => {
    const j = await r.json();
    if (!el) return;
    el.textContent = j?.ok
      ? `✅ Runtime OK • build ${j.build} • token ${j.tokenConfigured ? "đã cấu hình" : "chưa cấu hình"}`
      : `❌ Health lỗi: ${j?.error || r.status}`;
  })
  .catch((e) => {
    if (el) el.textContent = `❌ Không gọi được /health: ${e?.message || e}`;
  });
