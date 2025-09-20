// /srv/xpro0/snaver/server/tools/rank_link_probe.mjs
// 네이버 OpenAPI 응답에서 링크 해석 방식 비교 테스트 (옛 방식 vs 개선 방식)

const OPENAPI_BASE_URL = "https://openapi.naver.com/v1/search/shop.json";

const KEYWORD = process.env.KEYWORD || "주차번호판";
const TARGET = process.env.TARGET || "7558362412"; // 예: 스마트스토어 prodNo
const CID = process.env.NAVER_CID;
const CSECRET = process.env.NAVER_CSECRET;

if (!CID || !CSECRET) {
  console.error("환경변수 NAVER_CID, NAVER_CSECRET 필요");
  process.exit(1);
}

function eqNumStr(a, b) {
  if (a == null || b == null) return false;
  const sa = String(a).replace(/^0+/, "");
  const sb = String(b).replace(/^0+/, "");
  return sa === sb;
}

// ---- 옛 방식: 단순 정규식 (디코딩/내부 url 파싱 없음)
function extractIdsNaive(u) {
  const out = {};
  try {
    let s = u;
    let m;
    m = s.match(/\/products\/(\d+)/i); if (m && !out.prodNo) out.prodNo = m[1];
    m = s.match(/[?&]nvMid=(\d+)/i);   if (m && !out.nvMid) out.nvMid = m[1];
    m = s.match(/[?&]productId=(\d+)/i); if (m && !out.productId) out.productId = m[1];
    m = s.match(/[?&]prodNo=(\d+)/i);  if (m && !out.prodNo) out.prodNo = m[1];
  } catch {}
  return out;
}

// ---- 개선 방식: HTML 엔티티 정규화 + 이중/삼중 디코딩 + 내부 url 파라미터 추출
function extractIdsRobust(u) {
  const out = {};
  const deentity = (s) => s.replace(/&amp;/gi, "&");
  const safeDecode = (s, times = 3) => {
    let cur = deentity(s);
    for (let i = 0; i < times; i++) {
      try {
        const dec = decodeURIComponent(cur);
        if (dec === cur) break;
        cur = dec;
      } catch { break; }
    }
    return cur;
  };

  const candidates = [];
  const pushC = (s) => { if (s) { candidates.push(s); candidates.push(safeDecode(s)); } };
  pushC(u);

  try {
    const url = new URL(deentity(u));
    const keys = ["url","u","link","redir","redirect","redirect_url","targetUrl","origUrl","dest","to"];
    for (const k of keys) pushC(url.searchParams.get(k));
  } catch {}

  for (const s of candidates) {
    try {
      let m;
      m = s.match(/\/products\/(\d+)/i); if (m && !out.prodNo) out.prodNo = m[1];
      m = s.match(/\/catalog\/(\d+)/i);  if (m && !out.productId) out.productId = m[1];
      m = s.match(/[?&]nvMid=(\d+)/i);   if (m && !out.nvMid) out.nvMid = m[1];
      m = s.match(/[?&]productId=(\d+)/i); if (m && !out.productId) out.productId = m[1];
      m = s.match(/[?&]prodNo=(\d+)/i);  if (m && !out.prodNo) out.prodNo = m[1];
      if (out.prodNo || out.nvMid || out.productId) break;
    } catch {}
  }
  return out;
}

// ---- 상위 N개만 HEAD로 hop 2회, hop당 1200ms (네트워크 예산 제한)
async function resolveLocationHead(url, headers, perHop = 1200, maxHops = 2) {
  let cur = url;
  for (let hop = 0; hop < maxHops; hop++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(new Error("timeout")), perHop);
    try {
      const res = await fetch(cur, { method: "HEAD", redirect: "manual", headers, signal: controller.signal });
      clearTimeout(t);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        try { cur = new URL(loc, cur).href; } catch { cur = loc; }
        continue;
      }
      if (res.ok) return cur;
      break;
    } catch { clearTimeout(t); break; }
  }
  return cur;
}

async function callApi(start) {
  const url = `${OPENAPI_BASE_URL}?query=${encodeURIComponent(KEYWORD)}&display=100&start=${start}&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": CID,
      "X-Naver-Client-Secret": CSECRET,
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`OpenAPI ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  const b1 = await callApi(1);
  const b2 = await callApi(101);
  const items = [...(b1.items||[]), ...(b2.items||[])];

  // 옛 방식
  let oldIdx = items.findIndex((it) => {
    const ids = extractIdsNaive(it.link);
    return eqNumStr(ids.prodNo, TARGET) || eqNumStr(ids.nvMid, TARGET) || eqNumStr(ids.productId, TARGET) || eqNumStr(it.productId, TARGET);
  });

  // 개선 방식
  let robIdx = items.findIndex((it) => {
    const ids = extractIdsRobust(it.link);
    return eqNumStr(ids.prodNo, TARGET) || eqNumStr(ids.nvMid, TARGET) || eqNumStr(ids.productId, TARGET) || eqNumStr(it.productId, TARGET);
  });

  // 개선 방식 실패 시, 상위 15개만 HEAD 추적
  let fbIdx = -1;
  if (robIdx === -1) {
    const topN = Math.min(15, items.length);
    const headers = { "User-Agent": "Mozilla/5.0", "Accept": "*/*" };
    for (let i = 0; i < topN; i++) {
      const host = (() => { try { return new URL(items[i].link).hostname; } catch { return ""; } })();
      if (!/naver\.com$/.test(host)) continue;
      const finalUrl = await resolveLocationHead(items[i].link, headers, 1200, 2);
      const ids = extractIdsRobust(finalUrl);
      const ok = eqNumStr(ids.prodNo, TARGET) || eqNumStr(ids.nvMid, TARGET) || eqNumStr(ids.productId, TARGET);
      if (ok) { fbIdx = i; break; }
    }
  }

  console.log(JSON.stringify({
    keyword: KEYWORD,
    target: TARGET,
    totalItems: items.length,
    oldFound: oldIdx !== -1,
    oldIndex: oldIdx,
    robustFound: robIdx !== -1,
    robustIndex: robIdx,
    fallbackUsed: robIdx === -1 && fbIdx !== -1,
    fallbackIndex: fbIdx
  }, null, 2));
})();
