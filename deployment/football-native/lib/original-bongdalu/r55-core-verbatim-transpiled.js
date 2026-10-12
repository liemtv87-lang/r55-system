// Direct TypeScript transpilation of upstream football-all-refresh-v3 v128.
// No scoring method rewritten. Original sources preserved alongside this module.
// SDK binding is required only for legacy caching functions, which are not called by the Bongdalu-exclusive adapter.
import {db} from "hatchable";
function today() { return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); }
function startUtc(d) { const [y, m, x] = d.split("-").map(Number); return Date.UTC(y, m - 1, x) - 7 * 3600000; }
function cutoff1930Utc(d) { const [y, m, x] = d.split("-").map(Number); return Date.UTC(y, m - 1, x, 19, 30) - 7 * 3600000; }
function bongWindowStartUtc(d) { return startUtc(d) + 11 * 3600000; }
function bongWindowEndUtc(d) { return startUtc(d) + 36 * 3600000 + 5 * 60000; }
function footballCycleDate11() { const x = new Date(Date.now() + 7 * 3600000), d = x.toISOString().slice(0, 10); return x.getUTCHours() >= 11 ? d : addDay(d, -1); }
function compact(d) { return d.replace(/-/g, ""); }
function ts14(v) { const s = String(v || ""); return /^\d{14}$/.test(s) ? Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)) : NaN; }
function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\b(fc|cf|afc|sc|ac|women|wfc)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function key(a, b) { return [norm(a), norm(b)].sort().join("|"); }
function tiny(c, l, h, a) { const x = (c + " " + l + " " + h + " " + a).toLowerCase(); return /\b(u17|u18|u19|u20|u21|u23|youth|academy|reserve|reserves|development)\b|friendl/.test(x) || /\b(ii|iii|b)\s*$/.test(h.toLowerCase()) || /\b(ii|iii|b)\s*$/.test(a.toLowerCase()); }
const FIFA_RANK_VERSION = "MEN_2026-07-20__WOMEN_2026-06-16";
const FIFA_MEN_TOP100 = [
    "Spain", "Argentina", "France", "England", "Brazil", "Morocco", "Portugal", "Belgium", "Netherlands", "Mexico", "Colombia", "Germany", "Croatia", "Switzerland", "Italy", "USA", "Japan", "Senegal", "Norway", "Uruguay", "Denmark", "Iran", "Austria", "Egypt", "Ecuador", "Nigeria", "Turkey", "Australia", "Algeria", "Canada", "Ivory Coast", "South Korea", "Ukraine", "Paraguay", "Russia", "Poland", "Sweden", "Wales", "Hungary", "Serbia", "Congo DR", "Scotland", "Cameroon", "Panama", "Slovakia", "Greece", "Venezuela", "Czech Republic", "Chile", "Peru", "Costa Rica", "Romania", "Mali", "South Africa", "Ireland", "Slovenia", "Tunisia", "Saudi Arabia", "Qatar", "Uzbekistan", "Bosnia & Herzegovina", "Burkina Faso", "Iraq", "Cabo Verde", "Ghana", "Honduras", "Albania", "UAE", "North Macedonia", "Northern Ireland", "Jamaica", "Georgia", "Jordan", "Iceland", "Finland", "Israel", "Bolivia", "Kosovo", "Oman", "Montenegro", "Guinea", "Curacao", "Syria", "Gabon", "Bulgaria", "New Zealand", "Angola", "Haiti", "Uganda", "Zambia", "China", "Bahrain", "Benin", "Thailand", "Palestine", "Belarus", "Guatemala", "Luxembourg", "Vietnam", "El Salvador"
];
const FIFA_WOMEN_TOP30 = ["Spain", "USA", "Germany", "England", "Japan", "France", "Brazil", "Sweden", "Canada", "Netherlands", "Korea DPR", "Denmark", "Italy", "Norway", "Australia", "China", "Iceland", "Belgium", "South Korea", "Colombia", "Ireland", "Portugal", "Austria", "Finland", "Scotland", "Switzerland", "Russia", "Mexico", "Poland", "Argentina"];
function rankKey(v) {
    let s = norm(v).replace(/\b(national team|women|woman|w|nu|neutral|n)\b/g, " ").replace(/\s+/g, " ").trim();
    const A = { "united states": "usa", "united states of america": "usa", "u s a": "usa", "turkiye": "turkey", "cote d ivoire": "ivory coast", "korea republic": "south korea", "republic of korea": "south korea", "korea south": "south korea", "democratic republic of the congo": "congo dr", "dr congo": "congo dr", "d r congo": "congo dr", "congo kinshasa": "congo dr", "czechia": "czech republic", "czech rep": "czech republic", "bosnia and herzegovina": "bosnia herzegovina", "bosnia & herzegovina": "bosnia herzegovina", "cape verde": "cabo verde", "united arab emirates": "uae", "u a e": "uae", "viet nam": "vietnam", "china pr": "china", "pr china": "china", "north korea": "korea dpr", "dpr korea": "korea dpr", "korea north": "korea dpr",
        "tay ban nha": "spain", "anh": "england", "duc": "germany", "phap": "france", "y": "italy", "bo dao nha": "portugal", "ha lan": "netherlands", "bi": "belgium", "thuy si": "switzerland",
        "my": "usa", "hoa ky": "usa", "nhat ban": "japan", "han quoc": "south korea", "trieu tien": "korea dpr", "na uy": "norway", "dan mach": "denmark", "ao": "austria", "ai cap": "egypt",
        "tho nhi ky": "turkey", "uc": "australia", "bo bien nga": "ivory coast", "ba lan": "poland", "thuy dien": "sweden", "xu wales": "wales", "hy lap": "greece", "cong hoa sec": "czech republic",
        "nam phi": "south africa", "a rap saudi": "saudi arabia", "bac macedonia": "north macedonia", "bac ireland": "northern ireland", "phan lan": "finland", "trung quoc": "china",
        "nga": "russia", "new zealand": "new zealand", "viet nam": "vietnam", "cong hoa dan chu congo": "congo dr", "congo dan chu": "congo dr" };
    return A[s] || s;
}
const FIFA_MEN_MAP = new Map(FIFA_MEN_TOP100.map((x, i) => [rankKey(x), i + 1]));
const FIFA_WOMEN_MAP = new Map(FIFA_WOMEN_TOP30.map((x, i) => [rankKey(x), i + 1]));
function fifaRank(v, women = false) { return Number((women ? FIFA_WOMEN_MAP : FIFA_MEN_MAP).get(rankKey(v)) || 0); }
function isWomenMatch(c, l, h, a) {
    const z = String(c || "") + " " + String(l || "") + " " + String(h || "") + " " + String(a || "");
    const q = z.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return /\b(women|woman|female|feminine|femenina|feminino|w league|wsl|nu)\b/.test(q) || /^nu\b/.test(q) || /\b(w|women)\s*$/.test(String(h || "").toLowerCase()) || /\b(w|women)\s*$/.test(String(a || "").toLowerCase());
}
function bigMatchInfo(x) {
    const c = norm(x?.country || ""), l = String(x?.league || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "), h = String(x?.home || ""), a = String(x?.away || ""), z = c + " " + l + " " + norm(h) + " " + norm(a);
    const women = isWomenMatch(c, l, h, a), limit = women ? 30 : 100, secondaryLimit = women ? 30 : 50;
    if (/\b(u17|u18|u19|u20|u21|u23|youth|academy|reserve|reserves|development|amateur|regional|provincial|promesas|promises|promise)\b/.test(z) || /\b(ii|iii|b)\s*$/.test(h.toLowerCase()) || /\b(ii|iii|b)\s*$/.test(a.toLowerCase()))
        return { priority: 0, class: "excluded", women, fifa_rank_version: FIFA_RANK_VERSION };
    const hr = fifaRank(h, women), ar = fifaRank(a, women), cr = fifaRank(x?.country, women);
    const fallbackH = Number(x?.rankings?.home || 0), fallbackA = Number(x?.rankings?.away || 0);
    const rh = hr || (fallbackH >= 1 && fallbackH <= limit ? fallbackH : 0), ra = ar || (fallbackA >= 1 && fallbackA <= limit ? fallbackA : 0);
    const friendly = /\bfriendly\b/.test(z);
    const nationalMajor = /\b(world cup|world championship|euro|european championship|copa america|nations league|afcon|africa cup of nations|asian cup|gold cup|concacaf nations|ofc nations|world cup qual|euro qual|afcon qual|asian cup qual|copa america qual)\b/.test(z);
    if (friendly) {
        if (!(rh >= 1 && rh <= limit && ra >= 1 && ra <= limit))
            return { priority: 0, class: "friendly_rank_out", women, home_rank: rh || null, away_rank: ra || null, fifa_rank_version: FIFA_RANK_VERSION };
        return { priority: +(300 - Math.min(60, Math.max(rh, ra) * .25)).toFixed(2), class: "international_friendly_top_ranked", women, home_rank: rh, away_rank: ra, fifa_rank_version: FIFA_RANK_VERSION };
    }
    if (nationalMajor) {
        if (!(rh >= 1 && rh <= limit && ra >= 1 && ra <= limit))
            return { priority: 0, class: "national_rank_out", women, home_rank: rh || null, away_rank: ra || null, fifa_rank_version: FIFA_RANK_VERSION };
        const p = 460 - Math.min(80, Math.max(rh, ra) * .35);
        return { priority: +p.toFixed(2), class: "world_or_continental_national", women, home_rank: rh, away_rank: ra, fifa_rank_version: FIFA_RANK_VERSION };
    }
    const nationalFriendly = /\b(international friendly|friendly international|international friendlies|friendlies)\b/.test(z);
    if (nationalFriendly) {
        if (!(rh >= 1 && rh <= limit && ra >= 1 && ra <= limit))
            return { priority: 0, class: "friendly_rank_out", women, home_rank: rh || null, away_rank: ra || null, fifa_rank_version: FIFA_RANK_VERSION };
        const p = 320 - Math.min(55, Math.max(rh, ra) * .20);
        return { priority: +p.toFixed(2), class: "ranked_national_friendly", women, home_rank: rh, away_rank: ra, fifa_rank_version: FIFA_RANK_VERSION };
    }
    const continentalClub = /\b(club world cup|champions league|libertadores|sudamericana|europa league|conference league|afc champions|caf champions|concacaf champions|concacaf champions cup|recopa|continental cup)\b/.test(l + " " + c);
    if (continentalClub) {
        if (women && cr > 0 && cr > 30)
            return { priority: 0, class: "women_country_rank_out", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
        if (!women && cr > 100)
            return { priority: 0, class: "country_rank_out", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
        if (women && cr === 0)
            return { priority: 0, class: "women_country_unverified", women, country_rank: null, fifa_rank_version: FIFA_RANK_VERSION };
        const p = 420 + (cr ? Math.max(0, (limit - cr) / 20) : 0);
        return { priority: +p.toFixed(2), class: "world_or_continental_club", women, country_rank: cr || null, fifa_rank_version: FIFA_RANK_VERSION };
    }
    if (!(cr >= 1 && cr <= limit))
        return { priority: 0, class: "country_rank_out", women, country_rank: cr || null, fifa_rank_version: FIFA_RANK_VERSION };
    const minorCup = /\b(super cup|supercopa|supercoppa|community shield|promesas|promise|regional cup|state cup|reserve cup|youth cup)\b/.test(l);
    const domesticCup = !minorCup && /\b(cup|copa|pokal|coupe|taca|taça|beker|coppa|fa cup|king cup|emperor cup)\b/.test(l);
    const lower3 = (/\b(liga 3|serie c|serie d|3 bundesliga|third division|division 3|league one|league two|national league|promotion league|primera federacion|primera feder|segunda federacion|segunda feder|fourth|4th|3rd)\b/.test(l) || (/\bleague 1\b/.test(l) && rankKey(x?.country || "") === "england")) && !/\bligue 1\b/.test(l);
    if (lower3)
        return { priority: 0, class: "lower_than_second", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
    const secondTier = /\b(championship|challenge league|liga 2|la liga 2|segunda division|segunda liga|serie b|2 bundesliga|bundesliga 2|ligue 2|j2 league|k league 2|second division|division 2|primera b|segunda)\b/.test(l) || (rankKey(x?.country || "") === "norway" && /\bdivision 1 women\b/.test(l));
    if (domesticCup || secondTier) {
        if (cr > secondaryLimit)
            return { priority: 0, class: "second_or_cup_rank_out", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
        const p = 240 + (secondaryLimit - cr) / 10 + (domesticCup ? 3 : 0);
        return { priority: +p.toFixed(2), class: domesticCup ? "national_cup" : "second_division", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
    }
    const countryKey = rankKey(x?.country || "");
    const englishNonTop = countryKey === "england" && /\b(southern premier|northern premier|isthmian|ryman|southern league|northern league|national league|national league north|national league south|premier division|division one|southern league central|southern league division one|northern league division one)\b/.test(l);
    if (englishNonTop)
        return { priority: 0, class: "lower_than_second", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
    const topLeague = /\b(premier league|premiership|primera division|primera a|categoria primera a|liga profesional|liga mx|laliga|bundesliga|serie a|ligue 1|eredivisie|primeira liga|super lig|super league|superliga|pro league|first division|1 liga|liga i|ekstraklasa|eliteserien|allsvenskan|mls|major league soccer|j1 league|k league 1|a league|brasileirao|brasileiro serie a|division profesional|premier division|toppserien|damallsvenskan|frauen bundesliga|liga f|premiere ligue|division 1 feminine|nwsl|we league|women s league of argentina|women's league of argentina)\b/.test(l);
    if (!topLeague)
        return { priority: 0, class: "domestic_tier_unverified", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
    const p = 340 + (limit - cr) / 20;
    return { priority: +p.toFixed(2), class: "top_domestic_league", women, country_rank: cr, fifa_rank_version: FIFA_RANK_VERSION };
}
function mainTier(c0, l0, h0 = "", a0 = "") {
    const q = bigMatchInfo({ country: c0, league: l0, home: h0, away: a0 });
    if (q.priority >= 440)
        return 100;
    if (q.priority >= 400)
        return 98;
    if (q.priority >= 300)
        return 94;
    if (q.priority >= 200)
        return 88;
    return 0;
}
function rank(c, l, m) {
    const mt = mainTier(c, l);
    const mc = m && typeof m === "object" ? Object.values(m).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0) : 0;
    return Math.min(100, (mt || 40) + Math.min(5, Number(mc)));
}
function slug(c, l) {
    const x = c + "|" + l;
    const M = {
        "England|Premier League": "eng.1", "England|Championship": "eng.2", "England|League 1": "eng.3", "England|League 2": "eng.4", "England|National League": "eng.5",
        "Spain|LaLiga": "esp.1", "Spain|LaLiga 2": "esp.2", "Germany|Bundesliga": "ger.1", "Germany|2. Bundesliga": "ger.2", "Italy|Serie A": "ita.1", "Italy|Serie B": "ita.2",
        "France|Ligue 1": "fra.1", "France|Ligue 2": "fra.2", "Netherlands|Eredivisie": "ned.1", "Netherlands|Eerste Divisie": "ned.2", "Portugal|Primeira Liga": "por.1",
        "USA|MLS": "usa.1", "Mexico|Liga MX: Apertura": "mex.1", "Japan|J1 League": "jpn.1", "Japan|J2 League": "jpn.2", "South Korea|K League 1": "kor.1"
    };
    if (M[x])
        return M[x];
    const cl = c + " " + l;
    if (/UEFA Women's Nations League/i.test(cl))
        return "uefa.w.nations";
    if (/UEFA Nations League/i.test(cl))
        return "uefa.nations";
    if (/Champions League/i.test(l))
        return "uefa.champions";
    if (/Europa League$/i.test(l))
        return "uefa.europa";
    if (/Conference League/i.test(l))
        return "uefa.europa.conf";
    if (/Libertadores/i.test(l))
        return "conmebol.libertadores";
    if (/Sudamericana/i.test(l))
        return "conmebol.sudamericana";
    return "";
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function quarter(n) { return Math.round(n * 4) / 4; }
function line(v) { return Math.abs(v) < .001 ? "0" : (v > 0 ? "+" : "") + String(v); }
function exp(m, h, a, l) { const lg = Number(l?.games || 0), base = clamp(lg ? Number(l.goals || 0) / lg : Number(l?.ema_total_goals || 2.5), 1.6, 4.2), hg = Number(h?.home_games || 0), ag = Number(a?.away_games || 0), hgf = hg >= 3 ? Number(h.home_gf || 0) / hg : Number(h?.ema_gf || base / 2), hga = hg >= 3 ? Number(h.home_ga || 0) / hg : Number(h?.ema_ga || base / 2), agf = ag >= 3 ? Number(a.away_gf || 0) / ag : Number(a?.ema_gf || base / 2), aga = ag >= 3 ? Number(a.away_ga || 0) / ag : Number(a?.ema_ga || base / 2), xh = clamp((hgf + aga) / 2 * 1.06, .3, 3.6), xa = clamp((agf + hga) / 2 * .94, .25, 3.4); return { xh, xa, total: xh + xa, diff: xh - xa, base, g: Math.min(Number(h?.games || 0), Number(a?.games || 0)) }; }
function model(m, h, a, l) { const e = exp(m, h, a, l), home = e.diff >= 0, mag = clamp(quarter(Math.abs(e.diff)), 0, 2.5), ou = clamp(quarter(e.base), 1.5, 4), over = e.total >= ou, hist = Math.min(1, e.g / 12); return { id: m.live_id, ts: m.ts, home: m.home, away: m.away, country: m.country, league: m.league, provider: "R55 model", source_count: 2, bookmaker_count: 0, bookmaker_names: [], quality_score: Math.round(clamp(m.rank * .75 + 18 + hist * 7, 35, 96)), model: { xg_home: +e.xh.toFixed(2), xg_away: +e.xa.toFixed(2), history_games: e.g }, ah: { pick: home ? m.home : m.away, line: line(mag ? -mag : 0), price: "", signal_score: Math.round(clamp(51 + Math.abs(e.diff) * 10 + hist * 8, 51, 78)) }, ou: { pick: over ? "Over" : "Under", line: (over ? "o" : "u") + ou, price: "", signal_score: Math.round(clamp(51 + Math.abs(e.total - ou) * 12 + hist * 8, 51, 78)) } }; }
function num(v) { const z = String(v ?? "").match(/-?\d+(?:\.\d+)?/); return z ? Number(z[0]) : 0; }
function numish(v) { return String(v ?? "").trim() !== ""; }
function dataQuality(x) {
    const hist = Math.max(0, Number(x?.model?.history_games || 0)), sources = Math.max(0, Number(x?.source_count || 0)), books = Math.max(0, Number(x?.bookmaker_count || 0)), h2h = Math.max(0, Number(x?.model?.h2h_games || 0));
    const market = String(x?.provider || "").toLowerCase() !== "r55 model" && numish(x?.ah?.line) && numish(x?.ou?.line) && numish(x?.ah?.price) && numish(x?.ou?.price);
    return Math.round(clamp(Math.min(42, hist * 2.1) + Math.min(18, sources * 4) + Math.min(18, books * 6) + (market ? 14 : 0) + Math.min(8, h2h), 0, 100));
}
function confidence(x) {
    const a = Number(x?.ah?.signal_score || 50), o = Number(x?.ou?.signal_score || 50), hist = Math.max(0, Number(x?.model?.history_games || 0)), books = Math.max(0, Number(x?.bookmaker_count || 0));
    const r = x?.market_risk || {};
    let penalty = 0;
    if (r.deep_handicap)
        penalty += 3;
    if (r.high_total)
        penalty += 2;
    if (r.double_fade)
        penalty += 7;
    if (r.bookmaker_disagreement)
        penalty += 6;
    const base = Math.min(a, o) + Math.min(5, Math.max(0, hist - 8) * .25) + Math.min(4, Math.max(0, books - 1) * 1.5) - penalty;
    return Math.round(clamp(base, 45, 94));
}
function analysisReadiness(x) {
    const eh = x?.external_history || {}, hn = Number(eh?.home?.n || 0), an = Number(eh?.away?.n || 0);
    const han = Number(eh?.home_asian?.closing?.n || eh?.home_asian?.opening?.n || 0);
    const aan = Number(eh?.away_asian?.closing?.n || eh?.away_asian?.opening?.n || 0);
    const hist = Number(x?.model?.history_games || 0), books = Number(x?.bookmaker_count || 0);
    const ready = x?.history_pending !== true && hist >= 16 && hn >= 16 && an >= 16 && han >= 12 && aan >= 12 && books >= 2 && dataQuality(x) >= 75;
    return { ready, hist, home_n: hn, away_n: an, home_asian_n: han, away_asian_n: aan, bookmakers: books };
}
function trustFlags(x) {
    const market = String(x?.provider || "").toLowerCase() !== "r55 model" && numish(x?.ah?.line) && numish(x?.ou?.line) && numish(x?.ah?.price) && numish(x?.ou?.price);
    const ar = analysisReadiness(x), r = x?.market_risk || {}, base = market && ar.ready && Number(x?.source_count || 0) >= 3;
    const ahDeepDog = Number(r?.deep_underdog_selected || 0) === 1, books = Number(x?.bookmaker_count || 0), ahEv = Math.abs(Number(r?.ah_evidence || 0)), ouEv = Math.abs(Number(r?.ou_evidence || 0));
    const deepOk = !ahDeepDog || (books >= 3 && ahEv >= .30), highOuOk = !r.high_total || (books >= 3 && ouEv >= .18), doubleAhOk = !r.double_fade || ahEv >= .35, doubleOuOk = !r.double_fade || ouEv >= .28;
    const low175Ok = !(r?.low_total_175?.over_blocked === true);
    return {
        ah_trusted: base && Number(x?.ah?.signal_score || 0) >= 68 && !r.bookmaker_disagreement && deepOk && doubleAhOk,
        ou_trusted: base && Number(x?.ou?.signal_score || 0) >= 68 && !r.bookmaker_disagreement && highOuOk && doubleOuOk && low175Ok
    };
}
function trusted(x) { const f = trustFlags(x); return f.ah_trusted && f.ou_trusted; }
function sideReleaseScore(x, side) {
    const ar = analysisReadiness(x), r = x?.market_risk || {}, sig = Number(x?.[side]?.signal_score || 0), dq = dataQuality(x);
    const asianN = side === "ah" ? Math.min(Number(ar?.home_asian_n || 0), Number(ar?.away_asian_n || 0)) : Math.min(Number(ar?.home_asian_n || 0), Number(ar?.away_asian_n || 0));
    const ev = Math.abs(Number(side === "ah" ? r?.ah_evidence : r?.ou_evidence) || 0);
    const perf = Number(side === "ah" ? x?.performance_reference?.ah_delta : x?.performance_reference?.ou_delta) || 0;
    const learn = Number(side === "ah" ? x?.learning_adjustment?.ah : x?.learning_adjustment?.ou) || 0;
    let s = sig * .55 +
        dq * .14 +
        Math.min(20, Number(ar?.hist || 0)) * .35 +
        Math.min(4, Number(ar?.bookmakers || 0)) * 1.7 +
        Math.min(20, asianN) * .22 +
        Math.min(6, Number(x?.source_count || 0)) * 1.15 +
        Math.min(.6, ev) * 9 +
        Math.max(-6, Math.min(6, perf)) * .55 +
        Math.max(-6, Math.min(6, learn)) * .45;
    if (x?.history_pending === true)
        s -= 30;
    if (r?.bookmaker_disagreement)
        s -= 8;
    if (side === "ah" && r?.deep_underdog_selected)
        s -= 5;
    if (side === "ah" && r?.deep_handicap)
        s -= 3;
    if (side === "ou" && r?.high_total)
        s -= 3;
    if (r?.double_fade)
        s -= 5;
    if (side === "ah" && r?.cross_market_conflict)
        s -= 4;
    return +s.toFixed(3);
}
function applyReleaseCoverageBand(rows, target = .78) {
    const n = rows.length, desired = Math.max(Math.ceil(n * .75), Math.min(Math.floor(n * .80), Math.round(n * target)));
    const xs = rows.map((x) => {
        const ahScore = sideReleaseScore(x, "ah"), ouScore = sideReleaseScore(x, "ou");
        const strictAh = x?.ah_release === true, strictOu = x?.ou_release === true;
        return { ...x, ah_release_score: ahScore, ou_release_score: ouScore, release_reason: strictAh || strictOu ? "STRICT_DEEP_GATE" : "HOLD",
            ah_release: strictAh, ou_release: strictOu, ah_trusted: strictAh, ou_trusted: strictOu,
            release_count: (strictAh ? 1 : 0) + (strictOu ? 1 : 0), trusted_pick: strictAh && strictOu };
    });
    let covered = xs.filter((x) => x.ah_release || x.ou_release).length;
    // Quality-first: do not promote HOLD picks merely to reach the display coverage target.
    for (const x of xs) {
        x.release_count = (x.ah_release ? 1 : 0) + (x.ou_release ? 1 : 0);
        x.trusted_pick = x.ah_release === true && x.ou_release === true;
        x.release_coverage_band = { min: .75, target: .78, max: .80 };
    }
    return { rows: xs, covered, coverage: n ? covered / n : 0, desired, total: n };
}
function enrich(x) {
    const ar = analysisReadiness(x), f = trustFlags(x), bi = bigMatchInfo(x), releaseCount = (f.ah_trusted ? 1 : 0) + (f.ou_trusted ? 1 : 0);
    return { ...x, data_quality_score: dataQuality(x), confidence_score: confidence(x), analysis_ready: ar.ready, analysis_depth: ar, ...f, ah_release: f.ah_trusted, ou_release: f.ou_trusted, release_count: releaseCount, trusted_pick: f.ah_trusted && f.ou_trusted, big_match: bi, prediction_policy: "DEEP_HISTORY_20__LOW175_CONFIRM__OU_HISTORY_GUARD__V6", release_target: { ah: 0.65, ou: 0.65, guaranteed: false } };
}
function market(e, m, h, a, l) { const c = e?.competitions?.[0], o = c?.odds?.[0]; if (!o?.pointSpread || !o?.total)
    return null; const book = String(o.provider?.displayName || "market"), hc = (c.competitors || []).find((x) => x.homeAway === "home"), ac = (c.competitors || []).find((x) => x.homeAway === "away"), ee = exp(m, h, a, l), hl = num(o.pointSpread.home?.close?.line ?? o.pointSpread.home?.open?.line), takeH = ee.diff + hl >= 0, ahx = takeH ? o.pointSpread.home : o.pointSpread.away, ol = num(o.total.over?.close?.line ?? o.total.over?.open?.line ?? o.overUnder), takeO = ee.total >= ol, oux = takeO ? o.total.over : o.total.under, hist = Math.min(1, ee.g / 12); return { id: String(e.id), ts: Date.parse(e.date), home: hc?.team?.displayName || m.home, away: ac?.team?.displayName || m.away, country: m.country, league: m.league, provider: book + " + R55", source_count: 3, bookmaker_count: 1, bookmaker_names: [book], quality_score: Math.round(clamp(m.rank + hist * 5, 45, 100)), formHome: String(hc?.form || ""), formAway: String(ac?.form || ""), model: { xg_home: +ee.xh.toFixed(2), xg_away: +ee.xa.toFixed(2), history_games: ee.g }, ah: { pick: takeH ? (hc?.team?.displayName || m.home) : (ac?.team?.displayName || m.away), line: String(ahx?.close?.line ?? ahx?.open?.line ?? ""), price: String(ahx?.close?.odds ?? ahx?.open?.odds ?? ""), signal_score: Math.round(clamp(52 + Math.abs(ee.diff + hl) * 15 + hist * 8, 52, 88)) }, ou: { pick: takeO ? "Over" : "Under", line: String(oux?.close?.line ?? oux?.open?.line ?? ""), price: String(oux?.close?.odds ?? oux?.open?.odds ?? ""), signal_score: Math.round(clamp(52 + Math.abs(ee.total - ol) * 15 + hist * 8, 52, 88)) } }; }
async function rows(t, c, ids) { const out = []; for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from(t).select("*").in(c, ids.slice(i, i + 300));
    out.push(...(data || []));
} return out; }
async function esp(s, d) { try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/" + encodeURIComponent(s) + "/scoreboard?dates=" + d + "&limit=200", { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok)
        return [];
    const j = await r.json();
    return j.events || [];
}
catch {
    return [];
} }
function addDay(s, n) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10); }
async function fetchJson(u, timeout = 12000) { try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://www.fotmob.com/" }, signal: AbortSignal.timeout(timeout) });
    if (!r.ok)
        return null;
    return await r.json();
}
catch {
    return null;
} }
async function cached(source, cacheKey, ttlMs, loader) {
    const { data } = await db.from("football_external_history_cache").select("payload,expires_at").eq("source", source).eq("cache_key", cacheKey).maybeSingle();
    if (data?.payload && Date.parse(String(data.expires_at || "")) > Date.now())
        return data.payload;
    const payload = await loader();
    if (payload) {
        await db.from("football_external_history_cache").upsert({ source, cache_key: cacheKey, payload, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttlMs).toISOString() }, { onConflict: "source,cache_key" });
    }
    return payload;
}
async function fotmobDay(date) { return await cached("fotmob-day", date, 6 * 3600000, async () => await fetchJson("https://www.fotmob.com/api/data/matches?date=" + compact(date) + "&timezone=Asia%2FHo_Chi_Minh", 18000)); }
function flattenFotmob(j) { const out = []; for (const l of (j?.leagues || []))
    for (const m of (l.matches || [])) {
        const ts = Date.parse(m?.status?.utcTime || "") || Number(m?.timeTS || 0);
        if (!m?.home?.name || !m?.away?.name || !Number.isFinite(ts))
            continue;
        out.push({ id: String(m.id), ts, home: m.home.name, away: m.away.name, home_id: String(m.home.id || ""), away_id: String(m.away.id || ""), ccode: String(l.ccode || ""), key: key(m.home.name, m.away.name) });
    } return out; }
async function fotmobTeam(id, ccode) { return await cached("fotmob-team", id, 24 * 3600000, async () => await fetchJson("https://www.fotmob.com/api/data/teams?id=" + encodeURIComponent(id) + "&ccode3=" + encodeURIComponent(ccode || "INT"), 18000)); }
async function fotmobDetail(id) { return await cached("fotmob-match", id, 4 * 3600000, async () => await fetchJson("https://www.fotmob.com/api/data/matchDetails?matchId=" + encodeURIComponent(id), 18000)); }
function teamForm(j, teamId, beforeTs) {
    const xs = (j?.fixtures?.allFixtures?.fixtures || []).filter((x) => x?.status?.finished === true && Date.parse(x?.status?.utcTime || "") < beforeTs).sort((a, b) => Date.parse(b.status.utcTime) - Date.parse(a.status.utcTime)).slice(0, 8);
    let pts = 0, gf = 0, ga = 0;
    for (const x of xs) {
        const isH = String(x?.home?.id || "") === teamId, h = Number(x?.home?.score), a = Number(x?.away?.score);
        if (!Number.isFinite(h) || !Number.isFinite(a))
            continue;
        const f = isH ? h : a, g = isH ? a : h;
        gf += f;
        ga += g;
        pts += f > g ? 3 : f === g ? 1 : 0;
    }
    const n = xs.length;
    return { n, ppg: n ? pts / n : 0, gf: n ? gf / n : 0, ga: n ? ga / n : 0 };
}
function h2hForm(j, homeId, awayId, beforeTs) {
    const xs = (j?.content?.h2h?.matches || []).filter((x) => x?.status?.finished === true && Date.parse(x?.status?.utcTime || x?.time?.utcTime || "") < beforeTs).sort((a, b) => Date.parse(b?.status?.utcTime || b?.time?.utcTime || "") - Date.parse(a?.status?.utcTime || a?.time?.utcTime || "")).slice(0, 6);
    let edge = 0, total = 0, n = 0;
    for (const x of xs) {
        const ss = String(x?.status?.scoreStr || "").match(/(\d+)\s*-\s*(\d+)/);
        if (!ss)
            continue;
        const hg = Number(ss[1]), ag = Number(ss[2]), hId = String(x?.home?.id || ""), homeIsCurrent = hId === homeId;
        const cg = homeIsCurrent ? hg : ag, og = homeIsCurrent ? ag : hg;
        edge += cg > og ? 1 : cg < og ? -1 : 0;
        total += hg + ag;
        n++;
    }
    return { n, edge: n ? edge / n : 0, total: n ? total / n : 0 };
}
async function sportsDbHistory(teamName) {
    const k = norm(teamName);
    return await cached("sportsdb-team", k, 24 * 3600000, async () => { const s = await fetchJson("https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=" + encodeURIComponent(teamName), 10000); const t = (s?.teams || [])[0]; if (!t?.idTeam)
        return null; const last = await fetchJson("https://www.thesportsdb.com/api/v1/json/123/eventslast.php?id=" + encodeURIComponent(t.idTeam), 10000); const xs = (last?.results || []).slice(0, 5); let pts = 0, gf = 0, ga = 0, n = 0; for (const e of xs) {
        const h = Number(e.intHomeScore), a = Number(e.intAwayScore);
        if (!Number.isFinite(h) || !Number.isFinite(a))
            continue;
        const isH = norm(e.strHomeTeam) === k, f = isH ? h : a, g = isH ? a : h;
        gf += f;
        ga += g;
        pts += f > g ? 3 : f === g ? 1 : 0;
        n++;
    } return { id: String(t.idTeam), n, ppg: n ? pts / n : 0, gf: n ? gf / n : 0, ga: n ? ga / n : 0 }; });
}
function htmlDecode(s) { return String(s || "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function canonTeam(s) {
    let n = norm(htmlDecode(s)).replace(/\b(club|futbol club|football club)\b/g, " ").replace(/\s+/g, " ").trim();
    const A = {
        "duc": "germany", "hy lap": "greece", "na uy": "norway", "bo dao nha": "portugal", "ha lan": "netherlands", "dan mach": "denmark", "ao": "austria", "y": "italy", "italia": "italy",
        "bi": "belgium", "phap": "france", "anh": "england", "thuy si": "switzerland", "thuy dien": "sweden", "phan lan": "finland", "ba lan": "poland",
        "cong hoa sec": "czechia", "sec": "czechia", "tho nhi ky": "turkiye", "turkey": "turkiye", "turkiye": "turkiye", "croatia": "croatia", "hungary": "hungary", "scotland": "scotland",
        "bac ireland": "northern ireland", "dao sip": "cyprus", "north ireland": "northern ireland", "ireland": "ireland", "wales": "wales", "serbia": "serbia", "kosovo": "kosovo", "israel": "israel",
        "slovakia": "slovakia", "slovenia": "slovenia", "ukraine": "ukraine", "georgia": "georgia", "romania": "romania", "bulgaria": "bulgaria", "albania": "albania", "iceland": "iceland",
        "bosnia herzegovina": "bosnia and herzegovina", "bosnia and herzegovina": "bosnia and herzegovina", "bosnia herz": "bosnia and herzegovina",
        "leon": "leon", "america": "america", "club america": "america", "cf america": "america", "club leon": "leon", "leganes": "leganes", "cd castellon": "castellon", "castellon": "castellon"
    };
    return A[n] || n;
}
function sameTeam(a, b) { const x = canonTeam(a), y = canonTeam(b); return x === y || (x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x))); }
function parseBongIndex(html, base) {
    const out = [];
    const re = /<tr id="tr1_(\d+)"([^>]*)>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = re.exec(html))) {
        const id = m[1], attrs = m[2] || "", row = m[3] || "";
        const h = htmlDecode((row.match(new RegExp('id="team1_' + id + '"[^>]*>([\\s\\S]*?)<\\/a>', 'i')) || [])[1]);
        const a = htmlDecode((row.match(new RegExp('id="team2_' + id + '"[^>]*>([\\s\\S]*?)<\\/a>', 'i')) || [])[1]);
        if (!h || !a)
            continue;
        const tm = (row.match(/data-t="(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})"/i) || [])[1] || "";
        const dm = htmlDecode((row.match(/data-match="([^"]*)"/i) || [])[1] || "");
        const oa = (attrs.match(/\bodds="([^"]*)"/i) || [])[1] || "";
        const p = oa.split(",");
        const rawAh = Number(p[2]), ou = Number(p[10]);
        out.push({ id, base, home: h, away: a, league: dm.split(",").slice(2).join(",").trim(), ts: tm ? Date.parse(tm.replace(" ", "T") + "Z") : 0,
            market: Number.isFinite(rawAh) && Number.isFinite(ou) ? { homeLine: -rawAh, awayLine: rawAh, homePrice: String(p[3] || ""), awayPrice: String(p[4] || ""), ouLine: ou, overPrice: String(p[11] || ""), underPrice: String(p[12] || "") } : null });
    }
    return out;
}
async function discoverBongdaluRoots() {
    try {
        const q = encodeURIComponent("Bongdalu h2h football");
        const r = await fetch("https://html.duckduckgo.com/html/?q=" + q, { headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(15000) });
        if (!r.ok)
            return [];
        const html = await r.text(), out = [];
        let m;
        const re = /uddg=([^&"']+)/gi;
        while ((m = re.exec(html)) && out.length < 20) {
            try {
                const u = decodeURIComponent(String(m[1] || "").replace(/&amp;/g, "&"));
                if (!/^https?:\/\//i.test(u))
                    continue;
                const x = new URL(u);
                if (!/bongdalu/i.test(x.hostname))
                    continue;
                const root = x.origin + "/";
                if (!out.includes(root))
                    out.push(root);
            }
            catch { }
        }
        return out;
    }
    catch {
        return [];
    }
}
async function validateBongRoot(root) {
    try {
        const r = await fetch(root, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(20000) });
        if (!r.ok)
            return null;
        const html = await r.text(), base = new URL(r.url).origin + "/", matches = parseBongIndex(html, base);
        if (matches.length < 20)
            return null;
        const sample = matches.find((x) => x?.id) || null;
        if (!sample)
            return null;
        const hr = await fetch(base + "match/h2h-" + encodeURIComponent(sample.id), { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(20000) });
        if (!hr.ok)
            return null;
        const hh = await hr.text();
        const h2hOk = /id=["']table_v1["']/i.test(hh) && /id=["']table_v2["']/i.test(hh) && /id=["']table_v3["']/i.test(hh);
        if (!h2hOk)
            return null;
        return { base, matches };
    }
    catch {
        return null;
    }
}
function cleanTeamName(s) {
    return htmlDecode(s).replace(/\(N\)/gi, " ").replace(/\b(FC|CF|SC|AC|CA|FK|CD|ASD|AS|AFC|Club)\b/gi, " ").replace(/\s+/g, " ").trim();
}
function teamTokens(s) {
    const stop = new Set(["fc", "cf", "sc", "ac", "ca", "fk", "cd", "asd", "as", "afc", "club", "de", "the"]);
    return canonTeam(cleanTeamName(s)).split(/\s+/).filter((x) => x && x.length > 1 && !stop.has(x));
}
function fuzzySameTeam(a, b) {
    if (sameTeam(a, b))
        return true;
    const A = teamTokens(a), B = teamTokens(b);
    if (!A.length || !B.length)
        return false;
    const sa = new Set(A), sb = new Set(B), inter = [...sa].filter(x => sb.has(x)).length;
    const den = Math.max(sa.size, sb.size);
    return inter >= 1 && inter / den >= 0.6;
}
function parseBongSchedule(html, base) {
    const out = [];
    const re = /<tr id="tr1_(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = re.exec(html || ""))) {
        const id = String(m[1]), row = m[2] || "";
        const dm = (row.match(/data-match="([^"]+)"/i) || [])[1] || "";
        const parts = htmlDecode(dm).split(",").map((x) => x.trim());
        let home = parts[0] || "", away = parts[1] || "", league = parts.slice(2).join(",").trim();
        if (!home || !away) {
            const names = [...row.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((x) => htmlDecode(x[1])).filter(Boolean);
            if (names.length >= 2) {
                home = names[0];
                away = names[1];
            }
        }
        const tm = (row.match(/data-t="([^"]+)"/i) || [])[1] || "";
        const ts = tm ? Date.parse(tm.replace(" ", "T") + "Z") : 0;
        if (home && away)
            out.push({ id, base, home, away, league, ts, market: null, schedule: true });
    }
    return out;
}
function lineNum(v) {
    const s = htmlDecode(v).replace(/\s+/g, "");
    if (!s)
        return NaN;
    if (s.includes("/")) {
        const p = s.split("/").map(Number);
        if (p.length === 2 && p.every(Number.isFinite))
            return (p[0] + p[1]) / 2;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}
function medianNum(xs) { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; }
function marketSampleOf(m) {
    const mk = m?.bong_market || m?.market || null;
    if (!mk)
        return null;
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? +x.toFixed(4) : null; };
    return { t: Date.now(), hl: n(mk.homeLine), ol: n(mk.ouLine), hp: n(mk.homePrice), ap: n(mk.awayPrice), op: n(mk.overPrice), up: n(mk.underPrice), books: Number(mk.bookmakerCount || 0) };
}
async function trackMarketMovement(date, matches) {
    const stateKey = "football/market-track/" + date;
    const { data } = await db.from("ops_runtime_state").select("value").eq("key", stateKey).maybeSingle();
    const state = (data?.value && typeof data.value === "object") ? structuredClone(data.value) : {}, out = new Map(), now = Date.now();
    for (const m of (matches || [])) {
        const id = String(m?.bong_match_id || m?.id || ""), s = marketSampleOf(m);
        if (!id || !s)
            continue;
        const rec = state[id] || { samples: [] }, arr = Array.isArray(rec.samples) ? rec.samples : [], last = arr[arr.length - 1];
        const changed = !last || ["hl", "ol", "hp", "ap", "op", "up", "books"].some(k => String(last?.[k]) !== String(s[k]));
        if (changed || !last || now - Number(last.t || 0) >= 6 * 3600000)
            arr.push(s);
        const kept = arr.length <= 8 ? arr : [arr[0], ...arr.slice(-7)];
        state[id] = { samples: kept };
        const open = kept[0] || s, cur = kept[kept.length - 1] || s, val = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
        const ahMove = clamp((val(open.hl) - val(cur.hl)) * .70 + (val(open.hp) - val(cur.hp)) * .25, -.8, .8);
        const ouMove = clamp((val(cur.ol) - val(open.ol)) * .70 + (val(open.op) - val(cur.op)) * .25, -.8, .8);
        out.set(id, { movementSamples: kept.length, openingHomeLine: open.hl, openingOuLine: open.ol, ahMovement: +ahMove.toFixed(3), ouMovement: +ouMove.toFixed(3) });
    }
    if (matches?.length)
        await db.from("ops_runtime_state").upsert({ key: stateKey, value: state, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 72 * 3600000).toISOString() }, { onConflict: "key" });
    return out;
}
function parseBongPageMarket(html) {
    const company = { "31": "Sbobet", "8": "Bet365", "3": "Crown" }, rows = [];
    for (const cid of Object.keys(company)) {
        let body = "";
        const live = html.match(new RegExp('<tr[^>]+id="tr_o_2_' + cid + '"[^>]*>([\\\\s\\\\S]*?)<\\\\/tr>', 'i'));
        const early = html.match(new RegExp('<tr[^>]+id="tr_o_1_' + cid + '"[^>]*>([\\\\s\\\\S]*?)<\\\\/tr>', 'i'));
        body = String((live || early || [])[1] || "");
        if (!body)
            continue;
        const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => htmlDecode(m[1]));
        // live row: label, home price, HDP, away price, over price, OU line, under price...
        // early row may include company + label first, normalize by finding label cell.
        let k = cells.findIndex((x) => /^(Live|Sớm)$/i.test(x));
        if (k < 0)
            continue;
        const hp = Number(cells[k + 1]), hl = lineNum(cells[k + 2]), ap = Number(cells[k + 3]), op = Number(cells[k + 4]), ol = lineNum(cells[k + 5]), up = Number(cells[k + 6]);
        if (!Number.isFinite(hl) || !Number.isFinite(ol))
            continue;
        rows.push({ name: company[cid], homeLine: -hl, awayLine: hl, homePrice: String(cells[k + 1] || ""), awayPrice: String(cells[k + 3] || ""), ouLine: ol, overPrice: String(cells[k + 4] || ""), underPrice: String(cells[k + 6] || "") });
    }
    if (!rows.length)
        return null;
    const pri = { Bet365: 0, Sbobet: 1, "12Bet": 2, Crown: 3, Easybets: 4 }, primary = [...rows].sort((a, b) => (pri[a.name] ?? 99) - (pri[b.name] ?? 99))[0];
    return { homeLine: primary.homeLine, awayLine: primary.awayLine, homePrice: primary.homePrice, awayPrice: primary.awayPrice, ouLine: primary.ouLine, overPrice: primary.overPrice, underPrice: primary.underPrice, bookmakerCount: rows.length, bookmakerNames: rows.map(x => x.name), primaryBookmaker: primary.name };
}
function parseBongOdds(xmls) {
    const by = new Map();
    for (const z of xmls) {
        const re = new RegExp("<m>([^<]+)</m>", "g");
        let m;
        while ((m = re.exec(z.xml || ""))) {
            const p = String(m[1] || "").split(","), id = String(p[0] || "");
            if (!id)
                continue;
            const ahs = String(p[2] ?? "").trim(), ous = String(p[10] ?? "").trim();
            if (!ahs || !ous)
                continue;
            const rawAh = Number(ahs), ou = Number(ous);
            if (!Number.isFinite(rawAh) || !Number.isFinite(ou) || ou <= 0)
                continue;
            const a = by.get(id) || [];
            a.push({ name: z.name, homeLine: -rawAh, awayLine: rawAh, homePrice: String(p[3] || ""), awayPrice: String(p[4] || ""), ouLine: ou, overPrice: String(p[11] || ""), underPrice: String(p[12] || "") });
            by.set(id, a);
        }
    }
    const out = new Map();
    for (const [id, a] of by) {
        if (!a.length)
            continue;
        const hmed = medianNum(a.map((x) => Number(x.homeLine))), omed = medianNum(a.map((x) => Number(x.ouLine)));
        const ah = [...a].sort((x, y) => Math.abs(Number(x.homeLine) - hmed) - Math.abs(Number(y.homeLine) - hmed))[0];
        const ou = [...a].sort((x, y) => Math.abs(Number(x.ouLine) - omed) - Math.abs(Number(y.ouLine) - omed))[0];
        const hs = a.map((x) => Number(x.homeLine)).filter(Number.isFinite), os = a.map((x) => Number(x.ouLine)).filter(Number.isFinite);
        const hspread = hs.length ? Math.max(...hs) - Math.min(...hs) : 0, ospread = os.length ? Math.max(...os) - Math.min(...os) : 0;
        out.set(id, {
            homeLine: hmed, awayLine: -hmed,
            homePrice: ah.homePrice, awayPrice: ah.awayPrice,
            ouLine: omed, overPrice: ou.overPrice, underPrice: ou.underPrice,
            bookmakerCount: a.length, bookmakerNames: a.map((x) => x.name),
            primaryBookmaker: ah.name, marketSource: "Bongdalu consensus",
            ahLineSpread: +hspread.toFixed(3), ouLineSpread: +ospread.toFixed(3)
        });
    }
    return out;
}
function splitBongJsFields(src) {
    const out = [];
    let cur = "", q = false, esc = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (q) {
            if (esc) {
                cur += c;
                esc = false;
            }
            else if (c === "\\") {
                esc = true;
            }
            else if (c === "'") {
                q = false;
            }
            else
                cur += c;
        }
        else if (c === "'")
            q = true;
        else if (c === ",") {
            out.push(cur.trim());
            cur = "";
        }
        else
            cur += c;
    }
    out.push(cur.trim());
    return out;
}
function parseBongLeagueMeta(js) {
    const countries = new Map(), leagues = new Map();
    let m;
    const cr = /C\[\d+\]=\[([^\r\n]*?)\];/g;
    while ((m = cr.exec(js || ""))) {
        const f = splitBongJsFields(String(m[1] || ""));
        const id = String(f[0] || ""), name = htmlDecode(f[1] || "");
        if (id && name)
            countries.set(id, name);
    }
    const br = /B\[(\d+)\]=\[([^\r\n]*?)\];/g;
    while ((m = br.exec(js || ""))) {
        const idx = String(m[1]), f = splitBongJsFields(String(m[2] || ""));
        const league = htmlDecode(f[2] || f[8] || f[1] || ""), short = htmlDecode(f[1] || ""), countryId = String(f[10] || ""), country = countries.get(countryId) || "";
        leagues.set(idx, { league, short, country, country_id: countryId });
    }
    return leagues;
}
function parseBongFeed(js, odds, base) {
    const out = [], re = /A\[\d+\]=\[([^\r\n]*?)\];/g;
    let m;
    while ((m = re.exec(js || ""))) {
        const f = splitBongJsFields(String(m[1] || ""));
        if (f.length < 19)
            continue;
        const id = String(f[0] || ""), home = htmlDecode(f[4]), away = htmlDecode(f[5]), tm = String(f[6] || "");
        const priced = odds.get(id) || null, ahs = String(f[21] ?? "").trim(), ous = String(f[25] ?? "").trim(), rawAh = ahs === "" ? NaN : Number(ahs), rawOu = ous === "" ? NaN : Number(ous);
        const market = (Number.isFinite(rawAh) && Number.isFinite(rawOu))
            ? { ...(priced || {}), homeLine: -rawAh, awayLine: rawAh, ouLine: Math.abs(rawOu),
                homePrice: String(priced?.homePrice || ""), awayPrice: String(priced?.awayPrice || ""),
                overPrice: String(priced?.overPrice || ""), underPrice: String(priced?.underPrice || ""),
                bookmakerCount: Math.max(1, Number(priced?.bookmakerCount || 0)), bookmakerNames: Array.isArray(priced?.bookmakerNames) && priced.bookmakerNames.length ? priced.bookmakerNames : ["Bongdalu live"],
                marketSource: "Bongdalu live feed" }
            : priced;
        const rh = bongNatRank(f[17]), ra = bongNatRank(f[18]), rankings = rh && ra ? { home: rh, away: ra } : null;
        if (!id || !home || !away)
            continue;
        out.push({ id, base, home, away, ts: tm ? Date.parse(tm.replace(" ", "T") + "Z") : 0, market, rankings, league_id: String(f[1] || "") });
    }
    return out;
}
function parseBongFixtureData(data, base) {
    const out = [], re = /A\[\d+\]=\[([^\r\n]*?)\];/g;
    let m;
    while ((m = re.exec(data || ""))) {
        const f = splitBongJsFields(String(m[1] || ""));
        if (f.length < 18)
            continue;
        const id = String(f[0] || ""), home = htmlDecode(f[4]), away = htmlDecode(f[5]), dt = String(f[6] || "").split(",").map(Number);
        if (dt.length < 6 || dt.some((x) => !Number.isFinite(x)))
            continue;
        const ts = Date.UTC(dt[0], dt[1], dt[2], dt[3], dt[4], dt[5]), rh = bongNatRank(f[16]), ra = bongNatRank(f[17]), rankings = rh && ra ? { home: rh, away: ra } : null;
        if (id && home && away && Number.isFinite(ts))
            out.push({ id, base, home, away, ts, market: null, rankings, league_id: String(f[1] || "") });
    }
    return out;
}
async function bongFixture(base, date) {
    try {
        const r = await fetch(base + "ajax/SoccerAjax?type=6&date=" + encodeURIComponent(date) + "&order=league&timezone=0", { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json,text/plain,*/*" }, signal: AbortSignal.timeout(18000) });
        if (!r.ok)
            return [];
        const txt = await r.text();
        let j = null;
        try {
            j = JSON.parse(txt);
        }
        catch {
            return [];
        }
        return Number(j?.ErrCode) === 0 ? parseBongFixtureData(String(j?.Data || ""), base) : [];
    }
    catch {
        return [];
    }
}
function bongNeighborRoots(base) {
    const out = [];
    try {
        const u = new URL(base), m = u.hostname.match(/^(?:www\.)?bongdalu(\d+)\.com$/i);
        if (m) {
            const n = Number(m[1]);
            for (const d of [1, -1, 2, -2, 3, -3, 4, -4])
                if (n + d > 0)
                    out.push("https://www.bongdalu" + (n + d) + ".com/");
        }
    }
    catch { }
    return out;
}
async function resolveBongBase() {
    const { data: st } = await db.from("ops_runtime_state").select("value").eq("key", "football/bongdalu-base").maybeSingle();
    const cachedBase = String(st?.value?.base || "");
    const discovered = await discoverBongdaluRoots();
    const roots = [cachedBase, "https://www.bongdalu812.com/", ...bongNeighborRoots(cachedBase), ...discovered, "https://www.bongdalu.com/"].filter((x, i, a) => x && a.indexOf(x) === i);
    for (const root of roots) {
        try {
            const r = await fetch(root, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(12000) });
            if (!r.ok)
                continue;
            const base = new URL(r.url).origin + "/";
            const f = await fetch(base + "gf/data/bf_vn1_nt.js", { headers: { "user-agent": "Mozilla/5.0", "accept": "application/javascript" }, signal: AbortSignal.timeout(15000) });
            if (!f.ok)
                continue;
            const js = await f.text();
            if (!/var\s+A=Array\(/.test(js) || !/A\[\d+\]=\[/.test(js))
                continue;
            await db.from("ops_runtime_state").upsert({ key: "football/bongdalu-base", value: { base, checked_at: new Date().toISOString(), resolved_from: root, verified: true, resolver: "feed-v7" }, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, { onConflict: "key" });
            return { base, js };
        }
        catch { }
    }
    return null;
}
async function bongdaluIndex(date) {
    return await cached("bongdalu-index-v14", date, 10 * 60000, async () => {
        const rr = await resolveBongBase();
        if (!rr)
            return null;
        const company = [["Bet365", "8"], ["Sbobet", "31"], ["12Bet", "24"], ["Crown", "3"], ["Easybets", "12"]];
        const [scheduleHtml, fixPrev, fix0, fix1, ...xmlResp] = await Promise.all([
            fetch(rr.base + "lich-thi-dau", { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(20000) }).then(async (r) => r.ok ? await r.text() : "").catch(() => ""),
            bongFixture(rr.base, addDay(date, -1)),
            bongFixture(rr.base, date),
            bongFixture(rr.base, addDay(date, 1)),
            ...company.map(async ([name, id]) => { try {
                const r = await fetch(rr.base + "gf/data/odds/en/goal" + id + ".xml", { headers: { "user-agent": "Mozilla/5.0", "accept": "text/xml" }, signal: AbortSignal.timeout(15000) });
                return { name, xml: r.ok ? await r.text() : "" };
            }
            catch {
                return { name, xml: "" };
            } })
        ]);
        const odds = parseBongOdds(xmlResp), live = parseBongFeed(rr.js, odds, rr.base), sched = parseBongSchedule(String(scheduleHtml || ""), rr.base), fixtures = [...(fixPrev || []), ...(fix0 || []), ...(fix1 || [])], leagueMeta = parseBongLeagueMeta(rr.js);
        const by = new Map();
        for (const x of fixtures) {
            const id = String(x.id);
            by.set(id, { ...x, market: odds.get(id) || x.market || null });
        }
        for (const x of sched) {
            const id = String(x.id), prev = by.get(id) || {};
            by.set(id, { ...prev, ...x, ts: Number(prev.ts || 0) || Number(x.ts || 0), market: odds.get(id) || prev.market || x.market || null });
        }
        for (const x of live) {
            const id = String(x.id), prev = by.get(id) || {};
            by.set(id, { ...prev, ...x, market: odds.get(id) || x.market || prev.market || null });
        }
        const matches = [...by.values()].map((x) => { const z = leagueMeta.get(String(x.league_id || "")) || {}; return { ...x, country: String(z.country || x.country || ""), league: String(z.league || x.league || ""), league_short: String(z.short || x.league_short || "") }; });
        if (matches.length < 20)
            return null;
        return { base: rr.base, matches, resolved_at: new Date().toISOString(), bookmakers: company.map(x => x[0]), schedule_count: sched.length, fixture_count: fixtures.length, live_count: live.length };
    });
}
function findBongMatch(m, idx) {
    const xs = idx?.matches || [];
    let best = null, bs = -1;
    for (const x of xs) {
        let s = 0;
        if (fuzzySameTeam(m.home, x.home))
            s += 45;
        if (fuzzySameTeam(m.away, x.away))
            s += 45;
        if (s < 90)
            continue;
        if (x.ts && m.ts) {
            const dh = Math.abs(Number(x.ts) - Number(m.ts));
            if (dh <= 6 * 3600000)
                s += 10;
            else if (dh > 18 * 3600000)
                continue;
        }
        if (x.market)
            s += 3;
        if (s > bs) {
            bs = s;
            best = x;
        }
    }
    return bs >= 90 ? best : null;
}
function tablePart(html, id) { const i = html.indexOf('id="' + id + '"'); if (i < 0)
    return ""; const e = html.indexOf("</table>", i); return e > i ? html.slice(i, e + 8) : ""; }
function parseFormTable(html, id, cls) {
    const t = tablePart(html, id), re = /<tr id="tr[123]_\d+"[\s\S]*?<\/tr>/gi;
    let m, n = 0, pts = 0, gf = 0, ga = 0;
    while ((m = re.exec(t)) && n < 20) {
        const row = m[0], sc = row.match(/class="fscore_[123]\s+red2"[^>]*>\s*(\d+)\s*-\s*(\d+)/i);
        if (!sc)
            continue;
        const hg = Number(sc[1]), ag = Number(sc[2]), sp = row.indexOf(cls), fp = row.indexOf('class="fscore_');
        if (sp < 0 || fp < 0)
            continue;
        const isHome = sp < fp, f = isHome ? hg : ag, g = isHome ? ag : hg;
        gf += f;
        ga += g;
        pts += f > g ? 3 : f === g ? 1 : 0;
        n++;
    }
    return { n, ppg: n ? pts / n : 0, gf: n ? gf / n : 0, ga: n ? ga / n : 0 };
}
function parseEmbeddedForm(html, dataVar, teamVar) {
    try {
        const tm = html.match(new RegExp("var\\s+" + teamVar + "\\s*=\\s*(\\d+)", "i"));
        const dm = html.match(new RegExp("var\\s+" + dataVar + "\\s*=\\s*(\\[\\[[\\s\\S]*?\\]\\])\\s*;", "i"));
        const team = tm ? Number(tm[1]) : NaN;
        if (!Number.isFinite(team) || !dm)
            return { n: 0, ppg: 0, gf: 0, ga: 0 };
        const rows = JSON.parse(dm[1]);
        let n = 0, pts = 0, gf = 0, ga = 0;
        for (const r of rows || []) {
            if (n >= 20 || !Array.isArray(r) || r.length < 4)
                continue;
            const hid = Number(r[0]), aid = Number(r[1]), hg = Number(r[2]), ag = Number(r[3]);
            if (!Number.isFinite(hid) || !Number.isFinite(aid) || !Number.isFinite(hg) || !Number.isFinite(ag))
                continue;
            const isHome = hid === team, isAway = aid === team;
            if (!isHome && !isAway)
                continue;
            const f = isHome ? hg : ag, g = isHome ? ag : hg;
            gf += f;
            ga += g;
            pts += f > g ? 3 : f === g ? 1 : 0;
            n++;
        }
        return { n, ppg: n ? pts / n : 0, gf: n ? gf / n : 0, ga: n ? ga / n : 0 };
    }
    catch {
        return { n: 0, ppg: 0, gf: 0, ga: 0 };
    }
}
function parseH2HTable(html) {
    const t = tablePart(html, "table_v3"), re = /<tr id="tr3_\d+"[\s\S]*?<\/tr>/gi;
    let m, n = 0, edge = 0, total = 0;
    while ((m = re.exec(t)) && n < 20) {
        const row = m[0], sc = row.match(/class="fscore_3\s+red2"[^>]*>\s*(\d+)\s*-\s*(\d+)/i);
        if (!sc)
            continue;
        const hg = Number(sc[1]), ag = Number(sc[2]), sp = row.indexOf("team-home-f"), fp = row.indexOf('class="fscore_3');
        if (sp < 0 || fp < 0)
            continue;
        const isHome = sp < fp, f = isHome ? hg : ag, g = isHome ? ag : hg;
        edge += f > g ? 1 : f < g ? -1 : 0;
        total += hg + ag;
        n++;
    }
    return { n, edge: n ? edge / n : 0, total: n ? total / n : 0 };
}
function ahOutcome(rawLine, hg, ag, homeTeamId, targetTeamId) {
    let r = rawLine >= 0 ? (hg - rawLine > ag ? 1 : hg - rawLine === ag ? 0 : -1) : (ag - Math.abs(rawLine) > hg ? -1 : ag - Math.abs(rawLine) === hg ? 0 : 1);
    if (Number.isFinite(targetTeamId) && homeTeamId !== targetTeamId)
        r = -r;
    return r;
}
function statRec() { return { n: 0, win: 0, push: 0, loss: 0, win_rate: 0, avg_line: 0, line_n: 0 }; }
function addRec(s, res, teamLine) {
    s.n++;
    if (res > 0)
        s.win++;
    else if (res < 0)
        s.loss++;
    else
        s.push++;
    if (Number.isFinite(teamLine)) {
        s.avg_line += teamLine;
        s.line_n++;
    }
}
function finishRec(s) { return { ...s, win_rate: s.n ? s.win / s.n : 0, avg_line: s.line_n ? s.avg_line / s.line_n : 0 }; }
function parseAsianHistory(html, tableNo, targetTeamId) {
    try {
        const vm = html.match(/var\s+Vs_hOdds\s*=\s*(\[\[[\s\S]*?\]\])\s*;/i);
        if (!vm)
            return { opening: finishRec(statRec()), closing: finishRec(statRec()), ou_open: finishRec(statRec()), ou_close: finishRec(statRec()), bookmaker: "" };
        const rows = JSON.parse(vm[1].replace(/'/g, '"'));
        const pri = { 8: 0, 31: 1, 24: 2, 3: 3, 12: 4 };
        const by = new Map();
        for (const z of rows || []) {
            if (!Array.isArray(z) || z.length < 10)
                continue;
            const mid = String(z[0] || ""), cid = Number(z[1]), rank = pri[cid] ?? 99, old = by.get(mid);
            if (!old || rank < old.rank)
                by.set(mid, { rank, row: z, cid });
        }
        const t = tablePart(html, "table_v" + tableNo), re = new RegExp('<tr id="tr' + tableNo + '_(?:\\d+)"[\\s\\S]*?<\\/tr>', 'gi');
        const opening = statRec(), closing = statRec(), ouOpen = statRec(), ouClose = statRec();
        let m, used = 0, book = "";
        while ((m = re.exec(t)) && used < 20) {
            const row = String(m[0] || ""), im = row.match(/index="(\d+)"/i), inf = row.match(/info="([^"]+)"/i);
            if (!im || !inf)
                continue;
            const a = inf[1].split(",").map((x) => Number(x)), hg = a[0], ag = a[1], homeId = a[2];
            if (!Number.isFinite(hg) || !Number.isFinite(ag) || !Number.isFinite(homeId))
                continue;
            const z = by.get(String(im[1]));
            if (!z)
                continue;
            const q = z.row, open = Number(q[3]), close = Number(q[6]), oo = Number(q[8]), oc = Number(q[9]);
            const targetIsHome = homeId === targetTeamId;
            if (Number.isFinite(open)) {
                const rr = ahOutcome(open, hg, ag, homeId, targetTeamId), tl = targetIsHome ? -open : open;
                addRec(opening, rr, tl);
            }
            if (Number.isFinite(close)) {
                const rr = ahOutcome(close, hg, ag, homeId, targetTeamId), tl = targetIsHome ? -close : close;
                addRec(closing, rr, tl);
            }
            if (Number.isFinite(oo) && oo > 0)
                addRec(ouOpen, hg + ag > oo ? 1 : hg + ag === oo ? 0 : -1, oo);
            if (Number.isFinite(oc) && oc > 0)
                addRec(ouClose, hg + ag > oc ? 1 : hg + ag === oc ? 0 : -1, oc);
            book = String(z.cid);
            used++;
        }
        return { opening: finishRec(opening), closing: finishRec(closing), ou_open: finishRec(ouOpen), ou_close: finishRec(ouClose), bookmaker: book === "8" ? "Bet365" : book === "31" ? "Sbobet" : book === "24" ? "12Bet" : book === "3" ? "Crown" : book === "12" ? "Easybets" : book };
    }
    catch {
        return { opening: finishRec(statRec()), closing: finishRec(statRec()), ou_open: finishRec(statRec()), ou_close: finishRec(statRec()), bookmaker: "" };
    }
}
function asianLine(v) {
    const s = htmlDecode(v).replace(/\s+/g, "").replace(/−/g, "-");
    if (!s)
        return NaN;
    if (s.includes("/")) {
        const q = s.split("/").map((x) => Number(x));
        if (q.length === 2 && q.every(Number.isFinite))
            return (q[0] + q[1]) / 2;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}
function bongFootballBase(base) {
    try {
        const u = new URL(base), host = u.hostname.replace(/^www\./i, "");
        return u.protocol + "//football." + host + "/";
    }
    catch {
        return "";
    }
}
function bongLeagueId(m) {
    const c = norm(m?.country || ""), l = norm(m?.league || "");
    if (c === "uefa nations league" || /league [abcd]: group/.test(l))
        return "1864";
    if (/champions league/.test(l) && /uefa|champions/.test(c + " " + l))
        return "103";
    if (/europa league/.test(l))
        return "113";
    if (rankKey(x?.country || "") === "england" && /^premier league\b/.test(l))
        return "36";
    if (c === "italy" && /^serie a\b/.test(l))
        return "34";
    if (c === "spain" && /(^laliga\b|^la liga\b|primera division)/.test(l))
        return "31";
    if (c === "germany" && /^bundesliga\b/.test(l))
        return "8";
    if (c === "france" && /^ligue 1\b/.test(l))
        return "11";
    return "";
}
function parseLeagueFixtures(html) {
    const out = [], re = /<div class="schedulis"[^>]*matchid="(\d+)"[\s\S]*?<\/div>/gi;
    let m;
    while ((m = re.exec(html || ""))) {
        const row = m[0], id = String(m[1]);
        const tm = (row.match(/data-t="([^"]+)"/i) || [])[1] || "";
        const home = htmlDecode((row.match(/<span class="home">[\s\S]*?<span>([\s\S]*?)<\/span>/i) || [])[1] || "");
        const away = htmlDecode((row.match(/<span class="away">[\s\S]*?<span>([\s\S]*?)<\/span>/i) || [])[1] || "");
        const odds = (row.match(/<span class="odds">([\s\S]*?)<\/span>\s*<\/div>/i) || [])[1] || "";
        const vals = [...odds.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((x) => htmlDecode(x[1]));
        const ah = vals.length >= 3 ? asianLine(vals[1]) : NaN;
        if (home && away)
            out.push({ id, home, away, time: tm, ah: Number.isFinite(ah) ? ah : null });
    }
    return out;
}
async function bongLeagueFixtures(base, leagueId) {
    if (!leagueId)
        return null;
    return await cached("bongdalu-league", leagueId, 2 * 3600000, async () => {
        try {
            const fb = bongFootballBase(base);
            if (!fb)
                return null;
            const r = await fetch(fb + "league/" + encodeURIComponent(leagueId), { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(20000) });
            if (!r.ok)
                return null;
            const html = await r.text(), matches = parseLeagueFixtures(html);
            return matches.length ? { matches } : null;
        }
        catch {
            return null;
        }
    });
}
async function bongMajorFixture(base, m) {
    const lid = bongLeagueId(m);
    if (!lid)
        return null;
    const z = await bongLeagueFixtures(base, lid), xs = z?.matches || [];
    let best = null, score = -1;
    for (const x of xs) {
        let s = 0;
        if (fuzzySameTeam(m.home, x.home))
            s += 50;
        if (fuzzySameTeam(m.away, x.away))
            s += 50;
        if (s > score) {
            score = s;
            best = x;
        }
    }
    return score >= 100 ? { ...best, base } : null;
}
function parseCurrentBongMarket(html) {
    const ids = [["Sbobet", "31"], ["Bet365", "8"], ["Crown", "3"]], rows = [];
    for (const [name, id] of ids) {
        const live = (html.match(new RegExp('<tr[^>]+id="tr_o_2_' + id + '"[^>]*>([\\\\s\\\\S]*?)<\\\\/tr>', 'i')) || [])[1];
        const early = (html.match(new RegExp('<tr[^>]+id="tr_o_1_' + id + '"[^>]*>([\\\\s\\\\S]*?)<\\\\/tr>', 'i')) || [])[1];
        const row = live || early;
        if (!row)
            continue;
        const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => htmlDecode(x[1]));
        // row: label, home-price, HDP, away-price, over-price, OU-line, under-price, ...
        if (tds.length < 7)
            continue;
        const homePrice = String(tds[1] || ""), hl = asianLine(tds[2]), awayPrice = String(tds[3] || ""), overPrice = String(tds[4] || ""), ol = asianLine(tds[5]), underPrice = String(tds[6] || "");
        if (!Number.isFinite(hl) || !Number.isFinite(ol))
            continue;
        rows.push({ name, homeLine: -hl, awayLine: hl, homePrice, awayPrice, ouLine: ol, overPrice, underPrice });
    }
    if (!rows.length)
        return null;
    const pri = { Bet365: 0, Sbobet: 1, "12Bet": 2, Crown: 3, Easybets: 4 }, primary1 = [...rows].sort((a, b) => (pri[a.name] ?? 99) - (pri[b.name] ?? 99))[0];
    return { homeLine: primary1.homeLine, awayLine: primary1.awayLine, homePrice: primary1.homePrice, awayPrice: primary1.awayPrice, ouLine: primary1.ouLine, overPrice: primary1.overPrice, underPrice: primary1.underPrice, bookmakerCount: rows.length, bookmakerNames: rows.map(x => x.name), primaryBookmaker: primary1.name };
}
const BONG6_CACHE = new Map();
async function bongSixData(base, cid) {
    const k = base + "|" + cid, z = BONG6_CACHE.get(k);
    if (z && Date.now() - z.t < 5 * 60000)
        return z.data;
    try {
        const r = await fetch(base + "Ajax/SoccerAjax/?type=7&companyid=" + encodeURIComponent(cid), { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json,text/plain,*/*", "referer": base + "soi-keo" }, signal: AbortSignal.timeout(20000) });
        if (!r.ok)
            return "";
        const txt = await r.text();
        let j = null;
        try {
            j = JSON.parse(txt);
        }
        catch {
            return "";
        }
        const data = Number(j?.ErrCode) === 0 ? String(j?.Data || "") : "";
        if (data)
            BONG6_CACHE.set(k, { t: Date.now(), data });
        return data;
    }
    catch {
        return "";
    }
}
function bongRec(part, id) { return String(part || "").split(";").find((x) => x.startsWith(id + ",")) || ""; }
function bongNatRank(v) { const s = String(v ?? "").trim(); if (!/^\d{1,3}$/.test(s))
    return null; const n = Number(s); return n >= 1 && n <= 250 ? n : null; }
async function bongSixMixMarket(base, id) {
    const selectors = [["Bet365", "8"], ["Sbobet", "31"], ["Crown", "3"]];
    const rows = [];
    await Promise.all(selectors.map(async ([name, cid]) => {
        const data = await bongSixData(base, cid);
        if (!data)
            return;
        const p = data.split("$");
        if (p.length < 5)
            return;
        const mr = bongRec(p[1], id), ar = bongRec(p[2], id), xr = bongRec(p[3], id), or = bongRec(p[4], id);
        if (!ar || !or)
            return;
        const m = mr.split(","), a = ar.split(","), x = xr.split(","), o = or.split(",");
        const mag = Math.abs(Number(a[5])), ol = Math.abs(Number(o[5]));
        if (!Number.isFinite(mag) || !Number.isFinite(ol))
            return;
        const h1 = Number(x[5]), a1 = Number(x[7]), raw = Number(a[5]);
        let homeLine = Number.isFinite(raw) ? raw : 0;
        if (Number.isFinite(h1) && Number.isFinite(a1) && Math.abs(h1 - a1) > .03)
            homeLine = h1 < a1 ? -mag : mag;
        else if (Number.isFinite(raw))
            homeLine = raw > 0 ? -mag : raw < 0 ? mag : 0;
        rows.push({ name, homeLine, awayLine: -homeLine, homePrice: String(a[6] || ""), awayPrice: String(a[7] || ""), ouLine: ol, overPrice: String(o[6] || ""), underPrice: String(o[7] || ""), rankings: { home: bongNatRank(m[12]), away: bongNatRank(m[13]) } });
    }));
    if (rows.length < 2)
        return null;
    const h = medianNum(rows.map((x) => x.homeLine)), ol = medianNum(rows.map((x) => x.ouLine));
    const ah = [...rows].sort((a, b) => Math.abs(a.homeLine - h) - Math.abs(b.homeLine - h))[0], ou = [...rows].sort((a, b) => Math.abs(a.ouLine - ol) - Math.abs(b.ouLine - ol))[0];
    const ranks = rows.map((x) => x.rankings).find((r) => Number(r?.home) > 0 && Number(r?.away) > 0) || null;
    return { homeLine: h, awayLine: -h, homePrice: ah.homePrice, awayPrice: ah.awayPrice, ouLine: ol, overPrice: ou.overPrice, underPrice: ou.underPrice, bookmakerCount: rows.length, bookmakerNames: rows.map((x) => x.name), rankings: ranks, marketSource: "Bongdalu 6in1 type7", base };
}
async function bongAjaxMarket(base, id) {
    return await cached("bongdalu-market-v4", id, 30 * 60000, async () => {
        try {
            /* Do not use type=7 six-in-one parser for AH/OU: its field semantics can invert handicap sides. Use Bongdalu oddscomp type=14 directly. */
            const page = base + "oddscomp/" + encodeURIComponent(id);
            const p = await fetch(page, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(20000) });
            if (!p.ok)
                return null;
            const liveBase = new URL(p.url).origin + "/";
            const cookie = p.headers.get("set-cookie") || "";
            await p.text();
            const rows = [];
            for (const [name, cid] of [["Sbobet", "31"], ["Bet365", "8"], ["Crown", "3"]]) {
                try {
                    const u = liveBase + "ajax/soccerajax?type=14&id=" + encodeURIComponent(id) + "&t=10&cid=" + cid;
                    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json", "referer": liveBase + "oddscomp/" + encodeURIComponent(id), "x-requested-with": "XMLHttpRequest", ...(cookie ? { "cookie": cookie } : {}) }, signal: AbortSignal.timeout(15000) });
                    if (!r.ok)
                        continue;
                    const j = await r.json().catch(() => null);
                    const d = j?.Data;
                    if (Number(j?.ErrCode) !== 0 || !d?.ah || !d?.ou)
                        continue;
                    const hl = lineNum(d.ah.g), ol = lineNum(d.ou.g);
                    if (!Number.isFinite(hl) || !Number.isFinite(ol))
                        continue;
                    rows.push({ name, homeLine: -hl, awayLine: hl, homePrice: String(d.ah.u ?? ""), awayPrice: String(d.ah.d ?? ""), ouLine: ol, overPrice: String(d.ou.u ?? ""), underPrice: String(d.ou.d ?? "") });
                }
                catch { }
            }
            if (!rows.length)
                return null;
            const pri = { Bet365: 0, Sbobet: 1, "12Bet": 2, Crown: 3, Easybets: 4 }, primary2 = [...rows].sort((a, b) => (pri[a.name] ?? 99) - (pri[b.name] ?? 99))[0];
            return { homeLine: primary2.homeLine, awayLine: primary2.awayLine, homePrice: primary2.homePrice, awayPrice: primary2.awayPrice, ouLine: primary2.ouLine, overPrice: primary2.overPrice, underPrice: primary2.underPrice, bookmakerCount: rows.length, bookmakerNames: rows.map((x) => x.name), primaryBookmaker: primary2.name, base: liveBase };
        }
        catch {
            return null;
        }
    });
}
async function bongdaluHistory(base, id, withMarket = true) {
    return await cached(withMarket ? "bongdalu-h2h-market-v9" : "bongdalu-h2h-lite-v7", id, withMarket ? 6 * 3600000 : 24 * 3600000, async () => {
        const roots = (base ? [base] : [(await resolveBongBase())?.base]).filter((x, i, a) => x && a.indexOf(x) === i);
        for (const root of roots) {
            try {
                const r = await fetch(root + "match/h2h-" + encodeURIComponent(id), { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(20000) });
                if (!r.ok)
                    continue;
                const html = await r.text();
                let home = parseFormTable(html, "table_v1", "team-home-f"), away = parseFormTable(html, "table_v2", "team-away-f");
                const h2h = parseH2HTable(html);
                const hm = (html.match(/var\s+h2h_home\s*=\s*(\d+)/i) || [])[1], am = (html.match(/var\s+h2h_away\s*=\s*(\d+)/i) || [])[1];
                const homeId = Number(hm), awayId = Number(am), homeAsian = parseAsianHistory(html, 1, homeId), awayAsian = parseAsianHistory(html, 2, awayId), h2hAsian = parseAsianHistory(html, 3, homeId), minForm = 1;
                if (home.n < minForm) {
                    const z = parseEmbeddedForm(html, "h_data", "h2h_home");
                    if (z.n > home.n)
                        home = z;
                }
                if (away.n < minForm) {
                    const z = parseEmbeddedForm(html, "a_data", "h2h_away");
                    if (z.n > away.n)
                        away = z;
                }
                if (withMarket) {
                    if (home.n < minForm || away.n < minForm)
                        continue;
                }
                else if (Number(home.n || 0) < 1 && Number(away.n || 0) < 1 && Number(h2h.n || 0) < 1)
                    continue;
                const liveBase = new URL(r.url).origin + "/";
                const market = withMarket ? await bongAjaxMarket(liveBase, id) : null;
                if (liveBase !== root)
                    await db.from("ops_runtime_state").upsert({ key: "football/bongdalu-base", value: { base: liveBase, checked_at: new Date().toISOString(), resolved_from: "h2h_redirect", verified: true }, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, { onConflict: "key" });
                const hn = Number(home.n || 0), an = Number(away.n || 0), both = hn > 0 && an > 0, hist = both ? Math.min(20, hn, an) : 0;
                return { bongdalu: true, home, away, h2h, home_asian: homeAsian, away_asian: awayAsian, h2h_asian: h2hAsian, history_loaded: true, history_games: hist, history_home_games: hn, history_away_games: an, partial_history: !both, match_id: id, base: liveBase, market };
            }
            catch { }
        }
        return null;
    });
}
async function bongLiteCacheMap(ids) {
    const out = new Map(), uniq = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 200) {
        const { data } = await db.from("football_external_history_cache")
            .select("cache_key,payload,expires_at")
            .eq("source", "bongdalu-h2h-lite-v7")
            .in("cache_key", uniq.slice(i, i + 200));
        for (const r of (data || []))
            if (r?.payload && Date.parse(String(r.expires_at || "")) > Date.now())
                out.set(String(r.cache_key), r.payload);
    }
    return out;
}
function historyModel(m, ext, h, a, l) {
    const e = exp(m, h, a, l), eh = ext?.home || {}, ea = ext?.away || {}, hh = ext?.h2h || {}, hn = Number(eh.n || 0), an = Number(ea.n || 0);
    let xh = e.xh, xa = e.xa;
    if (hn >= 1 && an >= 1) {
        const fh = clamp((Number(eh.gf || 0) + Number(ea.ga || 0)) / 2 * 1.05, .2, 4), fa = clamp((Number(ea.gf || 0) + Number(eh.ga || 0)) / 2 * .95, .2, 4);
        xh = xh * .2 + fh * .8;
        xa = xa * .2 + fa * .8;
    }
    else if (hn >= 1) {
        xh = xh * .55 + clamp(Number(eh.gf || 0) * 1.05, .2, 4) * .45;
        xa = xa * .55 + clamp(Number(eh.ga || 0) * .95, .2, 4) * .45;
    }
    else if (an >= 1) {
        xh = xh * .55 + clamp(Number(ea.ga || 0) * 1.05, .2, 4) * .45;
        xa = xa * .55 + clamp(Number(ea.gf || 0) * .95, .2, 4) * .45;
    }
    const he = Number(hh.edge || 0);
    xh = clamp(xh + Math.max(-.2, Math.min(.2, he * .14)), .2, 4);
    xa = clamp(xa - Math.max(-.2, Math.min(.2, he * .14)), .2, 4);
    const diff = xh - xa, home = diff >= 0, mag = clamp(quarter(Math.abs(diff)), 0, 2.5), total = xh + xa, ou = clamp(quarter(total), 1.5, 4), over = total >= ou;
    const fullHist = Math.min(1, Number(ext?.history_games || 0) / 20), partialHist = hn > 0 && an > 0 ? 0 : Math.min(.35, Math.max(hn, an) / 40), hist = Math.max(fullHist, partialHist);
    return { id: m.live_id, ts: m.ts, home: m.home, away: m.away, country: m.country, league: m.league, provider: "Bongdalu history + R55", source_count: 3, bookmaker_count: 0, bookmaker_names: [], quality_score: Math.round(clamp(Number(m.rank || 40) + hist * 10, 45, 92)),
        model: { xg_home: +xh.toFixed(2), xg_away: +xa.toFixed(2), history_games: Number(ext?.history_games || 0), history_home_games: hn, history_away_games: an, partial_history: !!ext?.partial_history, h2h_games: Number(hh.n || 0) },
        ah: { pick: home ? m.home : m.away, line: line(mag ? -mag : 0), price: "", signal_score: Math.round(clamp(54 + Math.abs(diff) * 13 + hist * 8, 54, 86)) },
        ou: { pick: over ? "Over" : "Under", line: (over ? "o" : "u") + ou, price: "", signal_score: Math.round(clamp(54 + Math.abs(total - ou) * 13 + hist * 8, 54, 86)) }
    };
}
function bongMarket(m, bm, ext, h, a, l, methodRows = []) {
    const mk = bm?.market || ext?.market;
    if (!mk || !ext)
        return null;
    const e = exp(m, h, a, l), eh = ext.home || {}, ea = ext.away || {}, hh = ext.h2h || {};
    let xh = e.xh, xa = e.xa;
    if (Number(eh.n) >= 5 && Number(ea.n) >= 5) {
        const fh = clamp((Number(eh.gf || 0) + Number(ea.ga || 0)) / 2 * 1.05, .2, 4), fa = clamp((Number(ea.gf || 0) + Number(eh.ga || 0)) / 2 * .95, .2, 4);
        xh = xh * .35 + fh * .65;
        xa = xa * .35 + fa * .65;
    }
    const he = Number(hh.edge || 0);
    xh = clamp(xh + Math.max(-.18, Math.min(.18, he * .12)), .2, 4);
    xa = clamp(xa - Math.max(-.18, Math.min(.18, he * .12)), .2, 4);
    const hl = Number(mk.homeLine), ol = Number(mk.ouLine), hp = num(mk.homePrice), ap = num(mk.awayPrice), op = num(mk.overPrice), up = num(mk.underPrice);
    const hppg = Number(eh.ppg ?? 1.35), appg = Number(ea.ppg ?? 1.35);
    const hwr = Number(ext?.home_asian?.closing?.win_rate ?? ext?.home_asian?.opening?.win_rate ?? .5), awr = Number(ext?.away_asian?.closing?.win_rate ?? ext?.away_asian?.opening?.win_rate ?? .5), hhwr = Number(ext?.h2h_asian?.closing?.win_rate ?? ext?.h2h_asian?.opening?.win_rate ?? .5);
    const hhN = Number(ext?.h2h_asian?.closing?.n ?? ext?.h2h_asian?.opening?.n ?? 0), hhW = Math.min(1, hhN / 6);
    const marketMargin = -hl, modelMargin = xh - xa, priceHome = (Number.isFinite(hp) && Number.isFinite(ap)) ? clamp((ap - hp) * 1.35, -.35, .35) : 0;
    const ahMovement = Number(mk?.ahMovement || 0), ouMovement = Number(mk?.ouMovement || 0);
    let ahEvidence = .05 * (modelMargin - marketMargin) + .38 * (hppg - appg) + .50 * (hwr - awr) + .30 * hhW * (hhwr - .5) + .35 * priceHome + .45 * ahMovement;
    const deepHandicap = Math.abs(hl) >= 1.5;
    if (deepHandicap)
        ahEvidence += (hl < 0 ? .10 : -.10);
    const ahSpread = Number(mk?.ahLineSpread || 0), ouSpread = Number(mk?.ouLineSpread || 0), bookDisagree = ahSpread > .25 || ouSpread > .25;
    if (bookDisagree)
        ahEvidence *= .72;
    let takeH = ahEvidence >= 0;
    const recentTotal = (Number(eh.n || 0) > 0 && Number(ea.n || 0) > 0)
        ? (Number(eh.gf || 0) + Number(eh.ga || 0) + Number(ea.gf || 0) + Number(ea.ga || 0)) / 2
        : (Number(eh.n || 0) > 0 ? Number(eh.gf || 0) + Number(eh.ga || 0) : Number(ea.gf || 0) + Number(ea.ga || 0));
    const houn = Number(ext?.home_asian?.ou_close?.n || 0), aoun = Number(ext?.away_asian?.ou_close?.n || 0), hhoun = Number(ext?.h2h_asian?.ou_close?.n || 0);
    const hour = Number(ext?.home_asian?.ou_close?.win_rate ?? .5), aour = Number(ext?.away_asian?.ou_close?.win_rate ?? .5), hhour = Number(ext?.h2h_asian?.ou_close?.win_rate ?? .5);
    const ouParts = [houn > 0 ? hour : null, aoun > 0 ? aour : null, hhoun > 0 ? hhour : null].filter((z) => z !== null);
    const asianOverRate = ouParts.length ? ouParts.reduce((s, z) => s + z, 0) / ouParts.length : .5;
    const h2hTotal = Number(hh?.total || 0), h2hTotalW = Math.min(1, Number(hh?.n || 0) / 6), priceOver = (Number.isFinite(op) && Number.isFinite(up)) ? clamp((up - op) * 1.25, -.35, .35) : 0;
    let ouEvidence;
    if (ol >= 3.25) {
        ouEvidence = .12 * ((xh + xa) - ol) + .22 * (recentTotal - ol) + .30 * h2hTotalW * (h2hTotal - ol) + .40 * (asianOverRate - .5) + .30 * priceOver;
    }
    else {
        ouEvidence = .25 * ((xh + xa) - ol) + .30 * (recentTotal - ol) + .15 * h2hTotalW * (h2hTotal - ol) + .35 * (asianOverRate - .5) + .30 * priceOver;
        if (ol >= 2.75 && ol < 3.25)
            ouEvidence -= .04;
        if (ol <= 2.5 && Math.abs(ol - 1.75) > .01)
            ouEvidence += .03;
    }
    ouEvidence += .45 * ouMovement;
    if (bookDisagree)
        ouEvidence *= .72;
    let takeO = ouEvidence >= 0;
    const hist = Math.min(1, Number(ext.history_games || 0) / 20), bookBonus = Math.min(6, Math.max(0, Number(mk?.bookmakerCount || 1) - 1) * 1.5);
    const r55H = (xh - xa + hl) >= 0, r55O = (xh + xa) >= ol;
    const marketH = priceHome >= 0, marketO = priceOver >= 0;
    const formH = (hppg - appg + he * .35) >= 0, formO = Number.isFinite(recentTotal) && recentTotal > 0 ? recentTotal >= ol : r55O;
    const asianH = ((hwr - awr) + (hhwr - .5) * .35) >= 0, asianO = asianOverRate >= .5;
    const deepH = ahEvidence >= 0, deepO = ouEvidence >= 0;
    const multiH = [r55H, marketH, formH, asianH, deepH].filter(Boolean).length >= 3, multiO = [r55O, marketO, formO, asianO, deepO].filter(Boolean).length >= 3;
    const consH = Number(mk?.bookmakerCount || 0) >= 3 ? marketH : multiH, consO = Number(mk?.bookmakerCount || 0) >= 3 ? marketO : multiO;
    const votes = [
        ["R55 xG", r55H, r55O], ["Kèo thị trường", marketH, marketO], ["Phong độ + lịch sử", formH, formO],
        ["Lịch sử kèo Châu Á", asianH, asianO], ["Bongdalu lịch sử sâu", deepH, deepO],
        ["Đa nguồn dữ liệu", multiH, multiO], ["Bộ lọc kèo tin cậy", multiH, multiO],
        ["Đồng thuận odds nhiều nhà cái", consH, consO]
    ];
    const by = new Map((methodRows || []).map((r) => [String(r.method), r]));
    let ahVote = 0, ouVote = 0, ahAbs = 0, ouAbs = 0, used = 0;
    for (const [name, vh, vo] of votes) {
        const r = by.get(name), n = Number(r?.n || 0);
        if (!r || r.coverage_gate !== true || n < 150)
            continue;
        const shrink = Math.min(1, Math.max(.25, n / 500)), aw = clamp((Number(r.ah_score || .5) - .5) * 4 * shrink, -.45, .45), ow = clamp((Number(r.ou_score || .5) - .5) * 4 * shrink, -.45, .45);
        if (Math.abs(aw) >= .02) {
            ahVote += (vh ? 1 : -1) * aw;
            ahAbs += Math.abs(aw);
        }
        if (Math.abs(ow) >= .02) {
            ouVote += (vo ? 1 : -1) * ow;
            ouAbs += Math.abs(ow);
        }
        used++;
    }
    const ahStrength = ahAbs ? Math.abs(ahVote) / ahAbs : 0, ouStrength = ouAbs ? Math.abs(ouVote) / ouAbs : 0;
    if (ahAbs >= .12 && ahStrength >= .28)
        takeH = ahVote >= 0;
    if (ouAbs >= .12 && ouStrength >= .28)
        takeO = ouVote >= 0;
    // LOW_TOTAL_175_CONFIRM_V1
    // 1.75 no longer gets a structural Over advantage just because the line is low.
    // Over 1.75 needs >=3 independent confirmations; otherwise O/U is held from release.
    const low175 = Math.abs(ol - 1.75) < .01;
    const low175Checks = low175 ? {
        model: (xh + xa) >= 2.15,
        recent: Number.isFinite(recentTotal) && recentTotal >= 2.10,
        h2h: Number(hh?.n || 0) >= 4 && h2hTotal >= 2.00,
        asian: (houn + aoun + hhoun) >= 18 && asianOverRate >= .55,
        market: priceOver >= .08 || ouMovement >= .08
    } : null;
    const low175OverConfirmations = low175 && low175Checks ? Object.values(low175Checks).filter(Boolean).length : 0;
    const low175OverBlocked = low175 && takeO && low175OverConfirmations < 3;
    if (low175OverBlocked)
        ouEvidence = Math.min(ouEvidence, .04);
    // OU_HISTORY_DIRECTION_GUARD_V1
    // Prevent weak xG/global-vote edges from overriding a sufficiently deep recent/H2H O/U direction.
    const homeOuN = houn, awayOuN = aoun, h2hOuN = hhoun;
    const strongUnderH2H = h2hOuN >= 6 && hhour <= .40;
    const strongOverH2H = h2hOuN >= 6 && hhour >= .60;
    const recentUnderConsensus = homeOuN >= 12 && awayOuN >= 12 && hour <= .45 && aour <= .45;
    const recentOverConsensus = homeOuN >= 12 && awayOuN >= 12 && hour >= .55 && aour >= .55;
    const preGuardTakeO = takeO, preGuardEvidence = ouEvidence;
    let ouHistoryGuard = { version: "OU_HISTORY_DIRECTION_GUARD_V1", applied: false, reason: "none", h2h_n: h2hOuN, h2h_over_rate: +hhour.toFixed(3), home_n: homeOuN, home_over_rate: +hour.toFixed(3), away_n: awayOuN, away_over_rate: +aour.toFixed(3) };
    if (takeO && (strongUnderH2H || recentUnderConsensus) && ol >= 2.5 && Math.abs(ouEvidence) <= .20) {
        takeO = false;
        ouEvidence = -Math.max(.12, Math.abs(ouEvidence));
        ouHistoryGuard = { ...ouHistoryGuard, applied: true, reason: strongUnderH2H ? "H2H_STRONG_UNDER" : "RECENT_BOTH_STRONG_UNDER", before_over: preGuardTakeO, before_evidence: +preGuardEvidence.toFixed(3) };
    }
    else if (!takeO && (strongOverH2H || recentOverConsensus) && ol <= 3.25 && Math.abs(ouEvidence) <= .20) {
        takeO = true;
        ouEvidence = Math.max(.12, Math.abs(ouEvidence));
        ouHistoryGuard = { ...ouHistoryGuard, applied: true, reason: strongOverH2H ? "H2H_STRONG_OVER" : "RECENT_BOTH_STRONG_OVER", before_over: preGuardTakeO, before_evidence: +preGuardEvidence.toFixed(3) };
    }
    // Cross-market coherence: do not publish a favorite cover together with an Under
    // when the minimum scoring margin needed for the AH cover is already >= the O/U line.
    // Resolve by preserving the side with stronger multi-method support and flipping the weaker market.
    let coherence = { conflict: false, action: "none", min_cover_margin: null, ah_support: 0, ou_support: 0 };
    let provisionalLine = takeH ? hl : -hl;
    const minCoverMargin = Math.floor(Math.abs(provisionalLine) + 1e-9) + 1;
    const ahSupport = Math.abs(ahEvidence) + (ahAbs >= .12 ? ahStrength * .35 : 0);
    const ouSupport = Math.abs(ouEvidence) + (ouAbs >= .12 ? ouStrength * .35 : 0);
    if (provisionalLine < 0 && !takeO && minCoverMargin >= ol) {
        coherence = { conflict: true, action: "", min_cover_margin: minCoverMargin, ah_support: +ahSupport.toFixed(3), ou_support: +ouSupport.toFixed(3) };
        if (ahSupport >= ouSupport) {
            takeO = true;
            ouEvidence = Math.max(.08, Math.min(.35, (ahSupport - ouSupport) + .08));
            coherence.action = "flip_ou_to_over_keep_favorite";
        }
        else {
            takeH = !takeH;
            ahEvidence = (takeH ? 1 : -1) * Math.max(.08, Math.min(.35, (ouSupport - ahSupport) + .08));
            coherence.action = "flip_ah_to_underdog_keep_under";
        }
        provisionalLine = takeH ? hl : -hl;
    }
    const deepDogSelected = deepHandicap && ((takeH && hl > 0) || (!takeH && hl < 0));
    const highTotal = ol >= 3.25, doubleFade = deepHandicap && highTotal && deepDogSelected && !takeO;
    const selLine = takeH ? hl : -hl;
    const ahCoherencePenalty = coherence.conflict && coherence.action === "flip_ah_to_underdog_keep_under" ? 8 : 0;
    const ouCoherencePenalty = coherence.conflict && coherence.action === "flip_ou_to_over_keep_favorite" ? 8 : 0;
    const ahSig = Math.round(clamp(57 + Math.min(28, Math.abs(ahEvidence) * 42) + hist * 5 + bookBonus - (deepDogSelected ? 4 : 0) - (bookDisagree ? 7 : 0) - ahCoherencePenalty, 50, 92));
    const ouSig = Math.round(clamp(57 + Math.min(28, Math.abs(ouEvidence) * 46) + hist * 5 + bookBonus - (highTotal && Math.abs(ouEvidence) < .12 ? 6 : 0) - (bookDisagree ? 7 : 0) - ouCoherencePenalty - (low175OverBlocked ? 12 : 0), 50, 92));
    return { id: m.live_id, ts: m.ts, home: m.home, away: m.away, country: m.country, league: m.league, provider: "Bongdalu consensus + R55", source_count: 4, bookmaker_count: Number(mk?.bookmakerCount || 1), bookmaker_names: Array.isArray(mk?.bookmakerNames) ? mk.bookmakerNames : ["Bongdalu market"], quality_score: Math.round(clamp(m.rank + hist * 6 + Math.max(ahStrength, ouStrength) * 4, 55, 100)), rankings: mk?.rankings || bm?.rankings || m?.rankings || ext?.rankings || null, market_source: String(mk?.marketSource || "Bongdalu consensus"),
        model: { xg_home: +xh.toFixed(2), xg_away: +xa.toFixed(2), history_games: Number(ext.history_games || 0), h2h_games: Number(hh.n || 0) },
        ah: { pick: takeH ? m.home : m.away, line: line(selLine), price: takeH ? mk.homePrice : mk.awayPrice, signal_score: ahSig },
        ou: { pick: takeO ? "Over" : "Under", line: (takeO ? "o" : "u") + String(ol), price: takeO ? mk.overPrice : mk.underPrice, signal_score: ouSig },
        market_risk: { deep_handicap: deepHandicap, high_total: highTotal, double_fade: doubleFade, bookmaker_disagreement: bookDisagree, deep_underdog_selected: deepDogSelected ? 1 : 0, cross_market_conflict: coherence.conflict, coherence_action: coherence.action, min_cover_margin: coherence.min_cover_margin, coherence_ah_support: coherence.ah_support, coherence_ou_support: coherence.ou_support, low_total_175: low175 ? { version: "LOW_TOTAL_175_CONFIRM_V1", over_confirmations: low175OverConfirmations, over_blocked: low175OverBlocked, checks: low175Checks } : null, ou_history_guard: ouHistoryGuard, ah_evidence: +ahEvidence.toFixed(3), ou_evidence: +ouEvidence.toFixed(3), ah_line_spread: +ahSpread.toFixed(3), ou_line_spread: +ouSpread.toFixed(3), ah_movement: +ahMovement.toFixed(3), ou_movement: +ouMovement.toFixed(3), movement_samples: Number(mk?.movementSamples || 0), opening_ah: mk?.openingHomeLine ?? null, opening_ou: mk?.openingOuLine ?? null },
        adaptive_learning: { enabled: used > 0, voters_used: used, ah_strength: +ahStrength.toFixed(3), ou_strength: +ouStrength.toFixed(3), min_samples: 150, coverage_required: .80 }
    };
}
function featureReady(x) {
    const bi = x?.big_match?.priority ? x.big_match : bigMatchInfo(x);
    return Number(bi?.priority || 0) > 0 && /bongdalu/i.test(String(x?.provider || "")) && Number(x?.bookmaker_count || 0) >= 1 && numish(x?.ah?.line) && numish(x?.ou?.line) && numish(x?.ah?.price) && numish(x?.ou?.price);
}
function lineBucket(v) { const a = Math.abs(num(v)); return a === 0 ? "0" : a <= .25 ? "0.25" : a <= .5 ? "0.5" : a <= .75 ? "0.75" : a <= 1 ? "1.0" : ">1"; }
function perfMaps(rows) { const m = { league: new Map(), provider: new Map(), ah_line: new Map() }; for (const r of (rows || [])) {
    if (m[r.grp])
        m[r.grp].set(String(r.bucket), r);
} return m; }
function perfDelta(r, side) { if (!r || Number(r.n || 0) < 5)
    return 0; const s = Number(side === "ah" ? r.ah_score : r.ou_score); if (!Number.isFinite(s))
    return 0; const weight = Math.min(1, Number(r.n || 0) / 30); return clamp((s - .5) * 60 * weight, -12, 12); }
function applyPerformance(p, pm) {
    const lr = pm.league.get(String(p.league || "")), pr = pm.provider.get(String(p.provider || "")), br = pm.ah_line.get(lineBucket(p?.ah?.line));
    const ahd = perfDelta(lr, "ah") + perfDelta(pr, "ah") + perfDelta(br, "ah"), oud = perfDelta(lr, "ou") + perfDelta(pr, "ou") + perfDelta(br, "ou");
    if (p?.ah)
        p.ah.signal_score = Math.round(clamp(Number(p.ah.signal_score || 50) + clamp(ahd, -10, 10), 40, 95));
    if (p?.ou)
        p.ou.signal_score = Math.round(clamp(Number(p.ou.signal_score || 50) + clamp(oud, -10, 10), 40, 95));
    p.performance_reference = { ah_delta: +clamp(ahd, -10, 10).toFixed(2), ou_delta: +clamp(oud, -10, 10).toFixed(2), line_bucket: lineBucket(p?.ah?.line) };
    return p;
}
function methodNames(_p) {
    return [
        "R55 xG",
        "Kèo thị trường",
        "Phong độ + lịch sử",
        "Lịch sử kèo Châu Á",
        "Bongdalu lịch sử sâu",
        "Đa nguồn dữ liệu",
        "Bộ lọc kèo tin cậy",
        "Đồng thuận odds nhiều nhà cái"
    ];
}
function applyMethodLearning(p, rows) {
    const ms = methodNames(p), by = new Map((rows || []).map((r) => [String(r.method), r]));
    let ahd = 0, oud = 0, ahUsed = 0, ouUsed = 0, minN = Infinity;
    for (const m of ms) {
        const r = by.get(m), n = Number(r?.n || 0);
        if (!r || r.coverage_gate !== true || n < 150)
            continue;
        const shrink = Math.min(1, n / 500);
        const ae = Number(r.ah_score || .5) - .5, oe = Number(r.ou_score || .5) - .5;
        if (Math.abs(ae) >= .015) {
            ahd += ae * 10 * shrink;
            ahUsed++;
        }
        if (Math.abs(oe) >= .015) {
            oud += oe * 10 * shrink;
            ouUsed++;
        }
        minN = Math.min(minN, n);
    }
    ahd = clamp(ahd, -6, 6);
    oud = clamp(oud, -6, 6);
    if (p?.ah)
        p.ah.signal_score = Math.round(clamp(Number(p.ah.signal_score || 50) + ahd, 40, 95));
    if (p?.ou)
        p.ou.signal_score = Math.round(clamp(Number(p.ou.signal_score || 50) + oud, 40, 95));
    p.learning_methods = ms;
    p.learning_adjustment = { ah: +ahd.toFixed(2), ou: +oud.toFixed(2), ah_samples_used: ahUsed, ou_samples_used: ouUsed, min_sample_used: (ahUsed || ouUsed) ? minN : 0, min_required: 150, coverage_required: .80 };
    return p;
}
function applyExternal(p, ext) {
    if (!ext)
        return p;
    const home = ext.home || {}, away = ext.away || {}, h2h = ext.h2h || {}, hn = Number(home.n || 0), an = Number(away.n || 0), partial = (hn === 0) !== (an === 0);
    let formEdge = 0, formWeight = 1;
    if (hn > 0 && an > 0)
        formEdge = Number(home.ppg || 0) - Number(away.ppg || 0);
    else if (hn > 0) {
        formEdge = (Number(home.ppg || 0) - 1.35) * .4;
        formWeight = .45;
    }
    else if (an > 0) {
        formEdge = (1.35 - Number(away.ppg || 0)) * .4;
        formWeight = .45;
    }
    const histEdge = formEdge + Number(h2h.edge || 0) * .45;
    const pickHome = norm(p?.ah?.pick || "") === norm(p.home) || norm(p.home).includes(norm(p?.ah?.pick || "")), ahAlign = pickHome ? histEdge : -histEdge;
    if (p?.ah)
        p.ah.signal_score = Math.round(clamp(Number(p.ah.signal_score || 50) + clamp(ahAlign * 6 * formWeight, -12, 14), 42, 96));
    let recentTotal = 0, totalWeight = 1;
    if (hn > 0 && an > 0)
        recentTotal = (Number(home.gf || 0) + Number(home.ga || 0) + Number(away.gf || 0) + Number(away.ga || 0)) / 2;
    else if (hn > 0) {
        recentTotal = Number(home.gf || 0) + Number(home.ga || 0);
        totalWeight = .35;
    }
    else if (an > 0) {
        recentTotal = Number(away.gf || 0) + Number(away.ga || 0);
        totalWeight = .35;
    }
    const ol = num(p?.ou?.line), ouAlign = /over/i.test(String(p?.ou?.pick || "")) ? recentTotal - ol : ol - recentTotal;
    if (p?.ou && Number.isFinite(ol) && recentTotal > 0)
        p.ou.signal_score = Math.round(clamp(Number(p.ou.signal_score || 50) + clamp(ouAlign * 6 * totalWeight, -12, 14), 42, 96));
    const histN = Math.max(Number(p?.model?.history_games || 0), Number(ext?.history_games || 0));
    if (p?.model)
        p.model = { ...p.model, history_games: histN, history_home_games: hn, history_away_games: an, partial_history: partial || !!ext?.partial_history, h2h_games: Number(h2h.n || p?.model?.h2h_games || 0) };
    const srcs = (ext.fotmob ? 1 : 0) + (ext.sportsdb ? 1 : 0) + (ext.bongdalu ? 2 : 0);
    p.source_count = Number(p.source_count || 0) + srcs;
    const sources = [...(ext.bongdalu ? ["Bongdalu H2H + phong độ"] : []), ...(ext.fotmob ? ["FotMob"] : []), ...(ext.sportsdb ? ["TheSportsDB"] : [])];
    p.external_history = { sources, home, away, h2h, home_asian: ext.home_asian || null, away_asian: ext.away_asian || null, h2h_asian: ext.h2h_asian || null, history_games: histN, history_home_games: hn, history_away_games: an, partial_history: partial || !!ext?.partial_history, match_id: ext.match_id || null };
    const ps = String(p.provider || "R55");
    p.provider = ps + (ext.bongdalu && !/bongdalu/i.test(ps) ? " + Bongdalu" : "") + (ext.fotmob ? " + FotMob" : "") + (ext.sportsdb ? " + TheSportsDB" : "");
    return p;
}
async function debugBongAjax(id) {
    const rr = await resolveBongBase();
    if (!rr)
        return { ok: false, error: "no_base" };
    const page = rr.base + "oddscomp/" + encodeURIComponent(id);
    const p = await fetch(page, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" }, signal: AbortSignal.timeout(20000) });
    const cookie = p.headers.get("set-cookie") || "";
    await p.text();
    const out = [];
    for (const [name, cid] of [["Sbobet", "31"], ["Bet365", "8"], ["Crown", "3"]]) {
        const u = rr.base + "ajax/soccerajax?type=14&id=" + encodeURIComponent(id) + "&t=10&cid=" + cid;
        const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json", "referer": page, "x-requested-with": "XMLHttpRequest", ...(cookie ? { "cookie": cookie } : {}) }, signal: AbortSignal.timeout(15000) });
        out.push({ name, cid, status: r.status, text: (await r.text()).slice(0, 1500) });
    }
    return { ok: true, base: rr.base, cookie: cookie ? true : false, out };
}
export { bongMarket, bigMatchInfo, parseBongOdds, parseBongFeed, parseBongIndex, parseBongSchedule, parseBongFixtureData, parseFormTable, parseH2HTable, parseAsianHistory, parseBongLeagueMeta, discoverBongdaluRoots, validateBongRoot, bongNeighborRoots, bongMarket as r55NativeMarket };