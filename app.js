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

  function checkedBool(id) {
    const el = $(id);
    return !!el?.checked;
  }

  function timeValue(prefix) {
    const hour = $(`${prefix}Hour`)?.value || "";
    const minute = $(`${prefix}Minute`)?.value || "";
    if (!hour || !minute) return "";
    return `${hour}:${minute}`;
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
  // #rentalRows に行を動的に追加・削除できるようにする
  // ---------------------------------------------------------

  let rentalRowSeq = 0;

  function addRentalRow(name = "", price = "", { focus = true } = {}) {
    const rows = $("rentalRows");
    if (!rows) return;

    const rowId = `rental-${++rentalRowSeq}`;
    const row = document.createElement("div");
    row.className = "rental-row";
    row.dataset.rowId = rowId;

    row.innerHTML = `
      <input type="text" class="rental-name" name="rental-name-${rowId}" autocomplete="off" placeholder="例：タオル" maxlength="60" value="${escapeHtml(name)}">
      <input type="number" class="rental-price" name="rental-price-${rowId}" autocomplete="off" placeholder="料金（円）" min="0" value="${escapeHtml(price)}">
      <button type="button" class="remove-rental" aria-label="このレンタル品を削除">×</button>
    `;

    rows.appendChild(row);
    if (focus) {
      row.querySelector(".rental-name")?.focus();
    }
  }

  function collectRentalItems() {
    const rows = $("rentalRows");
    if (!rows) return [];

    const result = [];

    rows.querySelectorAll(".rental-row").forEach((row) => {
      const name = row.querySelector(".rental-name")?.value.trim() || "";
      const price = row.querySelector(".rental-price")?.value.trim() || "";

      if (!name && !price) return;

      result.push(price ? `${name || "レンタル品"}（${price}円）` : name);
    });

    return result;
  }

  // ---------------------------------------------------------
  // 料金（入浴料・その他料金区分）
  // 「区分」「料金」を動的に追加・削除できる汎用の行システム
  // ---------------------------------------------------------

  let feeRowSeq = 0;

  function addFeeRow(containerId, category = "", amount = "", { focus = true } = {}) {
    const rows = $(containerId);
    if (!rows) return;

    const rowId = `fee-${++feeRowSeq}`;
    const row = document.createElement("div");
    row.className = "rental-row";
    row.dataset.rowId = rowId;

    row.innerHTML = `
      <input type="text" class="fee-category" name="fee-category-${rowId}" autocomplete="off" placeholder="区分（例：大人）" maxlength="40" value="${escapeHtml(category)}">
      <input type="number" class="fee-amount" name="fee-amount-${rowId}" autocomplete="off" placeholder="料金（円）" min="0" value="${escapeHtml(amount)}">
      <button type="button" class="remove-rental" aria-label="この項目を削除">×</button>
    `;

    rows.appendChild(row);
    if (focus) {
      row.querySelector(".fee-category")?.focus();
    }
  }

  function collectFeeRows(containerId) {
    const rows = $(containerId);
    if (!rows) return [];

    const result = [];

    rows.querySelectorAll(".rental-row").forEach((row) => {
      const category = row.querySelector(".fee-category")?.value.trim() || "";
      const amount = row.querySelector(".fee-amount")?.value.trim() || "";

      // 料金が未入力の行は保存しない（区分だけの空行を除外）
      if (!amount) return;

      result.push({ category: category || "料金", amount: Number(amount) });
    });

    return result;
  }

  const DEFAULT_BATH_FEE_CATEGORIES = [
    "大人",
    "子ども",
    "小学生",
    "幼児",
    "乳幼児",
    "シニア",
    "障がい者",
    "介助者",
    "その他の料金対象"
  ];

  const DEFAULT_OTHER_FEE_CATEGORIES = [
    "貸切風呂",
    "家族風呂",
    "サウナ",
    "岩盤浴",
    "休憩施設",
    "会員料",
    "その他料金区分"
  ];

  // ---------------------------------------------------------
  // フォーム → 保存データ
  // ---------------------------------------------------------

  function collectFormData() {
    return {
      name: value("name"),
      prefecture: value("prefecture"),
      area: value("area"),
      address: value("address"),
      business_type:
        value("businessType") === "その他" && value("businessTypeOther")
          ? value("businessTypeOther")
          : value("businessType"),
      phone: value("phone"),
      nearest_station: value("nearestStation"),
      access_method: value("accessMethod"),

      open_time: timeValue("openTime"),
      close_time: timeValue("closeTime"),
      last_entry: timeValue("lastEntry"),
      closed_days: checkedValues("closedDay"),
      is_temp_closed: checkedBool("tempClosed"),
      is_closed: checkedBool("closedPermanently"),
      hours_note: value("hoursNote"),

      usage: [
        ...checkedValues("usage"),
        ...(checkedBool("usageOtherCheck")
          ? [value("usageOther") || "その他"]
          : [])
      ],

      bath_fees: collectFeeRows("bathFeeRows"),
      other_fees: collectFeeRows("otherFeeRows"),
      purchase_method:
        radioValue("purchaseMethod") === "その他" && value("purchaseMethodOther")
          ? value("purchaseMethodOther")
          : radioValue("purchaseMethod"),
      payment: [
        ...checkedValues("payment"),
        ...(checkedBool("paymentOtherCheck")
          ? [value("paymentOther") || "その他"]
          : [])
      ],
      point_card: radioValue("pointCard"),
      membership_card: radioValue("membershipCard"),
      wristband_payment: radioValue("wristbandPayment"),
      price_note: value("priceNote"),

      website: value("website"),
      instagram: value("instagram"),
      twitter: value("twitter"),
      facebook: value("facebook"),

      bath_shape: [
        ...checkedValues("bathShape"),
        ...(checkedBool("bathShapeOtherCheck")
          ? [value("bathShapeOther") || "その他の形状"]
          : [])
      ],
      bath_function: [
        ...checkedValues("bathFunction"),
        ...(checkedBool("bathFunctionOtherCheck")
          ? [value("bathFunctionOther") || "その他の機能・種類"]
          : [])
      ],
      private_bath_duration: numberValue("privateBathDuration"),
      private_bath_note: value("privateBathNote"),
      bath_location: [
        ...checkedValues("bathLocation"),
        ...(checkedBool("bathLocationOtherCheck")
          ? [value("bathLocationOther") || "その他"]
          : [])
      ],
      bath_anteroom: radioValue("bathAnteroom"),
      bath_event: radioValue("bathEvent"),
      bath_event_detail: value("bathEventDetail"),
      bath_toys: radioValue("bathToys"),
      bath_toys_detail: value("bathToysDetail"),
      bath_note: value("bathNote"),

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

  function detailPhoneField(label, phone) {
    if (!phone) return "";

    const telHref = phone.replace(/[^0-9+]/g, "");
    return `
      <div class="detail-item">
        <dt>${escapeHtml(label)}</dt>
        <dd><a class="detail-phone" href="tel:${escapeHtml(telHref)}">${escapeHtml(phone)}</a></dd>
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

  function detailSubhead(title) {
    return `<h4 class="detail-subhead">${escapeHtml(title)}</h4>`;
  }

  function renderFeeList(fees) {
    if (!Array.isArray(fees) || !fees.length) {
      return `<p class="detail-note-tight">情報がありません。</p>`;
    }

    return `
      <ul class="rental-list">
        ${fees
          .map((f) => `<li>${escapeHtml(f.category)}：${f.amount != null ? `${f.amount}円` : "料金不明"}</li>`)
          .join("")}
      </ul>
    `;
  }

  const BUSINESS_TYPE_STYLES = {
    "日帰り温泉": { emoji: "♨️", bg: "#d64545", color: "#fff" },
    "銭湯・公衆浴場": { emoji: "♨️", bg: "#8b5e3c", color: "#fff" },
    "スーパー銭湯": { emoji: "♨️", bg: "#e8c300", color: "#4a3b00" },
    "温泉旅館": { emoji: "🛌", bg: "#7c5cbf", color: "#fff" },
    "ホテル": { emoji: "🏨", bg: "#7c5cbf", color: "#fff" },
    "サウナ施設": { emoji: "🧖‍♀️", bg: "#e0761f", color: "#fff" },
    "スパ施設": { emoji: "💆‍♀️", bg: "#6b8e23", color: "#fff" },
    "プール施設": { emoji: "🏊", bg: "#3b6fd6", color: "#fff" },
    "アウトドア施設": { emoji: "🏕", bg: "#3f9142", color: "#fff" },
    "スポーツジム": { emoji: "🏃‍♀️", bg: "#4fb3d9", color: "#fff" },
    "複合施設": { emoji: "🎡", bg: "#e0629c", color: "#fff" }
  };

  function renderBusinessTypeBadge(businessType) {
    if (!businessType) {
      return `<p class="detail-note-tight">情報がありません。</p>`;
    }

    const style = BUSINESS_TYPE_STYLES[businessType] || {
      emoji: "🏳️",
      bg: "#8a968f",
      color: "#fff"
    };

    return `
      <p class="detail-note-tight">
        <span class="type-badge" style="background:${style.bg};color:${style.color}">
          ${style.emoji} ${escapeHtml(businessType)}
        </span>
      </p>
    `;
  }

  function getOpenStatus(item) {
    // 将来的なフラグ（閉鎖・臨時休業）に対応
    if (item.is_closed) {
      return { label: "閉鎖中", className: "status-closed-permanently" };
    }
    if (item.is_temp_closed) {
      return { label: "臨時休業中", className: "status-temp-closed" };
    }

    const weekdayChars = ["日", "月", "火", "水", "木", "金", "土"];
    const now = new Date();
    const todayChar = weekdayChars[now.getDay()];

    // 定休日（曜日の複数選択）に今日が含まれていれば定休日と判定
    if (Array.isArray(item.closed_days) && item.closed_days.includes(todayChar)) {
      return { label: "定休日", className: "status-holiday" };
    }

    if (!item.open_time || !item.close_time) return null;

    const toMinutes = (t) => {
      const [h, m] = t.split(":").map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    };

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes = toMinutes(item.open_time);
    const closeMinutes = toMinutes(item.close_time);
    if (openMinutes == null || closeMinutes == null) return null;

    let isOpen;
    if (closeMinutes > openMinutes) {
      isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    } else {
      // 閉店時刻が開店時刻より前＝日をまたぐ営業
      isOpen = nowMinutes >= openMinutes || nowMinutes < closeMinutes;
    }

    return isOpen
      ? { label: "現在 営業中", className: "status-open" }
      : { label: "営業時間外", className: "status-closed-hours" };
  }

  function renderDetailHTML(item) {
    const place = [item.prefecture, item.area]
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

    const status = getOpenStatus(item);

    return `
      <div class="detail-toolbar">
        <button type="button" id="detailBack" class="detail-back">← 一覧に戻る</button>
        <div class="detail-toolbar-actions">
          <button type="button" id="detailEdit" class="detail-action">✏️ 情報を編集する</button>
          <button type="button" id="detailShare" class="detail-action">↗️ 共有する</button>
        </div>
      </div>
      <div class="detail-heading-block">
        ${place ? `<p class="detail-location">📍 ${escapeHtml(place)}</p>` : ""}
        <h2>${escapeHtml(item.name || "名称未設定")}</h2>
        ${status ? `<span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>` : ""}
      </div>
      <div class="detail-body">

        <!-- 基本情報（営業時間・料金・公式SNS・メモを含む） -->
        <section class="detail-section">
          <h3>🏷️ 基本情報</h3>

          ${detailSubhead("🏢 施設業態")}
          ${renderBusinessTypeBadge(item.business_type)}

          <div class="detail-gap"></div>

          ${detailSubhead("📝 利用条件")}
          ${detailTags(item.usage) || `<p class="detail-note">情報がありません。</p>`}

          ${detailSubhead("📍 住所")}
          <p class="detail-note">${item.address ? escapeHtml(item.address) : "情報がありません。"}</p>

          ${detailSubhead("🚶‍♀️ アクセス方法")}
          ${
            item.nearest_station
              ? `${detailSubhead("🚉 最寄り駅")}<p class="detail-note">${escapeHtml(item.nearest_station)}</p>`
              : ""
          }
          <p class="detail-note">${item.access_method ? escapeHtml(item.access_method) : "情報がありません。"}</p>

          ${detailSubhead("📞 電話番号")}
          <p class="detail-note">${
            item.phone
              ? `<a class="detail-phone" href="tel:${escapeHtml(item.phone.replace(/[^0-9+]/g, ""))}">${escapeHtml(item.phone)}</a>`
              : "情報がありません。"
          }</p>

          <div class="detail-gap"></div>

          ${detailSubhead("🕒 営業時間")}
          <div class="detail-grid">
            ${detailField("営業時間", hours)}
            ${detailField("最終受付", item.last_entry)}
          </div>
          ${item.hours_note ? `<p class="detail-note">${escapeHtml(item.hours_note)}</p>` : ""}

          ${detailSubhead("🗓 定休日")}
          ${
            Array.isArray(item.closed_days) && item.closed_days.length
              ? detailTags(item.closed_days.map((d) => `${d}曜日`))
              : `<p class="detail-note">情報がありません。</p>`
          }
          ${
            item.is_temp_closed || item.is_closed
              ? detailTags(
                  [
                    item.is_temp_closed ? "臨時休業中" : null,
                    item.is_closed ? "閉鎖済み" : null
                  ].filter(Boolean)
                )
              : ""
          }

          ${
            links.length
              ? `
                ${detailSubhead("📱 公式情報・SNS")}
                <div class="detail-links">
                  ${links
                    .map(
                      (l) =>
                        `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
                    )
                    .join("")}
                </div>
              `
              : ""
          }

          ${
            item.note
              ? `
                ${detailSubhead("メモ・施設紹介")}
                <p class="detail-note">${escapeHtml(item.note)}</p>
              `
              : ""
          }
        </section>

        <!-- 料金（入浴料・その他料金区分・決済方法など） -->
        <section class="detail-section">
          <h3>💰 料金</h3>

          ${detailSubhead("♨️ 入浴料")}
          ${renderFeeList(item.bath_fees)}

          <div class="detail-gap"></div>

          ${detailSubhead("🧖‍♀️ その他料金区分")}
          ${renderFeeList(item.other_fees)}

          <div class="detail-gap"></div>

          ${detailSubhead("💳 購入方法")}
          <p class="detail-note-tight">${item.purchase_method ? escapeHtml(item.purchase_method) : "情報がありません。"}</p>

          ${detailSubhead("👛 決済方法")}
          ${
            detailTags(item.payment) ||
            `<p class="detail-note-tight">情報がありません。</p>`
          }

          ${detailSubhead("💳 ポイントカード")}
          <p class="detail-note-tight">${escapeHtml(item.point_card || "不明")}</p>

          ${detailSubhead("🪪 会員証")}
          <p class="detail-note-tight">${escapeHtml(item.membership_card || "不明")}</p>

          ${detailSubhead("⌚️ リストバンド決済")}
          <p class="detail-note-tight">${escapeHtml(item.wristband_payment || "不明")}</p>

          ${
            item.price_note
              ? `<div class="detail-gap"></div><p class="field-title">補足</p><p class="detail-note">${escapeHtml(item.price_note)}</p>`
              : ""
          }
        </section>

        <!-- 施設情報（浴場・浴槽） -->
        <section class="detail-section">
          <h3>🛀 施設情報</h3>

          ${detailSubhead("♨️ 浴場・浴槽の形状")}
          ${detailTags(item.bath_shape) || `<p class="detail-note-tight">情報がありません。</p>`}

          ${detailSubhead("🛀 浴槽の機能・種類")}
          ${detailTags(item.bath_function) || `<p class="detail-note-tight">情報がありません。</p>`}

          ${detailSubhead("👨‍👩‍👧‍👦 家族風呂・貸切風呂の詳細情報")}
          <div class="detail-grid">
            ${detailField("時間", item.private_bath_duration != null ? `${item.private_bath_duration}分` : "")}
          </div>
          ${item.private_bath_note ? `<p class="detail-note">${escapeHtml(item.private_bath_note)}</p>` : ""}

          ${detailSubhead("♨️ 浴場の場所")}
          ${detailTags(item.bath_location) || `<p class="detail-note-tight">情報がありません。</p>`}

          ${detailSubhead("♨️ 浴場前室")}
          <p class="detail-note-tight">${escapeHtml(item.bath_anteroom || "不明")}</p>

          ${detailSubhead("♨️ 浴場・浴槽内の期間限定イベント")}
          <p class="detail-note-tight">${escapeHtml(item.bath_event || "不明")}</p>
          ${item.bath_event_detail ? `<p class="detail-note">${escapeHtml(item.bath_event_detail)}</p>` : ""}

          ${detailSubhead("♨️ 浴槽内の小物（ゆず、あひる等）")}
          <p class="detail-note-tight">${escapeHtml(item.bath_toys || "不明")}</p>
          ${item.bath_toys_detail ? `<p class="detail-note">${escapeHtml(item.bath_toys_detail)}</p>` : ""}

          ${
            item.bath_note
              ? `${detailSubhead("♨️ その他 浴場・浴槽の補足事項")}<p class="detail-note">${escapeHtml(item.bath_note)}</p>`
              : ""
          }
        </section>

        <!-- アメニティ -->
        <section class="detail-section">
          <h3>🧴 アメニティ・備品</h3>
          <div class="detail-grid">
            ${detailField("シャンプー等", item.amenities)}
            ${detailField("ドライヤー", item.dryer)}
            ${detailField("Wi-Fi", item.wifi)}
            ${detailField("駐車場", item.parking)}
            ${detailField("貴重品ロッカー", item.locker)}
            ${detailField("食事処", item.restaurant)}
            ${detailField("バリアフリー", item.barrier_free)}
          </div>
          ${
            Array.isArray(item.rental_items) && item.rental_items.length
              ? `
                <p class="field-title">レンタル品</p>
                <ul class="rental-list">
                  ${item.rental_items.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
                </ul>
              `
              : ""
          }
        </section>

        <!-- 温泉情報（泉質） -->
        <section class="detail-section">
          <h3>温泉情報</h3>

          ${detailSubhead("泉質")}
          <div class="detail-grid">
            ${detailField("泉質", item.spring_type)}
            ${detailField("泉温", item.temperature != null ? `${item.temperature}℃` : "")}
            ${detailField("源泉温度", item.source_temperature != null ? `${item.source_temperature}℃` : "")}
            ${detailField("加温", item.heating)}
          </div>
          ${item.spring_detail ? `<p class="detail-note">${escapeHtml(item.spring_detail)}</p>` : ""}
        </section>

        <!-- サウナ情報（サウナ本体・水風呂・外気浴） -->
        <section class="detail-section">
          <h3>サウナ情報</h3>

          ${detailSubhead("サウナ本体")}
          <div class="detail-grid">
            ${detailField("サウナ", item.sauna_status)}
          </div>
          ${detailTags(item.sauna)}
          ${item.sauna_note ? `<p class="detail-note">${escapeHtml(item.sauna_note)}</p>` : ""}

          ${detailSubhead("水風呂")}
          <div class="detail-grid">
            ${detailField("水風呂", item.cold_bath_status)}
          </div>

          ${detailSubhead("外気浴")}
          <div class="detail-grid">
            ${detailField("外気浴", item.outdoor)}
            ${detailField("休憩スペース", item.rest)}
          </div>
        </section>

        <!-- 地図情報 -->
        ${
          item.lat != null && item.lng != null
            ? `
              <section class="detail-section">
                <h3>地図情報</h3>
                <div class="detail-grid">
                  ${detailField("緯度", item.lat)}
                  ${detailField("経度", item.lng)}
                </div>
                <p class="detail-links">
                  <a href="https://www.google.com/maps?q=${escapeHtml(item.lat)},${escapeHtml(item.lng)}" target="_blank" rel="noopener">Googleマップで見る</a>
                </p>
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

    $("detailEdit")?.addEventListener("click", () => {
      alert("編集機能は現在準備中です。もうしばらくお待ちください。");
    });

    $("detailShare")?.addEventListener("click", async () => {
      const shareData = {
        title: item.name || "温泉データベース",
        text: `${item.name || "温泉情報"}の詳細ページ`,
        url: location.href
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (error) {
          // ユーザーによるキャンセル等は無視
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(location.href);
        alert("リンクをコピーしました。");
      } catch (error) {
        console.error("共有リンクのコピーに失敗:", error);
      }
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

    // 動的なレンタル欄・料金欄は空に戻す
    const rentalRows = $("rentalRows");
    if (rentalRows) {
      rentalRows.innerHTML = "";
    }
    const bathFeeRows = $("bathFeeRows");
    if (bathFeeRows) {
      bathFeeRows.innerHTML = "";
    }
    const otherFeeRows = $("otherFeeRows");
    if (otherFeeRows) {
      otherFeeRows.innerHTML = "";
    }

    // 「その他」の自由記述欄も隠しておく
    $("businessTypeOtherWrap")?.classList.add("hidden");
    $("usageOther")?.classList.add("hidden");
    $("purchaseMethodOtherWrap")?.classList.add("hidden");
    $("paymentOther")?.classList.add("hidden");
    $("bathShapeOther")?.classList.add("hidden");
    $("bathFunctionOther")?.classList.add("hidden");
    $("bathLocationOther")?.classList.add("hidden");
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

      // レンタル品欄が空なら、まず1行用意しておく（フォーカスは奪わない）
      const rentalRows = $("rentalRows");
      if (rentalRows && !rentalRows.children.length) {
        addRentalRow("", "", { focus: false });
      }

      // 入浴料・その他料金区分も、空ならデフォルトの区分名で行を用意しておく
      const bathFeeRows = $("bathFeeRows");
      if (bathFeeRows && !bathFeeRows.children.length) {
        DEFAULT_BATH_FEE_CATEGORIES.forEach((category) =>
          addFeeRow("bathFeeRows", category, "", { focus: false })
        );
      }

      const otherFeeRows = $("otherFeeRows");
      if (otherFeeRows && !otherFeeRows.children.length) {
        DEFAULT_OTHER_FEE_CATEGORIES.forEach((category) =>
          addFeeRow("otherFeeRows", category, "", { focus: false })
        );
      }

      // モーダルを開いたら温泉名欄にフォーカス
      setTimeout(() => $("name")?.focus(), 0);
    });

    $("addRental")?.addEventListener("click", () => addRentalRow());
    $("addBathFee")?.addEventListener("click", () => addFeeRow("bathFeeRows"));
    $("addOtherFee")?.addEventListener("click", () => addFeeRow("otherFeeRows"));

    // 施設業態で「その他」を選んだ時だけ自由記述欄を表示
    $("businessType")?.addEventListener("change", (event) => {
      const wrap = $("businessTypeOtherWrap");
      if (!wrap) return;
      wrap.classList.toggle("hidden", event.target.value !== "その他");
    });

    // 利用条件の「その他」にチェックが入った時だけ自由記述欄を表示
    $("usageOtherCheck")?.addEventListener("change", (event) => {
      const other = $("usageOther");
      if (!other) return;
      other.classList.toggle("hidden", !event.target.checked);
    });

    // 購入方法で「その他」を選んだ時だけ自由記述欄を表示
    document.querySelectorAll('input[name="purchaseMethod"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const wrap = $("purchaseMethodOtherWrap");
        if (!wrap) return;
        wrap.classList.toggle("hidden", radioValue("purchaseMethod") !== "その他");
      });
    });

    // 決済方法の「その他」にチェックが入った時だけ自由記述欄を表示
    $("paymentOtherCheck")?.addEventListener("change", (event) => {
      const other = $("paymentOther");
      if (!other) return;
      other.classList.toggle("hidden", !event.target.checked);
    });

    // 浴場・浴槽関連の「その他」チェックボックスも同様にトグル
    [
      ["bathShapeOtherCheck", "bathShapeOther"],
      ["bathFunctionOtherCheck", "bathFunctionOther"],
      ["bathLocationOtherCheck", "bathLocationOther"]
    ].forEach(([checkId, inputId]) => {
      $(checkId)?.addEventListener("change", (event) => {
        const other = $(inputId);
        if (!other) return;
        other.classList.toggle("hidden", !event.target.checked);
      });
    });

    $("rentalRows")?.addEventListener("click", (event) => {
      const button = event.target.closest(".remove-rental");
      if (!button) return;

      button.closest(".rental-row")?.remove();
    });

    $("bathFeeRows")?.addEventListener("click", (event) => {
      const button = event.target.closest(".remove-rental");
      if (!button) return;

      button.closest(".rental-row")?.remove();
    });

    $("otherFeeRows")?.addEventListener("click", (event) => {
      const button = event.target.closest(".remove-rental");
      if (!button) return;

      button.closest(".rental-row")?.remove();
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
