//https://www.fab.com/sellers/Quixel%20Megascans?is_free=1 에서 개발자 설정(F12) 진입 후 Console 에 입력.
(async () => {

    const collected = new Map();

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    let previousCount = 0;
    let stableCount = 0;
    let iteration = 0;

    console.log("FAB 전체 상품 수집 시작");

    while (stableCount < 50) {

        iteration++;

        // 현재 DOM에서 상품 링크 추출
        const elements = document.querySelectorAll(
            'a.fabkit-Typography-root[href*="/listings/"]'
        );

        elements.forEach(el => {

            const href = el.getAttribute("href");

            const match = href.match(/\/listings\/([a-f0-9-]{36})/i);
            if (!match) return;

            const uuid = match[1];

            // a 태그 아래 div의 텍스트 (없으면 a 자체 텍스트로 대체)
            const titleEl = el.querySelector(".fabkit-Typography-ellipsisWrapper");
            const title = (titleEl ? titleEl.textContent : el.textContent).trim();

            // 이미 제목이 저장돼 있으면, 빈 제목으로 덮어쓰지 않음
            const prev = collected.get(uuid);
            if (prev && prev.title && !title) return;

            collected.set(uuid, {
                title: title,
                href: href,
                uuid: uuid,
                product_url: `https://www.fab.com/listings/${uuid}`
            });

        });

        // 스크롤 위치 이동
        const beforeHeight = document.body.scrollHeight;

        window.scrollBy({
            top: window.innerHeight * 1,
            behavior: "instant"
        });

        await sleep(100);

        const afterHeight = document.body.scrollHeight;

        if (collected.size === previousCount &&
            beforeHeight === afterHeight) {
            stableCount++;
        } else {
            stableCount = 0;
        }

        previousCount = collected.size;

        console.log(
            `반복 ${iteration} | 수집 ${collected.size}개 | 정체 ${stableCount}/50`
        );

        // 진행 상황 주기적 저장
        if (iteration % 10 === 0) {
            console.log("중간 저장:", collected.size);
            const json = JSON.stringify(
                [...collected.values()],
                null,
                2
            );

            console.log("중간 수집 데이터:", json);
        }

        await sleep(100);
    }

    const results = [...collected.values()];

    console.log("최종 수집:", results.length);

    console.table(results);

    const blob = new Blob(
        [JSON.stringify(results, null, 2)],
        { type: "application/json" }
    );

    const a = document.createElement("a");

    a.href = URL.createObjectURL(blob);
    a.download = "fab_all_assets.json";
    a.click();

    URL.revokeObjectURL(a.href);

})();
