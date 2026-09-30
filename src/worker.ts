interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TELEGRAM_BOT_TOKEN?: string;
  FOOTBALL_CHAT_ID?: string;
  R55_URL?: string;
  SENDER_DISABLED?: string;
  BOT_TEST_MODE?: string;
  TICK_SECRET?: string;
}

const BUILD = "R55_WEBFLOW_FREE_V1";
const FOOTER = `
━━━━━━━━━━━━━━
* Bán tool Phân tích dự đoán XSMB, MT , MN
* tool Phân tích, dự đoán kèo bóng đá, chọn xiên 6,8,10 trận.
* Sử dụng link trên ĐT dễ dàng - nhanh chóng - hiệu quả
* Vào nhóm kèo bóng : https://t.me/keochuyengia79
hoặc nhóm Xổ Số : https://t.me/xsbm999
Tool sử dụng Free 5 ngày tại @muatool_du_doan_bot ( dự đoán sớm)`;

let fallbackLastSentMs = 0;
const fallbackSent = new Map<string, number>();

function str(v: unknown, fallback = "") {
  const s = String(v ?? "").trim();
  return s || fallback;
}
function cleanNumber(value: unknown) {
  const x = Number(value);
  if (!Number.isFinite(x)) return String(value ?? "");
  return Number.isInteger(x) ? String(x) : String(x).replace(/0+$/, "").replace(/\.$/, "");
}
function ahLine(value: unknown) {
  const x = Number(value);
  if (!Number.isFinite(x)) return String(value ?? "");
  if (x === 0) return "0 (đồng banh)";
  return x > 0 ? `+${cleanNumber(x)}` : cleanNumber(x);
}
function ahTeam(p: any) {
  if (p?.ah?.pick === "Home") return p.home;
  if (p?.ah?.pick === "Away") return p.away;
  return p?.ah?.pick || "";
}
function kickoffVN(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const o: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") o[p.type] = p.value;
  return `${o.hour}:${o.minute} ${o.day}-${o.month} giờ VN`;
}
function matchKey(p: any) {
  return String(p?.id || `${p?.date}|${p?.home}|${p?.away}`);
}
function makeMessage(p: any) {
  return `⚽ ${p.home} - ${p.away}
🏆 ${p.league || "Bóng đá"}
⏰ ${kickoffVN(p.date)}

🔸 KÈO CHÂU Á
${ahTeam(p)} • ${ahLine(p.ah.line)}
${p.ah.books || 0} nhà cái

🔹 TÀI / XỈU
${p.ou.pick} ${cleanNumber(p.ou.line)}
${p.ou.books || 0} nhà cái

${FOOTER}`;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-tick-secret",
    },
  });
}

async function fetchR55(env: Env) {
  const url = str(env.R55_URL, "https://r55-unified-runtime.floot.app/api/background");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`R55 HTTP ${r.status}`);
    const d: any = await r.json();
    if (!d || (!Array.isArray(d.predictions) && !Array.isArray(d.featuredPredictions))) {
      throw new Error("R55 không trả predictions");
    }
    return d;
  } finally {
    clearTimeout(timer);
  }
}

