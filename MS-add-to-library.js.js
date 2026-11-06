// Fab 라이브러리 추가 매크로
// 사용법: fab.com 에 로그인한 상태에서 F12 콘솔에 붙여넣기 → 파일 선택창에서 fab_all_assets.json 선택
// 중지: window.__fabStop = true
(async () => {
  const CONCURRENCY = 16;   // 동시 요청 수 (429/403 나오면 줄이기)
  const DELAY_MS = 10;     // 워커별 요청 사이 대기(ms)
  const START = 0;         // 재개용 시작 인덱스

  // 1) JSON 파일 선택
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  const file = await new Promise(resolve => {
    input.onchange = () => resolve(input.files[0]);
    input.click();
  });
  if (!file) return console.error("파일이 선택되지 않음");
  const items = JSON.parse(await file.text());

  // 2) CSRF 토큰 (쿠키)
  const csrf = (document.cookie.match(/(?:^|;\s*)fab_csrftoken=([^;]+)/) || [])[1];
  if (!csrf) return console.error("fab_csrftoken 쿠키 없음. 로그인 상태 확인");

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 리스팅 상세에서 offer_id(32자리 hex) 추출. 무료 라이선스(가격 0)를 우선, 없으면 첫 번째 offerId.
  async function getOfferId(uuid) {
    const res = await fetch(`https://www.fab.com/i/listings/${uuid}`, {
      credentials: "include",
      headers: { "X-CsrfToken": csrf, "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      const licenses = data.licenses || [];
      const free = licenses.find(l => l.priceTier && Number(l.priceTier.price) === 0);
      const pick = free || licenses[0];
      if (pick && pick.offerId) return pick.offerId;
    } catch (_) { /* 정규식으로 폴백 */ }
    const m = text.match(/"offer_?[iI]d"\s*:\s*"([a-f0-9]{32})"/);
    return m ? m[1] : null;
  }
  const results = { ok: [], fail: [] };
  window.__fabStop = false;
  window.__fabResults = results;

  let next = START;
  let pauseUntil = 0;

  async function processOne(i) {
    const { uuid, title } = items[i];
    const label = `[${i + 1}/${items.length}]`;
    try {
      const offerId = await getOfferId(uuid);
      if (!offerId) {
        results.fail.push({ i, uuid, error: "offer_id 없음" });
        console.warn(`${label} SKIP offer_id 없음 ${title || uuid}`);
        return;
      }
      const form = new FormData();
      form.append("offer_id", offerId);
      const res = await fetch(`https://www.fab.com/i/listings/${uuid}/add-to-library`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CsrfToken": csrf,
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json, text/plain, */*",
        },
        body: form,
      });
      if (res.ok) {
        results.ok.push(uuid);
        console.log(`${label} OK   ${title || uuid}`);
      } else {
        results.fail.push({ i, uuid, status: res.status });
        console.warn(`${label} FAIL ${res.status} ${title || uuid}`);
        if (res.status === 429) { console.warn("429: 30초 전체 대기"); pauseUntil = Date.now() + 30000; }
        if (res.status === 401 || res.status === 403) { console.error("인증/CSRF 오류. 중단"); window.__fabStop = true; }
      }
    } catch (e) {
      results.fail.push({ i, uuid, error: String(e) });
      console.error(`${label} ERROR`, e);
    }
  }

  // 동시 실행 워커 CONCURRENCY개가 다음 인덱스를 가져가며 처리
  async function worker() {
    while (!window.__fabStop) {
      const wait = pauseUntil - Date.now();
      if (wait > 0) await sleep(wait);
      const i = next++;
      if (i >= items.length) return;
      await processOne(i);
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("완료/중지. 다음 시작 인덱스(대략):", next, { ok: results.ok.length, fail: results.fail.length }, "→ window.__fabResults");
})();