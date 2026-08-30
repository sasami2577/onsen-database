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
  let editingId = null;

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

  function dateValue(prefix) {
    const year = $(`${prefix}Year`)?.value || "";
    const month = $(`${prefix}Month`)?.value || "";
    const day = $(`${prefix}Day`)?.value || "";
    if (!year) return "";
    const mm = month ? String(month).padStart(2, "0") : "";
    const dd = day ? String(day).padStart(2, "0") : "";
    return [year, mm, dd].filter(Boolean).join("-");
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
      bath_handrail: radioValue("bathHandrail"),
      toiletry_shelf: radioValue("toiletryShelf"),
      bath_anteroom: radioValue("bathAnteroom"),
      bath_event: radioValue("bathEvent"),
      bath_event_detail: value("bathEventDetail"),
      bath_toys: radioValue("bathToys"),
      bath_toys_detail: value("bathToysDetail"),
      bath_note: value("bathNote"),

      // ♨️ 温泉情報
      spring_types: [
        ...checkedValues("springTypes"),
        ...(checkedBool("springTypeOtherCheck")
          ? [value("springTypeOther") || "その他の泉質"]
          : [])
      ],
      indications: [
        ...checkedValues("indications"),
        ...(value("indicationsOther") ? [value("indicationsOther")] : [])
      ],
      spring_color: [
        ...checkedValues("springColor"),
        ...(checkedBool("springColorOtherCheck")
          ? [value("springColorOther") || "その他の色"]
          : [])
      ],
      spring_smell: [
        ...checkedValues("springSmell"),
        ...(checkedBool("springSmellOtherCheck")
          ? [value("springSmellOther") || "その他の匂い"]
          : [])
      ],
      spring_texture: [
        ...checkedValues("springTexture"),
        ...(checkedBool("springTextureOtherCheck")
          ? [value("springTextureOther") || "その他"]
          : [])
      ],
      source_free_flow: radioValue("sourceFreeFlow"),
      spring_dilution: radioValue("springDilution"),
      spring_heating: radioValue("springHeating"),
      spring_circulation: radioValue("springCirculation"),
      spring_disinfection: radioValue("springDisinfection"),
      spring_usage_note: value("springUsageNote"),
      spring_temperature: numberValue("springTemperature"),
      source_temperature: numberValue("sourceTemperature"),
      spring_ph: numberValue("springPh"),
      spring_source_name: value("springSourceName"),
      spring_open_year: numberValue("springOpenYear"),
      spring_open_year_note: value("springOpenYearNote"),
      spring_analysis: radioValue("springAnalysis"),
      spring_analysis_date: dateValue("springAnalysis"),
      legionella_test: radioValue("legionellaTest"),
      legionella_test_date: dateValue("legionella"),
      legionella_result: radioValue("legionellaResult"),
      spring_info_source: [
        ...checkedValues("springInfoSource"),
        ...(checkedBool("springInfoSourceOtherCheck")
          ? [value("springInfoSourceOther") || "その他"]
          : [])
      ],
      spring_info_check_date: dateValue("springInfoCheck"),
      child_mixed_bathing: radioValue("childMixedBathing"),
      child_age_limit: radioValue("childAgeLimit"),
      child_gender_limit: radioValue("childGenderLimit"),
      child_boy_age_limit: numberValue("childBoyAgeLimit"),
      child_girl_age_limit: numberValue("childGirlAgeLimit"),
      child_mixed_bathing_note: value("childMixedBathingNote"),
      child_info_source: [
        ...checkedValues("childInfoSource"),
        ...(checkedBool("childInfoSourceOtherCheck")
          ? [value("childInfoSourceOther") || "その他"]
          : [])
      ],
      child_info_check_date: dateValue("childInfoCheck"),

      sauna_note: value("saunaNote"),
      sauna: checkedValues("sauna"),
      sauna_status: value("saunaStatus"),
      cold_bath_status: value("coldBathStatus"),

      outdoor: radioValue("outdoor"),
      rest: radioValue("rest"),
      wifi: radioValue("wifi"),
      parking: radioValue("parking"),
      locker: radioValue("locker"),
      restaurant: radioValue("restaurant"),
      barrier_free: radioValue("barrierFree"),

      // 🚿 シャワー
      shower_count: value("showerCount"),
      shower_type: [
        ...checkedValues("showerType"),
        ...(checkedBool("showerTypeOtherCheck")
          ? [value("showerTypeOther") || "その他"]
          : [])
      ],
      shower_head_info: value("showerHeadInfo"),
      shower_faucet: radioValue("showerFaucet"),
      shower_booth: radioValue("showerBooth"),
      wash_area_divider: radioValue("washAreaDivider"),
      pre_rinse_water: radioValue("preRinseWater"),
      shower_note: value("showerNote"),

      // 🧴 アメニティ・備品
      shampoo_conditioner: radioValue("shampooConditioner"),
      body_soap: radioValue("bodySoap"),
      soap: radioValue("soap"),
      face_wash: radioValue("faceWash"),
      cleansing: radioValue("cleansing"),
      basin: radioValue("basin"),
      bath_chair: radioValue("bathChair"),
      shower_chair: radioValue("showerChair"),
      rental_items: collectRentalItems(),
      dryer_status: radioValue("dryerStatus"),
      dryer_count: value("dryerCount"),
      dryer_fee: radioValue("dryerFee"),
      dryer_brand: value("dryerBrand"),
      dryer_bring_own: radioValue("dryerBringOwn"),
      tissue: radioValue("tissue"),
      cotton_swab: radioValue("cottonSwab"),
      cosmetics: radioValue("cosmetics"),
      hair_tie: radioValue("hairTie"),
      powder_room: radioValue("powderRoom"),
      vanity: radioValue("vanity"),
      water_cooler: radioValue("waterCooler"),
      fan: radioValue("fan"),
      scale: radioValue("scale"),
      blood_pressure_monitor: radioValue("bloodPressureMonitor"),
      trash_bin: radioValue("trashBin"),
      locker_room_chair: radioValue("lockerRoomChair"),
      baby_chair: radioValue("babyChair"),
      baby_bed: radioValue("babyBed"),
      amenity_note: value("amenityNote"),

      lat: numberValue("lat"),
      lng: numberValue("lng"),
      note: value("note"),

      // アプリ側で管理する情報
      updated_at: new Date().toISOString()
    };
  }

  // ---------------------------------------------------------
  // 編集用：フォームへの値の書き戻し
  // ---------------------------------------------------------

  function setValue(id, val) {
    const el = $(id);
    if (!el) return;
    el.value = val ?? "";
  }

  function setRadioValue(name, val) {
    if (!val) return;
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = el.value === val;
    });
  }

  function setCheckboxGroup(name, knownValues, values, otherCheckId, otherInputId) {
    if (!Array.isArray(values) || !values.length) return;

    const knownSet = new Set(knownValues);

    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = values.includes(el.value);
    });

    if (!otherCheckId) return;

    const otherValues = values.filter((v) => !knownSet.has(v));
    const otherCheck = $(otherCheckId);
    const otherInput = $(otherInputId);

    if (otherCheck && otherValues.length) {
      otherCheck.checked = true;
      otherCheck.dispatchEvent(new Event("change"));
    }
    if (otherInput && otherValues.length) {
      otherInput.value = otherValues.join("、");
    }
  }

  function setTimeValue(prefix, hhmm) {
    if (!hhmm) return;
    const [h, m] = hhmm.split(":");
    if ($(`${prefix}Hour`)) $(`${prefix}Hour`).value = h || "";
    if ($(`${prefix}Minute`)) $(`${prefix}Minute`).value = m || "";
  }

  function setDateValue(prefix, dateStr) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("-");
    if ($(`${prefix}Year`)) $(`${prefix}Year`).value = y || "";
    if ($(`${prefix}Month`)) $(`${prefix}Month`).value = m ? String(Number(m)) : "";
    if ($(`${prefix}Day`)) $(`${prefix}Day`).value = d ? String(Number(d)) : "";
  }

  function populateFeeRows(containerId, fees) {
    const rows = $(containerId);
    if (!rows) return;
    rows.innerHTML = "";
    if (!Array.isArray(fees) || !fees.length) return;

    fees.forEach((f) =>
      addFeeRow(containerId, f.category || "", f.amount ?? "", { focus: false })
    );
  }

  function populateRentalItems(items) {
    const rows = $("rentalRows");
    if (!rows) return;
    rows.innerHTML = "";
    if (!Array.isArray(items) || !items.length) return;

    items.forEach((entry) => {
      const match = /^(.*)（(\d+)円）$/.exec(entry);
      if (match) {
        addRentalRow(match[1], match[2], { focus: false });
      } else {
        addRentalRow(entry, "", { focus: false });
      }
    });
  }

  function populateForm(item) {
    setValue("name", item.name);
    setValue("prefecture", item.prefecture);
    setValue("area", item.area);

    if (item.business_type && !BUSINESS_TYPE_STYLES[item.business_type]) {
      setValue("businessType", "その他");
      setValue("businessTypeOther", item.business_type);
      $("businessTypeOtherWrap")?.classList.remove("hidden");
    } else {
      setValue("businessType", item.business_type);
    }

    setCheckboxGroup(
      "usage",
      ["日帰り入浴可", "宿泊者のみ", "会員制", "要予約", "要確認", "男性専用", "女性専用", "水着着用"],
      item.usage,
      "usageOtherCheck",
      "usageOther"
    );

    setValue("address", item.address);
    setValue("phone", item.phone);
    setValue("nearestStation", item.nearest_station);
    setValue("accessMethod", item.access_method);

    setTimeValue("openTime", item.open_time);
    setTimeValue("closeTime", item.close_time);
    setTimeValue("lastEntry", item.last_entry);
    if (Array.isArray(item.closed_days)) {
      document.querySelectorAll('input[name="closedDay"]').forEach((el) => {
        el.checked = item.closed_days.includes(el.value);
      });
    }
    if (item.is_temp_closed) $("tempClosed").checked = true;
    if (item.is_closed) $("closedPermanently").checked = true;
    setValue("hoursNote", item.hours_note);

    populateFeeRows("bathFeeRows", item.bath_fees);
    populateFeeRows("otherFeeRows", item.other_fees);

    if (item.purchase_method === "券売機" || item.purchase_method === "受付購入") {
      setRadioValue("purchaseMethod", item.purchase_method);
    } else if (item.purchase_method) {
      setRadioValue("purchaseMethod", "その他");
      setValue("purchaseMethodOther", item.purchase_method);
      $("purchaseMethodOtherWrap")?.classList.remove("hidden");
    }

    setCheckboxGroup(
      "payment",
      ["現金決済", "クレジットカード", "PayPay", "楽天ペイ", "d払い", "au PAY", "QUICPay", "iD", "WAON", "楽天Edy", "交通系電子マネー"],
      item.payment,
      "paymentOtherCheck",
      "paymentOther"
    );

    setRadioValue("pointCard", item.point_card);
    setRadioValue("membershipCard", item.membership_card);
    setRadioValue("wristbandPayment", item.wristband_payment);
    setValue("priceNote", item.price_note);

    setValue("website", item.website);
    setValue("instagram", item.instagram);
    setValue("twitter", item.twitter);
    setValue("facebook", item.facebook);

    setCheckboxGroup(
      "bathShape",
      ["大浴場", "個別風呂", "露天風呂・半露天風呂", "展望風呂", "貸切風呂", "家族風呂", "内湯（宿泊者限定）", "壺湯", "釜風呂", "檜風呂", "岩風呂・石風呂", "寝湯・寝ころび湯", "立ち湯", "腰掛け湯", "洞窟風呂", "海水風呂"],
      item.bath_shape,
      "bathShapeOtherCheck",
      "bathShapeOther"
    );
    setCheckboxGroup(
      "bathFunction",
      ["炭酸泉・人工炭酸泉", "電気風呂", "ジェットバス", "バイブラバス", "打たせ湯", "薬湯", "香り湯", "源泉掛け流し浴槽", "循環浴槽", "加温浴槽", "高温湯", "ぬるま湯", "水風呂", "冷泉湯", "砂湯", "泥湯"],
      item.bath_function,
      "bathFunctionOtherCheck",
      "bathFunctionOther"
    );
    setValue("privateBathDuration", item.private_bath_duration);
    setValue("privateBathNote", item.private_bath_note);
    setCheckboxGroup(
      "bathLocation",
      ["固定", "日替わり", "週替わり", "隔週", "時間交代制", "男湯のみ", "女湯のみ", "混浴"],
      item.bath_location,
      "bathLocationOtherCheck",
      "bathLocationOther"
    );
    setRadioValue("bathHandrail", item.bath_handrail);
    setRadioValue("toiletryShelf", item.toiletry_shelf);
    setRadioValue("bathAnteroom", item.bath_anteroom);
    setRadioValue("bathEvent", item.bath_event);
    setValue("bathEventDetail", item.bath_event_detail);
    setRadioValue("bathToys", item.bath_toys);
    setValue("bathToysDetail", item.bath_toys_detail);
    setValue("bathNote", item.bath_note);

    setCheckboxGroup(
      "springTypes",
      ["単純温泉", "塩化物泉", "炭酸水素塩泉", "硫酸塩泉", "二酸化炭素泉", "含鉄泉", "酸性泉", "含よう素泉", "硫黄泉", "放射能泉"],
      item.spring_types,
      "springTypeOtherCheck",
      "springTypeOther"
    );
    if (Array.isArray(item.indications)) {
      document.querySelectorAll('input[name="indications"]').forEach((el) => {
        el.checked = item.indications.includes(el.value);
      });
      const known = new Set([
        "筋肉痛", "関節痛", "神経痛", "腰痛", "四十肩・五十肩", "打撲・捻挫",
        "冷え症", "血行促進", "慢性的な循環器系不全",
        "疲労回復", "健康増進", "自律神経の調整",
        "胃腸機能の低下", "食欲不振", "慢性的な消化器症状",
        "乾燥肌", "やけど", "切り傷、擦り傷", "慢性的な皮膚疾患",
        "月経に関連する症状", "慢性的な婦人系症状など",
        "慢性的な呼吸器症状など"
      ]);
      const other = item.indications.filter((v) => !known.has(v));
      setValue("indicationsOther", other.join("、"));
    }
    setCheckboxGroup("springColor", ["無色透明", "白濁", "茶褐色"], item.spring_color, "springColorOtherCheck", "springColorOther");
    setCheckboxGroup("springSmell", ["無臭", "硫黄臭", "鉄臭"], item.spring_smell, "springSmellOtherCheck", "springSmellOther");
    setCheckboxGroup(
      "springTexture",
      ["さらさら", "なめらか", "つるつる", "すべすべ", "しっとり", "やわらかい", "まろやか", "とろみがある", "ぬるぬる", "きしきし", "さっぱり", "刺激がある"],
      item.spring_texture,
      "springTextureOtherCheck",
      "springTextureOther"
    );
    setRadioValue("sourceFreeFlow", item.source_free_flow);
    setRadioValue("springDilution", item.spring_dilution);
    setRadioValue("springHeating", item.spring_heating);
    setRadioValue("springCirculation", item.spring_circulation);
    setRadioValue("springDisinfection", item.spring_disinfection);
    setValue("springUsageNote", item.spring_usage_note);
    setValue("springTemperature", item.spring_temperature);
    setValue("sourceTemperature", item.source_temperature);
    setValue("springPh", item.spring_ph);
    setValue("springSourceName", item.spring_source_name);
    setValue("springOpenYear", item.spring_open_year);
    setValue("springOpenYearNote", item.spring_open_year_note);
    setRadioValue("springAnalysis", item.spring_analysis);
    setDateValue("springAnalysis", item.spring_analysis_date);
    setRadioValue("legionellaTest", item.legionella_test);
    setDateValue("legionella", item.legionella_test_date);
    setRadioValue("legionellaResult", item.legionella_result);
    setCheckboxGroup(
      "springInfoSource",
      ["施設掲示", "温泉成分分析書", "施設公式サイト", "自治体・公的機関"],
      item.spring_info_source,
      "springInfoSourceOtherCheck",
      "springInfoSourceOther"
    );
    setDateValue("springInfoCheck", item.spring_info_check_date);
    setRadioValue("childMixedBathing", item.child_mixed_bathing);
    setRadioValue("childAgeLimit", item.child_age_limit);
    setRadioValue("childGenderLimit", item.child_gender_limit);
    setValue("childBoyAgeLimit", item.child_boy_age_limit);
    setValue("childGirlAgeLimit", item.child_girl_age_limit);
    setValue("childMixedBathingNote", item.child_mixed_bathing_note);
    setCheckboxGroup(
      "childInfoSource",
      ["施設掲示", "施設公式サイト", "自治体・公的機関"],
      item.child_info_source,
      "childInfoSourceOtherCheck",
      "childInfoSourceOther"
    );
    setDateValue("childInfoCheck", item.child_info_check_date);

    setValue("saunaNote", item.sauna_note);
    setCheckboxGroup(
      "sauna",
      ["ドライサウナ", "フィンランド式", "ロウリュ", "オートロウリュ", "セルフロウリュ", "塩サウナ", "スチームサウナ", "ミストサウナ", "遠赤外線サウナ", "その他"],
      item.sauna,
      null,
      null
    );
    setValue("saunaStatus", item.sauna_status);
    setValue("coldBathStatus", item.cold_bath_status);
    setRadioValue("outdoor", item.outdoor);
    setRadioValue("rest", item.rest);
    setRadioValue("wifi", item.wifi);
    setRadioValue("parking", item.parking);
    setRadioValue("locker", item.locker);
    setRadioValue("restaurant", item.restaurant);
    setRadioValue("barrierFree", item.barrier_free);

    setValue("showerCount", item.shower_count);
    setCheckboxGroup("showerType", ["押すタイプ", "レバータイプ", "不明"], item.shower_type, "showerTypeOtherCheck", "showerTypeOther");
    setValue("showerHeadInfo", item.shower_head_info);
    setRadioValue("showerFaucet", item.shower_faucet);
    setRadioValue("showerBooth", item.shower_booth);
    setRadioValue("washAreaDivider", item.wash_area_divider);
    setRadioValue("preRinseWater", item.pre_rinse_water);
    setValue("showerNote", item.shower_note);

    setRadioValue("shampooConditioner", item.shampoo_conditioner);
    setRadioValue("bodySoap", item.body_soap);
    setRadioValue("soap", item.soap);
    setRadioValue("faceWash", item.face_wash);
    setRadioValue("cleansing", item.cleansing);
    setRadioValue("basin", item.basin);
    setRadioValue("bathChair", item.bath_chair);
    setRadioValue("showerChair", item.shower_chair);
    populateRentalItems(item.rental_items);
    setRadioValue("dryerStatus", item.dryer_status);
    setValue("dryerCount", item.dryer_count);
    setRadioValue("dryerFee", item.dryer_fee);
    setValue("dryerBrand", item.dryer_brand);
    setRadioValue("dryerBringOwn", item.dryer_bring_own);
    setRadioValue("tissue", item.tissue);
    setRadioValue("cottonSwab", item.cotton_swab);
    setRadioValue("cosmetics", item.cosmetics);
    setRadioValue("hairTie", item.hair_tie);
    setRadioValue("powderRoom", item.powder_room);
    setRadioValue("vanity", item.vanity);
    setRadioValue("waterCooler", item.water_cooler);
    setRadioValue("fan", item.fan);
    setRadioValue("scale", item.scale);
    setRadioValue("bloodPressureMonitor", item.blood_pressure_monitor);
    setRadioValue("trashBin", item.trash_bin);
    setRadioValue("lockerRoomChair", item.locker_room_chair);
    setRadioValue("babyChair", item.baby_chair);
    setRadioValue("babyBed", item.baby_bed);
    setValue("amenityNote", item.amenity_note);

    setValue("lat", item.lat);
    setValue("lng", item.lng);
    setValue("note", item.note);
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

  async function updateSupabaseData(id, item) {
    if (!supabaseClient) return null;

    const payload = { ...item };
    delete payload.id;

    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase更新エラー:", error);
      throw error;
    }

    return data;
  }

  async function deleteSupabaseData(id) {
    if (!supabaseClient) return;

    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase削除エラー:", error);
      throw error;
    }
  }

  function updateLocalData(id, item) {
    const list = getLocalData();
    const index = list.findIndex((entry) => String(entry.id) === String(id));

    if (index === -1) return null;

    const updated = { ...item, id };
    list[index] = updated;
    saveLocalData(list);

    return updated;
  }

  function deleteLocalData(id) {
    const list = getLocalData();
    const filtered = list.filter((entry) => String(entry.id) !== String(id));
    saveLocalData(filtered);
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
        Array.isArray(item.spring_types) ? item.spring_types.join(" ") : ""
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
          Array.isArray(item.spring_types) ? item.spring_types.join("・") : "",
          item.spring_temperature != null
            ? `温泉 ${item.spring_temperature}℃`
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
          <button type="button" id="detailDelete" class="detail-action detail-action-danger">🗑 削除する</button>
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

          ${detailSubhead("🛀 浴場内の手すり")}
          <p class="detail-note-tight">${escapeHtml(item.bath_handrail || "不明")}</p>

          ${detailSubhead("🪣 洗面用具置き")}
          <p class="detail-note-tight">${escapeHtml(item.toiletry_shelf || "不明")}</p>

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


        <!-- 温泉情報 -->
        <section class="detail-section">
          <h3>♨️ 温泉情報</h3>

          ${detailSubhead("♨️ 泉質")}
          ${detailTags(item.spring_types) || `<p class="detail-note-tight">情報がありません。</p>`}

          ${detailSubhead("✨️ 温泉の適応症・効能")}
          ${detailTags(item.indications) || `<p class="detail-note-tight">情報がありません。</p>`}

          ${detailSubhead("♨️ 温泉の状態・特徴")}
          <p class="field-title">💧 温泉の色</p>
          ${detailTags(item.spring_color) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-title">👃 温泉の匂い</p>
          ${detailTags(item.spring_smell) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-title">🫧 温泉の感触・肌触り</p>
          ${detailTags(item.spring_texture) || `<p class="detail-note-tight">情報がありません。</p>`}

          ${detailSubhead("🛀 温泉の利用状況")}
          <div class="detail-grid">
            ${detailField("源泉掛け流し", item.source_free_flow)}
            ${detailField("加水", item.spring_dilution)}
            ${detailField("加温", item.spring_heating)}
            ${detailField("循環", item.spring_circulation)}
            ${detailField("消毒", item.spring_disinfection)}
          </div>
          ${item.spring_usage_note ? `<p class="detail-note">${escapeHtml(item.spring_usage_note)}</p>` : ""}

          <div class="detail-grid">
            ${detailField("泉温", item.spring_temperature != null ? `${item.spring_temperature}℃` : "")}
            ${detailField("源泉温度", item.source_temperature != null ? `${item.source_temperature}℃` : "")}
            ${detailField("pH", item.spring_ph)}
            ${detailField("源泉名・温泉地名", item.spring_source_name)}
            ${detailField("開湯年", item.spring_open_year)}
          </div>
          ${item.spring_open_year_note ? `<p class="detail-note">${escapeHtml(item.spring_open_year_note)}</p>` : ""}

          ${detailSubhead("🔍 水質検査等の情報")}
          <div class="detail-grid">
            ${detailField("温泉成分分析", item.spring_analysis)}
            ${detailField("分析年月日", item.spring_analysis_date)}
            ${detailField("レジオネラ属菌検査", item.legionella_test)}
            ${detailField("分析年月日", item.legionella_test_date)}
            ${detailField("検査結果", item.legionella_result)}
          </div>
          ${detailTags(item.spring_info_source)}
          <div class="detail-grid">${detailField("情報確認日", item.spring_info_check_date)}</div>

          ${detailSubhead("👦🏻 子どもの混浴制度")}
          <div class="detail-grid">
            ${detailField("混浴制度", item.child_mixed_bathing)}
            ${detailField("年齢制限", item.child_age_limit)}
            ${detailField("性別による制限", item.child_gender_limit)}
            ${detailField("男児", item.child_boy_age_limit != null ? `${item.child_boy_age_limit}歳以下` : "")}
            ${detailField("女児", item.child_girl_age_limit != null ? `${item.child_girl_age_limit}歳以下` : "")}
          </div>
          ${item.child_mixed_bathing_note ? `<p class="detail-note">${escapeHtml(item.child_mixed_bathing_note)}</p>` : ""}
          ${detailTags(item.child_info_source)}
          <div class="detail-grid">${detailField("情報確認日", item.child_info_check_date)}</div>
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

        <!-- シャワー -->
        <section class="detail-section">
          <h3>🚿 シャワー</h3>
          <div class="detail-grid">
            ${detailField("シャワーの数", item.shower_count)}
          </div>
          ${detailTags(item.shower_type) || `<p class="detail-note-tight">情報がありません。</p>`}
          <div class="detail-grid">
            ${detailField("シャワーヘッドの種類・メーカー等", item.shower_head_info)}
            ${detailField("吐水口・カラン", item.shower_faucet)}
            ${detailField("シャワーブース", item.shower_booth)}
            ${detailField("洗い場仕切り", item.wash_area_divider)}
            ${detailField("かけ湯", item.pre_rinse_water)}
          </div>
          ${item.shower_note ? `<p class="detail-note">${escapeHtml(item.shower_note)}</p>` : ""}
        </section>

        <!-- アメニティ -->
        <section class="detail-section">
          <h3>🧴 アメニティ・備品</h3>
          <div class="detail-grid">
            ${detailField("シャンプー・コンディショナー", item.shampoo_conditioner)}
            ${detailField("ボディソープ", item.body_soap)}
            ${detailField("石鹸", item.soap)}
            ${detailField("洗顔フォーム（浴場内）", item.face_wash)}
            ${detailField("クレンジング（浴場内）", item.cleansing)}
            ${detailField("洗面器・桶", item.basin)}
            ${detailField("浴場内の椅子", item.bath_chair)}
            ${detailField("シャワーチェア", item.shower_chair)}
            ${detailField("ドライヤー", item.dryer_status)}
            ${detailField("ドライヤーの個数", item.dryer_count)}
            ${detailField("ドライヤー使用料金", item.dryer_fee)}
            ${detailField("ドライヤーの種類・メーカー", item.dryer_brand)}
            ${detailField("ドライヤー持ち込み", item.dryer_bring_own)}
            ${detailField("ティッシュ", item.tissue)}
            ${detailField("綿棒", item.cotton_swab)}
            ${detailField("化粧品", item.cosmetics)}
            ${detailField("ヘアゴム", item.hair_tie)}
            ${detailField("パウダールーム", item.powder_room)}
            ${detailField("洗面台", item.vanity)}
            ${detailField("冷水機", item.water_cooler)}
            ${detailField("扇風機", item.fan)}
            ${detailField("体重計・体脂肪計", item.scale)}
            ${detailField("血圧計", item.blood_pressure_monitor)}
            ${detailField("ごみ箱", item.trash_bin)}
            ${detailField("更衣室内の椅子", item.locker_room_chair)}
            ${detailField("ベビーチェア", item.baby_chair)}
            ${detailField("ベビーベッド", item.baby_bed)}
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
          ${item.amenity_note ? `<p class="detail-note">${escapeHtml(item.amenity_note)}</p>` : ""}
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
      editingId = item.id;

      resetForm();
      populateForm(item);

      const modal = $("modal");
      if (modal) {
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
      }

      const titleEl = $("modalTitle");
      if (titleEl) titleEl.textContent = "温泉を編集";

      const submitButton = document.querySelector('#form button[type="submit"]');
      if (submitButton) submitButton.textContent = "更新する";
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

    $("detailDelete")?.addEventListener("click", async () => {
      const ok = confirm(
        `「${item.name || "この温泉"}」を削除します。この操作は取り消せません。よろしいですか？`
      );
      if (!ok) return;

      try {
        if (supabaseClient) {
          await deleteSupabaseData(item.id);
        } else {
          deleteLocalData(item.id);
        }

        location.hash = "";
        await loadAll();
        alert("削除しました。");
      } catch (error) {
        console.error(error);
        alert(
          "削除できませんでした。\n\n" +
          `詳細：${error.message || "不明なエラー"}`
        );
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

    const isEditing = Boolean(editingId);
    const targetId = editingId;

    const saveButton =
      document.querySelector('#form button[type="submit"]') ||
      document.querySelector('#form button:not(#cancel)');

    if (saveButton) {
      saveButton.disabled = true;
    }

    try {
      if (supabaseClient) {
        const saved = isEditing
          ? await updateSupabaseData(targetId, item)
          : await insertSupabaseData(item);

        setStatus(isEditing ? "温泉情報を更新しました。" : "温泉を登録しました。", "ok");
        editingId = null;
        resetForm();
        closeModal();

        // 保存直後に再読込 → 一覧・詳細へ即反映
        await loadAll();

        if (isEditing) {
          await showDetail(targetId);
        }

        alert(
          isEditing
            ? `「${saved?.name || item.name}」を更新しました。`
            : `「${saved?.name || item.name}」を登録しました。`
        );
      } else {
        // Supabase未設定でも、内容を失わない
        const saved = isEditing
          ? updateLocalData(targetId, item)
          : addLocalData(item);

        editingId = null;
        resetForm();
        closeModal();
        await loadAll();

        if (isEditing) {
          await showDetail(targetId);
        }

        alert(
          (isEditing ? "温泉情報を更新しました。\n\n" : "温泉を登録しました。\n\n") +
          "現在はSupabaseのURL・anon keyが未設定なので、" +
          "この端末に保存しています。"
        );
        void saved;
      }
    } catch (error) {
      console.error(error);

      if (!isEditing) {
        // 新規登録時のみ、失敗しても入力内容をローカルへ退避
        try {
          addLocalData(item);
          await loadAll();
        } catch (_) {}
      }

      alert(
        (isEditing ? "更新できませんでした。\n\n" : "保存できませんでした。\n\n") +
        `詳細：${error.message || "Supabaseへの保存に失敗しました。"}` +
        (isEditing ? "" : "\n\n入力内容はこの端末にも保存しました。")
      );

      setStatus(
        isEditing ? "Supabase更新失敗。" : "Supabase保存失敗。端末保存へ切り替えました。",
        "error"
      );
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
    $("showerTypeOther")?.classList.add("hidden");
    $("springTypeOther")?.classList.add("hidden");
    $("springColorOther")?.classList.add("hidden");
    $("springSmellOther")?.classList.add("hidden");
    $("springTextureOther")?.classList.add("hidden");
    $("springInfoSourceOther")?.classList.add("hidden");
    $("childInfoSourceOther")?.classList.add("hidden");
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
      ["bathLocationOtherCheck", "bathLocationOther"],
      ["showerTypeOtherCheck", "showerTypeOther"],
      ["springTypeOtherCheck", "springTypeOther"],
      ["springColorOtherCheck", "springColorOther"],
      ["springSmellOtherCheck", "springSmellOther"],
      ["springTextureOtherCheck", "springTextureOther"],
      ["springInfoSourceOtherCheck", "springInfoSourceOther"],
      ["childInfoSourceOtherCheck", "childInfoSourceOther"]
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

    // 編集状態やフォームの内容が残らないよう、閉じるたびに初期状態へ戻す
    editingId = null;
    resetForm();
    const titleEl = $("modalTitle");
    if (titleEl) titleEl.textContent = "温泉を追加";
    const submitButton = document.querySelector('#form button[type="submit"]');
    if (submitButton) submitButton.textContent = "登録する";
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
