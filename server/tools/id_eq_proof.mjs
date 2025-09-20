// /srv/xpro0/snaver/server/tools/id_eq_proof.mjs
// 동일 키워드/응답에서 '깨끗한 ID' vs '오염된 ID'로
// old(기존 eqNumStr)와 new(정규화 eqNumStr) 결과를 비교하여
// 발견/미발견 차이를 증명합니다.

const OPENAPI_BASE_URL = "https://openapi.naver.com/v1/search/shop.json";
const KEYWORD = process.env.KEYWORD || "주차번호판";
const TARGET_CLEAN = process.env.TARGET || "7558362412";
const TARGET_BAD = process.env.TARGET_BAD || (TARGET_CLEAN + "\u200B \t"); // 제로폭+공백 오염
const CID = process.env.NAVER_CID;
const CSECRET = process.env.NAVER_CSECRET;

if (!CID || !CSECRET) {
  console.error("환경변수 NAVER_CID, NAVER_CSECRET 필요");
  process.exit(1);
}

function eqOld(a, b) {
  if (a == null || b == null) return false;
  const sa = String(a).replace(/^0+/, "");
  const sb = String(b).replace(/^0+/, "");
  return sa === sb;
}
function eqNew(a, b) {
  if (a == null || b == null) return false;
  const clean = (x) =>
    String(x)
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "") // 제로폭 제거
      .replace(/\s+/g, "")                        // 모든 공백/개행 제거
      .replace(/[^\d]/g, "")                      // 숫자만 남기기
      .replace(/^0+/, "");                        // 선행 0 제거
  return clean(a) === clean(b);
}

// 링크 정규화 추출(디코딩/내부 url 파라미터)
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
    let m;
    m = s.match(/\/products\/(\d+)/i); if (m && !out.prodNo) out.prodNo = m[1];
    m = s.match(/\/catalog\/(\d+)/i);  if (m && !out.productId) out.productId = m[1];
    m = s.match(/[?&]nvMid=(\d+)/i);   if (m && !out.nvMid) out.nvMid = m[1];
    m = s.match(/[?&]productId=(\d+)/i); if (m && !out.productId) out.productId = m[1];
    m = s.match(/[?&]prodNo=(\d+)/i);  if (m && !out.prodNo) out.prodNo = m[1];
    if (out.prodNo || out.nvMid || out.productId) break;
  }
  return out;
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

function findIndexWithEq(items, target, eq) {
  return items.findIndex((it) => {
    const ids = extractIdsRobust(it.link);
    return (
      eq(ids.prodNo, target) ||
      eq(ids.nvMid, target) ||
      eq(ids.productId, target) ||
      eq(it.productId, target)
    );
  });
}

(async () => {
  const b1 = await callApi(1);
  const b2 = await callApi(101);
  const items = [...(b1.items || []), ...(b2.items || [])];

  const res = {
    keyword: KEYWORD,
    totalItems: items.length,
    target_clean: TARGET_CLEAN,
    target_bad_len: TARGET_BAD.length,
    codepoints_of_bad: [...TARGET_BAD].map(c => c.codePointAt(0).toString(16).toUpperCase()),
    // 깨끗한 ID로 검색
    clean_old_idx: findIndexWithEq(items, TARGET_CLEAN, eqOld),
    clean_new_idx: findIndexWithEq(items, TARGET_CLEAN, eqNew),
    // 오염된 ID로 검색
    bad_old_idx: findIndexWithEq(items, TARGET_BAD, eqOld),
    bad_new_idx: findIndexWithEq(items, TARGET_BAD, eqNew),
  };

  console.log(JSON.stringify(res, null, 2));
})();