async function getCandidates(env: Env, now = new Date()) {
  const d: any = await fetchR55(env);
  const all = [
    ...(Array.isArray(d.predictions) ? d.predictions : []),
    ...(Array.isArray(d.featuredPredictions) ? d.featuredPredictions : []),
  ];
  const uniq = new Map<string, any>();
  const nowMs = now.getTime();
  for (const p of all) {
    if (!p?.date || !p?.home || !p?.away || !p?.ah || !p?.ou) continue;
    const t = Date.parse(p.date);
    if (!Number.isFinite(t) || t < nowMs || t > nowMs + 36 * 3600e3) continue;
    const k = matchKey(p);
    if (!uniq.has(k)) uniq.set(k, p);
  }
  return [...uniq.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

async function cacheGet(key: string) {
  try {
    const c: any = (globalThis as any).caches?.default;
    if (c) {
      const r = await c.match(new Request(`https://r55-state.invalid/${encodeURIComponent(key)}`));
      if (r) return await r.text();
    }
  } catch {}
  if (key === "football:last-sent-ms") return fallbackLastSentMs ? String(fallbackLastSentMs) : null;
  const exp = fallbackSent.get(key);
  if (exp && exp > Date.now()) return "1";
  fallbackSent.delete(key);
  return null;
}

async function cachePut(key: string, value: string, ttlSec: number) {
  try {
    const c: any = (globalThis as any).caches?.default;
    if (c) {
      const req = new Request(`https://r55-state.invalid/${encodeURIComponent(key)}`);
      const res = new Response(value, { headers: { "cache-control": `public, max-age=${ttlSec}` } });
      await c.put(req, res);
      return;
    }
  } catch {}
  if (key === "football:last-sent-ms") fallbackLastSentMs = Number(value) || Date.now();
  else fallbackSent.set(key, Date.now() + ttlSec * 1000);
}

async function nextUnsent(env: Env, now = new Date()) {
  const last = Number((await cacheGet("football:last-sent-ms")) || 0);
  if (last && now.getTime() - last < 60 * 60 * 1000) return null;
  const due = [];
  for (const p of await getCandidates(env, now)) {
    const minutes = (Date.parse(p.date) - now.getTime()) / 60000;
    if (minutes < 18 || minutes > 22) continue;
    if (await cacheGet(`sent:${matchKey(p)}`)) continue;
    due.push(p);
  }
  due.sort(
    (a, b) =>
      Math.abs((Date.parse(a.date) - now.getTime()) / 60000 - 20) -
      Math.abs((Date.parse(b.date) - now.getTime()) / 60000 - 20),
  );
  return due[0] || null;
}

async function sendTelegram(env: Env, text: string) {
  if (env.SENDER_DISABLED === "1") throw new Error("SENDER_DISABLED");
  const chatId = str(env.FOOTBALL_CHAT_ID, "-1002315121695");
  if (env.BOT_TEST_MODE === "1") return { ok: true, result: { message_id: 123456 }, mock: true };
  const token = str(env.TELEGRAM_BOT_TOKEN);
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const j: any = await r.json();
  if (!j.ok) throw new Error(j.description || `Telegram HTTP ${r.status}`);
  return j;
}

async function sendNext(env: Env, now = new Date()) {
  const p = await nextUnsent(env, now);
  if (!p) {
    return {
      ok: true,
      sent: 0,
      reason: "Chưa có trận trong cửa sổ 18–22 phút hoặc chưa đủ 60 phút từ tin trước",
    };
  }
  const j: any = await sendTelegram(env, makeMessage(p));
  const sentAt = now.getTime();
  await cachePut(`sent:${matchKey(p)}`, new Date(sentAt).toISOString(), 3 * 24 * 3600);
  await cachePut("football:last-sent-ms", String(sentAt), 3 * 24 * 3600);
  return {
    ok: true,
    sent: 1,
    message_id: j?.result?.message_id ?? null,
    chatId: str(env.FOOTBALL_CHAT_ID, "-1002315121695"),
    match: `${p.home} - ${p.away}`,
    kickoff: p.date,
    minutesBeforeKickoff: Math.round((Date.parse(p.date) - sentAt) / 60000),
  };
}

function authorized(request: Request, env: Env) {
  const secret = str(env.TICK_SECRET);
  if (!secret) return true;
  const h = str(request.headers.get("x-tick-secret"));
  const auth = str(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  return h === secret || auth === secret;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}).headers });

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        build: BUILD,
        runtime: "webflow-cloud-free",
        tokenConfigured: Boolean(str(env.TELEGRAM_BOT_TOKEN)),
        tickSecretConfigured: Boolean(str(env.TICK_SECRET)),
        senderDisabled: env.SENDER_DISABLED === "1",
        botTestMode: env.BOT_TEST_MODE === "1",
        footballChatId: str(env.FOOTBALL_CHAT_ID, "-1002315121695"),
        r55: str(env.R55_URL, "https://r55-unified-runtime.floot.app/api/background"),
        schedule: "18–22 phút trước trận; tối đa 1 tin mỗi 60 phút",
      });
    }

    if (request.method === "GET" && path === "/preview") {
      try {
        const candidates = await getCandidates(env);
        const next = await nextUnsent(env);
        return json({
          ok: true,
          totalFutureCandidates: candidates.length,
          next: next
            ? {
                home: next.home,
                away: next.away,
                league: next.league,
                date: next.date,
                ah: `${ahTeam(next)} ${ahLine(next.ah.line)}`,
                ou: `${next.ou.pick} ${cleanNumber(next.ou.line)}`,
              }
            : null,
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 502);
      }
    }

    if ((request.method === "POST" || request.method === "GET") && (path === "/tick" || path === "/send-next")) {
      if (!authorized(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
      try {
        return json(await sendNext(env));
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
