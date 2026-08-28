/* =========================================================
   温泉データベース app.js
   目的：
   1) Supabase が設定されていれば Supabase に保存・読込
   2) Supabase 未設定でも、登録した温泉をこの端末に保存・一覧表示
   3) 保存失敗時も入力内容を失わないようにする
   ========================================================= */

(() => {
  "use strict";

  const TABLE_NAME = "onsen_database";
  const LOCAL_KEY = "onsen_database_local_v1";

  // ---------------------------------------------------------
  // Supabase設定
  // config.js があれば window.ONSEN_SUPABASE_CONFIG を使います。
  // まだ設定していない場合は空のままでOKです。
  // ---------------------------------------------------------
  const SUPABASE_URL =
    window.ONSEN_SUPABASE_CONFIG?.url || "";

  const SUPABASE_ANON_KEY =
    window.ONSEN_SUPABASE_CONFIG?.anonKey || "";

  let supabaseClient = null;

  function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return null;
    }

    if (!window.supabase || !window.supabase.createClient) {
      console.warn("Supabaseライブラリが読み込まれていません。");
      return null;
    }

    try {
      return window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
    } catch (error) {
      console.error("Supabase初期化エラー:", error);
      return null;
    }
  }

  supabaseClient = initSupabase();

  // ---------------------------------------------------------
  // 共通
  // ---------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  function value(id) {
    const el = $(id);
    return el ? el.value.trim() : "";
  }

  function numberValue(id) {
    const el = $(id);
    if (!el || el.value === "") return null;

    const n = Number(el.value);
    return Number.isFinite(n) ? n : null;
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
      .map((el) => el.value);
  }

  function radioValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  }

  function setStatus(message, type = "") {
    const el = $("status");
    if (!el) return;

    el.textContent = message;
    el.className = `status ${type}`.trim();
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------------------------------------------------
  // レンタル品
  // index.html の #rentalRows にある入力欄を自動取得
  // ---------------------------------------------------------

  function collectRentalItems() {
    const rows = $("rentalRows");
    if (!rows) return [];

    const result = [];

    rows.querySelectorAll("input, textarea").forEach((el) => {
      const text = el.value.trim();
      if (text) result.push(text);
    });

    return result;
  }

  // ---------------------------------------------------------
  // フォーム → 保存データ
  // ---------------------------------------------------------

  function collectFormData() {
    return {
      name: value("name"),
      prefecture: value("prefecture"),
      area: value("area"),
      address: value("address"),
      business_type: value("businessType"),
      phone: value("phone"),

      open_time: value("openTime"),
      close_time: value("closeTime"),
      last_entry: value("lastEntry"),
      closed_days: value("closedDays"),
      hours_note: value("hoursNote"),

      usage: checkedValues("usage"),

      price: numberValue("price"),
      child_price: numberValue("childPrice"),
      other_price: numberValue("otherPrice"),
      price_category: value("priceCategory"),
      price_note: value("priceNote"),
      payment: checkedValues("payment"),

      website: value("website"),
      instagram: value("instagram"),

      bath: checkedValues("bath"),
      sauna_note: value("saunaNote"),
      sauna: checkedValues("sauna"),
      sauna_status: value("saunaStatus"),
      cold_bath_status: value("coldBathStatus"),

      outdoor: radioValue("outdoor"),
      rest: radioValue("rest"),
      amenities: radioValue("amenities"),
      dryer: radioValue("dryer"),
      wifi: radioValue("wifi"),
      parking: radioValue("parking"),
      locker: radioValue("locker"),
      restaurant: radioValue("restaurant"),
      barrier_free: radioValue("barrierFree"),

      spring_type: value("springType"),
      temperature: numberValue("temperature"),
      source_temperature: numberValue("sourceTemperature"),
      heating: value("heating"),
      spring_detail: value("springDetail"),

      rental_items: collectRentalItems(),

      lat: numberValue("lat"),
      lng: numberValue("lng"),
      note: value("note"),

      // アプリ側で管理する情報
      updated_at: new Date().toISOString()
    };
  }

  // ---------------------------------------------------------
  // LocalStorage
  // ---------------------------------------------------------

  function getLocalData() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return [];

      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("LocalStorage読込エラー:", error);
      return [];
    }
  }

  function saveLocalData(list) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  }

  function addLocalData(item) {
    const list = getLocalData();

    item.id =
      item.id ||
      `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    list.unshift(item);
    saveLocalData(list);

    return item;
  }

  // ---------------------------------------------------------
  // Supabase
  // ---------------------------------------------------------

  async function loadSupabaseData() {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase読込エラー:", error);
      throw error;
    }

    return Array.isArray(data) ? data : [];
  }

  async function insertSupabaseData(item) {
    if (!supabaseClient) return null;

    // Supabase側に存在しない id / updated_at の扱いを避けるため、
    // まずフォーム由来の項目だけを送ります。
    const payload = { ...item };
    delete payload.id;

    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("Supabase保存エラー:", error);
      throw error;
    }

    return data;
  }

  // ---------------------------------------------------------
  // 一覧表示
  // ---------------------------------------------------------

  function renderCards(list) {
    const cards = $("cards");
    const count = $("count");

    if (!cards) return;

    const search = value("search").toLowerCase();

    const filtered = list.filter((item) => {
      if (!search) return true;

      const text = [
        item.name,
        item.prefecture,
        item.area,
        item.address,
        item.business_type,
        item.spring_type
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    });

    if (count) {
      count.textContent = `${filtered.length}件`;
    }

    if (!filtered.length) {
      cards.innerHTML = `
        <div class="status">
          ${
            search
              ? "検索条件に一致する温泉はありません。"
              : "まだ温泉が登録されていません。"
          }
        </div>
      `;
      return;
    }

    cards.innerHTML = filtered
      .map((item) => {
        const place = [
          item.prefecture,
          item.area,
          item.address
        ]
          .filter(Boolean)
          .join(" ");

        const details = [
          item.business_type,
          item.spring_type,
          item.temperature != null
            ? `温泉 ${item.temperature}℃`
            : ""
        ].filter(Boolean);

        return `
          <article class="card" data-id="${escapeHtml(item.id ?? "")}" tabindex="0" role="button" aria-label="${escapeHtml(item.name || "名称未設定")}の詳細を見る">
            <div class="card-head">
              <h3>${escapeHtml(item.name || "名称未設定")}</h3>
            </div>

            ${
              place
                ? `<p class="card-place">${escapeHtml(place)}</p>`
                : ""
            }

            ${
              details.length
                ? `<p>${escapeHtml(details.join(" / "))}</p>`
                : ""
            }

            ${
              item.open_time || item.close_time
                ? `<p>営業時間：
                    ${escapeHtml(item.open_time || "")}
                    ${
                      item.open_time || item.close_time ? "〜" : ""
                    }
                    ${escapeHtml(item.close_time || "")}
                  </p>`
                : ""
            }

            ${
              item.price != null
                ? `<p>大人料金：${escapeHtml(item.price)}円</p>`
                : ""
            }

            ${
              item.website
                ? `<p><a href="${escapeHtml(item.website)}" target="_blank" rel="noopener">公式サイト</a></p>`
                : ""
            }

            <button type="button" class="detail" data-id="${escapeHtml(item.id ?? "")}">詳細を見る</button>
          </article>
        `;
      })
      .join("");
  }

  // ---------------------------------------------------------
  // 温泉詳細画面
  // ---------------------------------------------------------

  function findItemById(id) {
    return (window.__onsenData || []).find(
      (item) => String(item.id) === String(id)
    );
  }

  async function fetchItemById(id) {
    const cached = findItemById(id);
    if (cached) return cached;

    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Supabase詳細取得エラー:", error);
        return null;
      }
      return data;
    }

    return null;
  }

  function detailField(label, value) {
    if (value === null || value === undefined || value === "") return "";
    return `
      <div class="detail-item">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `;
  }

  function detailTags(list) {
    if (!Array.isArray(list) || !list.length) return "";
    return `
      <div class="detail-tags">
        ${list.map((v) => `<span class="badge">${escapeHtml(v)}</span>`).join("")}
      </div>
    `;
  }

  function renderDetailHTML(item) {
    const place = [item.prefecture, item.area, item.address]
      .filter(Boolean)
      .join(" ");

    const hours =
      item.open_time || item.close_time
        ? `${item.open_time || ""}${item.open_time || item.close_time ? "〜" : ""}${item.close_time || ""}`
        : "";

    const links = [
      item.website ? { label: "公式サイト", url: item.website } : null,
      item.instagram ? { label: "Instagram", url: item.instagram } : null,
      item.twitter ? { label: "X（旧Twitter）", url: item.twitter } : null,
      item.facebook ? { label: "Facebook", url: item.facebook } : null
    ].filter(Boolean);

    return `
      <div class="detail-top">
        <button type="button" id="detailBack" class="detail-back">← 一覧に戻る</button>
        <div class="detail-heading">
          <h2>${escapeHtml(item.name || "名称未設定")}</h2>
          ${place ? `<p class="area">${escapeHtml(place)}</p>` : ""}
        </div>
      </div>
      <div class="detail-body">

        <section class="detail-section">
          <h3>基本情報</h3>
          <div class="detail-grid">
            ${detailField("施設業態", item.business_type)}
            ${detailField("電話番号", item.phone)}
            ${detailField("住所", item.address)}
          </div>
          ${detailTags(item.usage)}
        </section>

        <section class="detail-section">
          <h3>営業時間</h3>
          <div class="detail-grid">
            ${detailField("営業時間", hours)}
            ${detailField("最終受付", item.last_entry)}
            ${detailField("定休日", item.closed_days)}
          </div>
          ${item.hours_note ? `<p class="detail-note">${escapeHtml(item.hours_note)}</p>` : ""}
        </section>

        <section class="detail-section">
          <h3>料金</h3>
          <div class="detail-grid">
            ${detailField("大人料金", item.price != null ? `${item.price}円` : "")}
            ${detailField("子ども料金", item.child_price != null ? `${item.child_price}円` : "")}
            ${detailField("その他料金", item.other_price != null ? `${item.other_price}円` : "")}
            ${detailField("料金区分", item.price_category)}
          </div>
          ${detailTags(item.payment)}
          ${item.price_note ? `<p class="detail-note">${escapeHtml(item.price_note)}</p>` : ""}
        </section>

        <section class="detail-section">
          <h3>お風呂・サウナ</h3>
          <div class="detail-grid">
            ${detailField("サウナ", item.sauna_status)}
            ${detailField("水風呂", item.cold_bath_status)}
            ${detailField("外気浴", item.outdoor)}
            ${detailField("休憩スペース", item.rest)}
          </div>
          ${detailTags(item.bath)}
          ${detailTags(item.sauna)}
          ${item.sauna_note ? `<p class="detail-note">${escapeHtml(item.sauna_note)}</p>` : ""}
        </section>

        <section class="detail-section">
          <h3>設備</h3>
          <div class="detail-grid">
            ${detailField("シャンプー等", item.amenities)}
            ${detailField("ドライヤー", item.dryer)}
            ${detailField("Wi-Fi", item.wifi)}
            ${detailField("駐車場", item.parking)}
            ${detailField("貴重品ロッカー", item.locker)}
            ${detailField("食事処", item.restaurant)}
            ${detailField("バリアフリー", item.barrier_free)}
          </div>
        </section>

        <section class="detail-section">
          <h3>泉質</h3>
          <div class="detail-grid">
            ${detailField("泉質", item.spring_type)}
            ${detailField("泉温", item.temperature != null ? `${item.temperature}℃` : "")}
            ${detailField("源泉温度", item.source_temperature != null ? `${item.source_temperature}℃` : "")}
            ${detailField("加温", item.heating)}
          </div>
          ${item.spring_detail ? `<p class="detail-note">${escapeHtml(item.spring_detail)}</p>` : ""}
        </section>

        ${
          Array.isArray(item.rental_items) && item.rental_items.length
            ? `
              <section class="detail-section">
                <h3>レンタル品</h3>
                <ul class="rental-list">
                  ${item.rental_items.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
                </ul>
              </section>
            `
            : ""
        }

        ${
          links.length
            ? `
              <section class="detail-section">
                <h3>公式情報・SNS</h3>
                <div class="detail-links">
                  ${links
                    .map(
                      (l) =>
                        `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
                    )
                    .join("")}
                </div>
              </section>
            `
            : ""
        }

        ${
          item.note
            ? `
              <section class="detail-section">
                <h3>メモ・施設紹介</h3>
                <p class="detail-note">${escapeHtml(item.note)}</p>
              </section>
            `
            : ""
        }

      </div>
    `;
  }

  async function showDetail(id) {
    const listView = $("listView");
    const detailView = $("detailView");
    if (!detailView) return;

    listView?.classList.add("hidden");
    detailView.classList.remove("hidden");
    detailView.innerHTML = `<div class="detail-empty">読み込んでいます…</div>`;
    window.scrollTo(0, 0);

    const item = await fetchItemById(id);

    if (!item) {
      detailView.innerHTML = `
        <div class="detail-empty">
          この温泉は見つかりませんでした。
          <p><button type="button" id="detailBack" class="detail-back">← 一覧に戻る</button></p>
        </div>
      `;
      $("detailBack")?.addEventListener("click", () => {
        location.hash = "";
      });
      return;
    }

    detailView.innerHTML = renderDetailHTML(item);
    $("detailBack")?.addEventListener("click", () => {
      location.hash = "";
    });
  }

  function showList() {
    const listView = $("listView");
    const detailView = $("detailView");
    if (!listView || !detailView) return;

    detailView.classList.add("hidden");
    detailView.innerHTML = "";
    listView.classList.remove("hidden");
  }

  function route() {
    const match = location.hash.match(/^#detail-(.+)$/);
    if (match) {
      showDetail(decodeURIComponent(match[1]));
    } else {
      showList();
    }
  }

  // ---------------------------------------------------------
  // 一覧データ取得
  // Supabaseが使える → Supabase
  // 使えない → LocalStorage
  // ---------------------------------------------------------

  async function loadAll() {
    setStatus("温泉一覧を読み込んでいます…");

    try {
      if (supabaseClient) {
        const data = await loadSupabaseData();

        // Supabaseにデータがある場合はそれを表示。
        // 0件ならローカルデータも確認する。
        if (data.length > 0) {
          renderCards(data);
          setStatus(`Supabaseから${data.length}件読み込みました。`, "ok");
          return;
        }
      }

      const localData = getLocalData();
      renderCards(localData);

      if (supabaseClient) {
        setStatus(
          localData.length
            ? `Supabaseは0件のため、この端末の保存データ${localData.length}件を表示しています。`
            : "Supabaseに温泉がまだ登録されていません。",
          localData.length ? "ok" : ""
        );
      } else {
        setStatus(
          localData.length
            ? `この端末の保存データ${localData.length}件を表示しています。`
            : "Supabase未設定です。まず設定すると、みんなで共有できます。",
          localData.length ? "ok" : ""
        );
      }
    } catch (error) {
      const localData = getLocalData();
      renderCards(localData);

      setStatus(
        localData.length
          ? `Supabaseの読込に失敗したため、この端末の保存データ${localData.length}件を表示しています。`
          : `Supabaseの読込に失敗しました：${error.message || "不明なエラー"}`,
        "error"
      );
    }
  }

  // ---------------------------------------------------------
  // 保存
  // ---------------------------------------------------------

  async function saveOnsen(event) {
    event.preventDefault();

    const item = collectFormData();

    if (!item.name) {
      alert("温泉名を入力してください。");
      $("name")?.focus();
      return;
    }

    const saveButton =
      document.querySelector('#form button[type="submit"]') ||
      document.querySelector('#form button:not(#cancel)');

    if (saveButton) {
      saveButton.disabled = true;
    }

    try {
      if (supabaseClient) {
        const saved = await insertSupabaseData(item);

        // Supabase保存成功
        setStatus("温泉を登録しました。", "ok");
        resetForm();

        // 保存直後に再読込 → 一覧へ即反映
        await loadAll();

        alert(`「${saved?.name || item.name}」を登録しました。`);
      } else {
        // Supabase未設定でも、登録内容を失わない
        addLocalData(item);

        resetForm();
        await loadAll();

        alert(
          "温泉を登録しました。\n\n" +
          "現在はSupabaseのURL・anon keyが未設定なので、" +
          "この端末に保存しています。"
        );
      }
    } catch (error) {
      console.error(error);

      // Supabase保存に失敗しても、入力内容をローカルへ退避
      try {
        addLocalData(item);
        await loadAll();
      } catch (_) {}

      alert(
        "保存できませんでした。\n\n" +
        `詳細：${error.message || "Supabaseへの保存に失敗しました。"}\n\n` +
        "入力内容はこの端末にも保存しました。"
      );

      setStatus("Supabase保存失敗。端末保存へ切り替えました。", "error");
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
      }
    }
  }

  // ---------------------------------------------------------
  // フォーム初期化
  // ---------------------------------------------------------

  function resetForm() {
    const form = $("form");
    if (!form) return;

    form.reset();

    // 動的なレンタル欄は空に戻す
    const rentalRows = $("rentalRows");
    if (rentalRows) {
      rentalRows.innerHTML = "";
    }
  }

  // ---------------------------------------------------------
  // イベント
  // ---------------------------------------------------------

  function setupEvents() {
    $("form")?.addEventListener("submit", saveOnsen);

    $("search")?.addEventListener("input", () => {
      // 検索時は現在表示できるデータを再取得
      if (window.__onsenData) {
        renderCards(window.__onsenData);
      } else {
        renderCards(getLocalData());
      }
    });

    $("add")?.addEventListener("click", () => {
      const modal = $("modal");
      if (!modal) return;

      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    });

    $("close")?.addEventListener("click", closeModal);
    $("cancel")?.addEventListener("click", closeModal);

    $("modal")?.addEventListener("click", (event) => {
      if (event.target === $("modal")) {
        closeModal();
      }
    });

    // カードクリック・Enterキーで詳細画面へ
    $("cards")?.addEventListener("click", (event) => {
      if (event.target.closest("a")) return; // 外部リンクはそのまま開く

      const card = event.target.closest(".card");
      if (!card) return;

      const id = card.getAttribute("data-id");
      if (id) location.hash = `detail-${encodeURIComponent(id)}`;
    });

    $("cards")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      const card = event.target.closest(".card");
      if (!card) return;

      event.preventDefault();
      const id = card.getAttribute("data-id");
      if (id) location.hash = `detail-${encodeURIComponent(id)}`;
    });

    window.addEventListener("hashchange", route);
  }

  function closeModal() {
    const modal = $("modal");
    if (!modal) return;

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  // renderCardsをデータ保持にも対応させる
  const originalRenderCards = renderCards;

  window.__onsenData = [];

  function renderCardsWithData(list) {
    window.__onsenData = Array.isArray(list) ? list : [];
    originalRenderCards(window.__onsenData);
  }

  // ---------------------------------------------------------
  // 起動
  // ---------------------------------------------------------

  async function start() {
    setupEvents();

    // 既存の関数から使えるようにする
    window.onsenApp = {
      loadAll,
      saveOnsen,
      getLocalData,
      collectFormData
    };

    // renderCardsを差し替え
    window.__renderOnsenCards = renderCardsWithData;

    // loadAll内部からは元renderCardsを使うため、
    // ここではデータを取得して直接描画する
    try {
      setStatus("温泉一覧を読み込んでいます…");

      let data = [];

      if (supabaseClient) {
        try {
          data = await loadSupabaseData();
        } catch (error) {
          console.error(error);
        }
      }

      if (!data.length) {
        data = getLocalData();
      }

      window.__onsenData = data;
      originalRenderCards(data);

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        setStatus(
          data.length
            ? `この端末の保存データ${data.length}件を表示中（Supabase未設定）`
            : "Supabase未設定です。端末保存で登録できます。",
          data.length ? "ok" : ""
        );
      } else {
        setStatus(`${data.length}件の温泉を読み込みました。`, "ok");
      }
    } catch (error) {
      console.error(error);

      const localData = getLocalData();
      window.__onsenData = localData;
      originalRenderCards(localData);

      setStatus(
        `一覧の読込に失敗しました：${error.message || "不明なエラー"}`,
        "error"
      );
    }

    // URLに #detail-xxx が含まれていれば詳細画面から開始
    route();
  }

  // DOMContentLoaded後に開始
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
