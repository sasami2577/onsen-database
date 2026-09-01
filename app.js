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

  function addMenuFeeRow(containerId, menu = "", minutes = "", price = "", { focus = true } = {}) {
    const rows = $(containerId);
    if (!rows) return;

    const rowId = `menu-fee-${++feeRowSeq}`;
    const row = document.createElement("div");
    row.className = "menu-fee-row";
    row.dataset.rowId = rowId;

    row.innerHTML = `
      <input type="text" class="menu-fee-name" name="menu-fee-name-${rowId}" autocomplete="off" placeholder="メニュー（例：もみほぐし）" maxlength="60" value="${escapeHtml(menu)}">
      <input type="number" class="menu-fee-minutes" name="menu-fee-minutes-${rowId}" autocomplete="off" placeholder="分" min="0" value="${escapeHtml(minutes)}">
      <input type="number" class="menu-fee-price" name="menu-fee-price-${rowId}" autocomplete="off" placeholder="円" min="0" value="${escapeHtml(price)}">
      <button type="button" class="remove-rental" aria-label="このメニューを削除">×</button>
    `;

    rows.appendChild(row);
    if (focus) {
      row.querySelector(".menu-fee-name")?.focus();
    }
  }

  function collectMenuFeeRows(containerId) {
    const rows = $(containerId);
    if (!rows) return [];

    const result = [];
    rows.querySelectorAll(".menu-fee-row").forEach((row) => {
      const menu = row.querySelector(".menu-fee-name")?.value.trim() || "";
      const minutes = row.querySelector(".menu-fee-minutes")?.value.trim() || "";
      const price = row.querySelector(".menu-fee-price")?.value.trim() || "";

      if (!menu && !minutes && !price) return;

      result.push({
        menu: menu || "メニュー",
        minutes: minutes ? Number(minutes) : null,
        price: price ? Number(price) : null
      });
    });

    return result;
  }

  function populateMenuFeeRows(containerId, items) {
    const rows = $(containerId);
    if (!rows) return;
    rows.innerHTML = "";
    if (!Array.isArray(items) || !items.length) return;

    items.forEach((it) =>
      addMenuFeeRow(containerId, it.menu || "", it.minutes ?? "", it.price ?? "", { focus: false })
    );
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

  // メニュー名・時間（分）・料金（円）の3項目版（マッサージ等の料金表用）
  let feeRow3Seq = 0;

  function addFeeRow3(containerId, name = "", minutes = "", price = "", { focus = true } = {}) {
    const rows = $(containerId);
    if (!rows) return;

    const rowId = `fee3-${++feeRow3Seq}`;
    const row = document.createElement("div");
    row.className = "rental-row rental-row-3";
    row.dataset.rowId = rowId;

    row.innerHTML = `
      <input type="text" class="fee3-name" name="fee3-name-${rowId}" autocomplete="off" placeholder="メニュー（例：全身マッサージ）" maxlength="60" value="${escapeHtml(name)}">
      <input type="number" class="fee3-minutes" name="fee3-minutes-${rowId}" autocomplete="off" placeholder="分" min="0" value="${escapeHtml(minutes)}">
      <input type="number" class="fee3-price" name="fee3-price-${rowId}" autocomplete="off" placeholder="円" min="0" value="${escapeHtml(price)}">
      <button type="button" class="remove-rental" aria-label="この項目を削除">×</button>
    `;

    rows.appendChild(row);
    if (focus) {
      row.querySelector(".fee3-name")?.focus();
    }
  }

  function collectFeeRows3(containerId) {
    const rows = $(containerId);
    if (!rows) return [];

    const result = [];

    rows.querySelectorAll(".rental-row-3").forEach((row) => {
      const name = row.querySelector(".fee3-name")?.value.trim() || "";
      const minutes = row.querySelector(".fee3-minutes")?.value.trim() || "";
      const price = row.querySelector(".fee3-price")?.value.trim() || "";

      if (!name && !minutes && !price) return;

      result.push({
        name: name || "メニュー",
        minutes: minutes ? Number(minutes) : null,
        price: price ? Number(price) : null
      });
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
      closed_days_note: value("closedDaysNote"),
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
      private_bath_capacity_status: radioValue("privateBathCapacityStatus"),
      private_bath_capacity: numberValue("privateBathCapacity"),
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

      // 🧖‍♀️ サウナ関連
      sauna_facility: radioValue("saunaFacility"),
      sauna_facility_suspended: checkedBool("saunaFacilitySuspended"),
      sauna_facility_location:
        radioValue("saunaFacilityLocation") === "その他" && value("saunaFacilityLocationOther")
          ? value("saunaFacilityLocationOther")
          : radioValue("saunaFacilityLocation"),
      sauna_hours_type: radioValue("saunaHoursType"),
      sauna_hours_weekday_open: timeValue("saunaHoursWeekdayOpen"),
      sauna_hours_weekday_close: timeValue("saunaHoursWeekdayClose"),
      sauna_hours_saturday_open: timeValue("saunaHoursSaturdayOpen"),
      sauna_hours_saturday_close: timeValue("saunaHoursSaturdayClose"),
      sauna_hours_sunday_open: timeValue("saunaHoursSundayOpen"),
      sauna_hours_sunday_close: timeValue("saunaHoursSundayClose"),
      sauna_hours_holiday_open: timeValue("saunaHoursHolidayOpen"),
      sauna_hours_holiday_close: timeValue("saunaHoursHolidayClose"),
      sauna_types: [
        ...checkedValues("saunaTypes"),
        ...(checkedBool("saunaTypesOtherCheck")
          ? [value("saunaTypesOther") || "その他"]
          : [])
      ],
      sauna_temp_min: numberValue("saunaTempMin"),
      sauna_temp_max: numberValue("saunaTempMax"),
      sauna_humidity_min: numberValue("saunaHumidityMin"),
      sauna_humidity_max: numberValue("saunaHumidityMax"),
      sauna_capacity_number: numberValue("saunaCapacityNumber"),
      sauna_capacity_range: value("saunaCapacityRange"),
      sauna_thermometer: radioValue("saunaThermometer"),
      sauna_clock: radioValue("saunaClock"),
      sauna_twelve_min_timer: radioValue("saunaTwelveMinTimer"),
      sauna_hourglass: radioValue("saunaHourglass"),
      sauna_tv: radioValue("saunaTv"),
      sauna_tv_remote: radioValue("saunaTvRemote"),
      sauna_stones: radioValue("saunaStones"),
      sauna_stove_type:
        radioValue("saunaStoveType") === "その他" && value("saunaStoveTypeOther")
          ? value("saunaStoveTypeOther")
          : radioValue("saunaStoveType"),
      sauna_stove_count_status: radioValue("saunaStoveCountStatus"),
      sauna_stove_count: numberValue("saunaStoveCount"),
      sauna_stove_brand: value("saunaStoveBrand"),
      sauna_mat_rental: radioValue("saunaMatRental"),
      sauna_mat_type: [
        ...checkedValues("saunaMatType"),
        ...(checkedBool("saunaMatTypeOtherCheck")
          ? [value("saunaMatTypeOther") || "その他"]
          : [])
      ],
      sauna_mat_placement: [
        ...checkedValues("saunaMatPlacement"),
        ...(checkedBool("saunaMatPlacementOtherCheck")
          ? [value("saunaMatPlacementOther") || "その他"]
          : [])
      ],
      sauna_goods_rental: radioValue("saunaGoodsRental"),
      sauna_goods_sale: radioValue("saunaGoodsSale"),
      sauna_loyly: radioValue("saunaLoyly"),
      sauna_loyly_type: [
        ...checkedValues("saunaLoylyType"),
        ...(checkedBool("saunaLoylyTypeOtherCheck")
          ? [value("saunaLoylyTypeOther") || "その他"]
          : [])
      ],
      sauna_aroma_loyly: radioValue("saunaAromaLoyly"),
      sauna_aroma_type: value("saunaAromaType"),
      sauna_aufguss: radioValue("saunaAufguss"),
      sauna_loyly_frequency: radioValue("saunaLoylyFrequency"),
      sauna_loyly_interval_minutes: numberValue("saunaLoylyIntervalMinutes"),
      sauna_loyly_interval_note: value("saunaLoylyIntervalNote"),
      sauna_loyly_reservation: radioValue("saunaLoylyReservation"),
      sauna_loyly_note: value("saunaLoylyNote"),
      sauna_door_type:
        radioValue("saunaDoorType") === "その他" && value("saunaDoorTypeOther")
          ? value("saunaDoorTypeOther")
          : radioValue("saunaDoorType"),
      sauna_exit_direction: radioValue("saunaExitDirection"),
      sauna_light_brightness: radioValue("saunaLightBrightness"),
      sauna_room_note: value("saunaRoomNote"),

      cold_bath_availability: radioValue("coldBathAvailability"),
      cold_bath_count: numberValue("coldBathCount"),
      cold_bath_shape: checkedValues("coldBathShape"),
      cold_bath_location: checkedValues("coldBathLocation"),
      cold_bath_source: [
        ...checkedValues("coldBathSource"),
        ...(checkedBool("coldBathSourceOtherCheck")
          ? [value("coldBathSourceOther") || "その他"]
          : [])
      ],
      cold_bath_cooling: [
        ...checkedValues("coldBathCooling"),
        ...(checkedBool("coldBathCoolingOtherCheck")
          ? [value("coldBathCoolingOther") || "その他"]
          : [])
      ],
      cold_bath_flow: [
        ...checkedValues("coldBathFlow"),
        ...(checkedBool("coldBathFlowOtherCheck")
          ? [value("coldBathFlowOther") || "その他"]
          : [])
      ],
      cold_bath_temp_min: numberValue("coldBathTempMin"),
      cold_bath_temp_max: numberValue("coldBathTempMax"),
      cold_bath_capacity: numberValue("coldBathCapacity"),
      cold_bath_depth: numberValue("coldBathDepth"),
      cold_shower: radioValue("coldShower"),
      cold_bath_note: value("coldBathNote"),

      outdoor: radioValue("outdoor"),
      outdoor_location: [
        ...checkedValues("outdoorLocation"),
        ...(checkedBool("outdoorLocationOtherCheck")
          ? [value("outdoorLocationOther") || "その他"]
          : [])
      ],
      indoor_bathing: radioValue("indoorBathing"),
      indoor_location: [
        ...checkedValues("indoorLocation"),
        ...(checkedBool("indoorLocationOtherCheck")
          ? [value("indoorLocationOther") || "その他"]
          : [])
      ],
      tori_toi_chair: radioValue("toriToiChair"),
      tori_toi_chair_count: numberValue("toriToiChairCount"),
      recline_chair: radioValue("reclineChair"),
      recline_chair_count: numberValue("reclineChairCount"),
      infinity_chair: radioValue("infinityChair"),
      infinity_chair_count: numberValue("infinityChairCount"),
      bench: radioValue("bench"),
      bench_count: numberValue("benchCount"),
      deck_chair: radioValue("deckChair"),
      deck_chair_count: numberValue("deckChairCount"),
      laying_space: radioValue("layingSpace"),
      laying_space_material: [
        ...checkedValues("layingSpaceMaterial"),
        ...(checkedBool("layingSpaceMaterialOtherCheck")
          ? [value("layingSpaceMaterialOther") || "その他"]
          : [])
      ],
      tori_toi_other_note: value("toriToiOtherNote"),
      roof_rain_protection: radioValue("roofRainProtection"),
      sun_shade: radioValue("sunShade"),
      scenery: [
        ...checkedValues("scenery"),
        ...(checkedBool("sceneryOtherCheck")
          ? [value("sceneryOther") || "その他"]
          : [])
      ],
      outdoor_indoor_note: value("outdoorIndoorNote"),

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
      bath_trash_bin: radioValue("bathTrashBin"),
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

      // 🔐 ロッカー
      locker_count: value("lockerCount"),
      locker_key_type: [
        ...checkedValues("lockerKeyType"),
        ...(checkedBool("lockerKeyTypeOtherCheck")
          ? [value("lockerKeyTypeOther") || "その他"]
          : [])
      ],
      locker_wristband_type: [
        ...checkedValues("lockerWristbandType"),
        ...(checkedBool("lockerWristbandTypeOtherCheck")
          ? [value("lockerWristbandTypeOther") || "その他"]
          : [])
      ],
      locker_wristband_use: [
        ...checkedValues("lockerWristbandUse"),
        ...(checkedBool("lockerWristbandUseOtherCheck")
          ? [value("lockerWristbandUseOther") || "その他"]
          : [])
      ],
      locker_size: [
        ...checkedValues("lockerSize"),
        ...(checkedBool("lockerSizeOtherCheck")
          ? [value("lockerSizeOther") || "その他"]
          : [])
      ],
      locker_divider: radioValue("lockerDivider"),
      locker_hanger: radioValue("lockerHanger"),
      locker_small_item_box: radioValue("lockerSmallItemBox"),
      locker_valuables: radioValue("lockerValuables"),
      locker_rental: radioValue("lockerRental"),
      locker_suitcase: radioValue("lockerSuitcase"),
      locker_note: value("lockerNote"),

      // 👟 靴箱
      shoebox_count: value("shoeboxCount"),
      shoebox_type: [
        ...checkedValues("shoeboxType"),
        ...(checkedBool("shoeboxTypeOtherCheck")
          ? [value("shoeboxTypeOther") || "その他"]
          : [])
      ],
      shoebox_key_type: [
        ...checkedValues("shoeboxKeyType"),
        ...(checkedBool("shoeboxKeyTypeOtherCheck")
          ? [value("shoeboxKeyTypeOther") || "その他"]
          : [])
      ],
      shoebox_fee: radioValue("shoeboxFee"),
      shoebox_note: value("shoeboxNote"),

      // 🚻 トイレ・バリアフリー
      toilet_location_lobby: radioValue("toiletLocationLobby"),
      toilet_mens_changing_room: radioValue("toiletMensChangingRoom"),
      toilet_womens_changing_room: radioValue("toiletWomensChangingRoom"),
      toilet_location_other: value("toiletLocationOther"),
      toilet_types: [
        ...checkedValues("toiletTypes"),
        ...(checkedBool("toiletTypesOtherCheck")
          ? [value("toiletTypesOther") || "その他"]
          : [])
      ],
      toilet_accessible: radioValue("toiletAccessible"),
      toilet_wheelchair: radioValue("toiletWheelchair"),
      toilet_ostomate: radioValue("toiletOstomate"),
      toilet_diaper_table: radioValue("toiletDiaperTable"),
      toilet_baby_chair_in_toilet: radioValue("toiletBabyChairInToilet"),
      toilet_slope: radioValue("toiletSlope"),
      toilet_elevator: radioValue("toiletElevator"),
      toilet_barrier_free_note: value("toiletBarrierFreeNote"),

      // 🍴 お食事処
      restaurant_status: radioValue("restaurantStatus"),
      restaurant_types: [
        ...checkedValues("restaurantTypes"),
        ...(checkedBool("restaurantTypesOtherCheck")
          ? [value("restaurantTypesOther") || "その他"]
          : [])
      ],
      restaurant_feature: value("restaurantFeature"),
      restaurant_hours_type: radioValue("restaurantHoursType"),
      restaurant_open_time: timeValue("restaurantOpenTime"),
      restaurant_close_time: timeValue("restaurantCloseTime"),
      restaurant_last_order: timeValue("restaurantLastOrder"),
      restaurant_payment: [
        ...checkedValues("restaurantPayment"),
        ...(checkedBool("restaurantPaymentOtherCheck")
          ? [value("restaurantPaymentOther") || "その他"]
          : [])
      ],
      restaurant_other_info: [
        ...checkedValues("restaurantOtherInfo"),
        ...(checkedBool("restaurantOtherInfoOtherCheck")
          ? [value("restaurantOtherInfoOther") || "その他"]
          : [])
      ],
      restaurant_note: value("restaurantNote"),

      // 🛋 休憩スペース
      rest_space_status: radioValue("restSpaceStatus"),
      rest_space_type: [
        ...checkedValues("restSpaceType"),
        ...(checkedBool("restSpaceTypeOtherCheck")
          ? [value("restSpaceTypeOther") || "その他"]
          : [])
      ],
      rest_space_condition: radioValue("restSpaceCondition"),
      rest_space_fee_type: radioValue("restSpaceFeeType"),
      rest_space_fee_amount: numberValue("restSpaceFeeAmount"),
      rest_space_hours_type: radioValue("restSpaceHoursType"),
      rest_space_hours_open: timeValue("restSpaceHoursOpen"),
      rest_space_hours_close: timeValue("restSpaceHoursClose"),
      rest_space_per_person_type: radioValue("restSpacePerPersonType"),
      rest_space_per_person_minutes: numberValue("restSpacePerPersonMinutes"),
      rest_space_note: value("restSpaceNote"),

      // 💆‍♀️ マッサージ・リラクゼーション
      massage_status: radioValue("massageStatus"),
      massage_types: [
        ...checkedValues("massageTypes"),
        ...(checkedBool("massageTypesOtherCheck")
          ? [value("massageTypesOther") || "その他"]
          : [])
      ],
      massage_menu_fees: collectFeeRows3("massageFeeRows"),
      massage_hours_type: radioValue("massageHoursType"),
      massage_hours_open: timeValue("massageHoursOpen"),
      massage_hours_close: timeValue("massageHoursClose"),
      massage_chair_status: radioValue("massageChairStatus"),
      massage_chair_count: numberValue("massageChairCount"),
      massage_chair_minutes: numberValue("massageChairMinutes"),
      massage_chair_price: numberValue("massageChairPrice"),
      massage_note: value("massageNote"),

      // 💬 レンタル・コワーキングスペース
      rental_space_status: radioValue("rentalSpaceStatus"),
      coworking_space_status: radioValue("coworkingSpaceStatus"),
      coworking_features: [
        ...checkedValues("coworkingFeatures"),
        ...(checkedBool("coworkingFeaturesOtherCheck")
          ? [value("coworkingFeaturesOther") || "その他"]
          : [])
      ],
      coworking_note: value("coworkingNote"),

      // 🥤 自動販売機
      vending_machine_status: radioValue("vendingMachineStatus"),
      vending_machine_types: [
        ...checkedValues("vendingMachineTypes"),
        ...(checkedBool("vendingMachineTypesOtherCheck")
          ? [value("vendingMachineTypesOther") || "その他"]
          : [])
      ],
      vending_machine_location: [
        ...checkedValues("vendingMachineLocation"),
        ...(checkedBool("vendingMachineLocationOtherCheck")
          ? [value("vendingMachineLocationOther") || "その他"]
          : [])
      ],
      recycle_box_status: radioValue("recycleBoxStatus"),
      vending_machine_note: value("vendingMachineNote"),

      // 🛍 売店コーナー
      shop_status: radioValue("shopStatus"),
      shop_items: [
        ...checkedValues("shopItems"),
        ...(checkedBool("shopItemsOtherCheck")
          ? [value("shopItemsOther") || "その他"]
          : [])
      ],
      shop_hours_type: radioValue("shopHoursType"),
      shop_hours_open: timeValue("shopHoursOpen"),
      shop_hours_close: timeValue("shopHoursClose"),
      shop_payment: [
        ...checkedValues("shopPayment"),
        ...(checkedBool("shopPaymentOtherCheck")
          ? [value("shopPaymentOther") || "その他"]
          : [])
      ],
      shop_note: value("shopNote"),

      // その他の各種施設
      accommodation_status: radioValue("accommodationStatus"),
      pool_facility_status: radioValue("poolFacilityStatus"),
      game_corner_status: radioValue("gameCornerStatus"),
      kids_corner_status: radioValue("kidsCornerStatus"),
      outdoor_facility_status: radioValue("outdoorFacilityStatus"),
      foot_bath_status: radioValue("footBathStatus"),
      ganbanyoku_status: radioValue("ganbanyokuStatus"),
      coin_laundry_status: radioValue("coinLaundryStatus"),
      spring_takeaway_status: radioValue("springTakeawayStatus"),
      onsen_tamago_status: radioValue("onsenTamagoStatus"),
      wifi_facility: radioValue("wifiFacility"),
      wifi_fee_minutes: numberValue("wifiFeeMinutes"),
      wifi_fee_price: numberValue("wifiFeePrice"),
      charging_spot: radioValue("chargingSpot"),
      charging_fee_minutes: numberValue("chargingFeeMinutes"),
      charging_fee_price: numberValue("chargingFeePrice"),
      aed_facility_status: radioValue("aedFacilityStatus"),
      first_aid_room_status: radioValue("firstAidRoomStatus"),
      other_facility_note: value("otherFacilityNote"),

      lat: numberValue("lat"),
      lng: numberValue("lng"),
      google_maps_url: value("googleMapsUrl"),
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
    setValue("closedDaysNote", item.closed_days_note);
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
    setRadioValue("privateBathCapacityStatus", item.private_bath_capacity_status);
    setValue("privateBathCapacity", item.private_bath_capacity);
    if (item.private_bath_capacity_status === "人数あり") {
      $("privateBathCapacityWrap")?.classList.remove("hidden");
    }
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

    setRadioValue("saunaFacility", item.sauna_facility);
    if (item.sauna_facility_suspended) $("saunaFacilitySuspended").checked = true;

    if (["屋内", "屋外", "両方設置"].includes(item.sauna_facility_location)) {
      setRadioValue("saunaFacilityLocation", item.sauna_facility_location);
    } else if (item.sauna_facility_location) {
      setRadioValue("saunaFacilityLocation", "その他");
      setValue("saunaFacilityLocationOther", item.sauna_facility_location);
      $("saunaFacilityLocationOther")?.classList.remove("hidden");
    }

    setRadioValue("saunaHoursType", item.sauna_hours_type);
    if (item.sauna_hours_type === "利用時間あり") {
      $("saunaHoursWrap")?.classList.remove("hidden");
    }
    setTimeValue("saunaHoursWeekdayOpen", item.sauna_hours_weekday_open);
    setTimeValue("saunaHoursWeekdayClose", item.sauna_hours_weekday_close);
    setTimeValue("saunaHoursSaturdayOpen", item.sauna_hours_saturday_open);
    setTimeValue("saunaHoursSaturdayClose", item.sauna_hours_saturday_close);
    setTimeValue("saunaHoursSundayOpen", item.sauna_hours_sunday_open);
    setTimeValue("saunaHoursSundayClose", item.sauna_hours_sunday_close);
    setTimeValue("saunaHoursHolidayOpen", item.sauna_hours_holiday_open);
    setTimeValue("saunaHoursHolidayClose", item.sauna_hours_holiday_close);

    setCheckboxGroup(
      "saunaTypes",
      ["遠赤外線サウナ", "ドライサウナ", "スチームサウナ", "ミストサウナ", "フィンランド式サウナ（ロウリュ）", "テントサウナ", "個室サウナ", "塩サウナ", "薬草サウナ"],
      item.sauna_types,
      "saunaTypesOtherCheck",
      "saunaTypesOther"
    );
    setValue("saunaTempMin", item.sauna_temp_min);
    setValue("saunaTempMax", item.sauna_temp_max);
    setValue("saunaHumidityMin", item.sauna_humidity_min);
    setValue("saunaHumidityMax", item.sauna_humidity_max);
    setValue("saunaCapacityNumber", item.sauna_capacity_number);
    setValue("saunaCapacityRange", item.sauna_capacity_range);
    setRadioValue("saunaThermometer", item.sauna_thermometer);
    setRadioValue("saunaClock", item.sauna_clock);
    setRadioValue("saunaTwelveMinTimer", item.sauna_twelve_min_timer);
    setRadioValue("saunaHourglass", item.sauna_hourglass);
    setRadioValue("saunaTv", item.sauna_tv);
    setRadioValue("saunaTvRemote", item.sauna_tv_remote);
    setRadioValue("saunaStones", item.sauna_stones);

    if (["電気ストーブ", "薪ストーブ", "ガスストーブ", "遠赤外線ストーブ", "ハイブリッド"].includes(item.sauna_stove_type)) {
      setRadioValue("saunaStoveType", item.sauna_stove_type);
    } else if (item.sauna_stove_type) {
      setRadioValue("saunaStoveType", "その他");
      setValue("saunaStoveTypeOther", item.sauna_stove_type);
      $("saunaStoveTypeOther")?.classList.remove("hidden");
    }
    setRadioValue("saunaStoveCountStatus", item.sauna_stove_count_status);
    setRadioValue("saunaStoveCountStatus", item.sauna_stove_count_status);
    setValue("saunaStoveCount", item.sauna_stove_count);
    if (item.sauna_stove_count_status === "台数あり") {
      $("saunaStoveCountWrap")?.classList.remove("hidden");
    }
    if (item.sauna_stove_count_status === "台数あり") {
      $("saunaStoveCountWrap")?.classList.remove("hidden");
    }
    setValue("saunaStoveBrand", item.sauna_stove_brand);

    setRadioValue("saunaMatRental", item.sauna_mat_rental);
    setCheckboxGroup(
      "saunaMatType",
      ["ビート板タイプ", "ウレタンタイプ", "ジョイントマットタイプ", "タオル・布製タイプ", "木製・すのこタイプ", "樹脂・ゴム製タイプ"],
      item.sauna_mat_type,
      "saunaMatTypeOtherCheck",
      "saunaMatTypeOther"
    );
    setCheckboxGroup(
      "saunaMatPlacement",
      ["サウナ室内に設置", "サウナ室入口前に設置", "浴場内に設置", "浴場入口に設置", "自由に利用可能", "個人用貸し出し", "持参可能", "持参必要", "水洗い場所あり", "消毒スプレーあり"],
      item.sauna_mat_placement,
      "saunaMatPlacementOtherCheck",
      "saunaMatPlacementOther"
    );
    setRadioValue("saunaGoodsRental", item.sauna_goods_rental);
    setRadioValue("saunaGoodsSale", item.sauna_goods_sale);

    setRadioValue("saunaLoyly", item.sauna_loyly);
    setCheckboxGroup(
      "saunaLoylyType",
      ["セルフロウリュ", "スタッフロウリュ", "オートロウリュ"],
      item.sauna_loyly_type,
      "saunaLoylyTypeOtherCheck",
      "saunaLoylyTypeOther"
    );
    setRadioValue("saunaAromaLoyly", item.sauna_aroma_loyly);
    setValue("saunaAromaType", item.sauna_aroma_type);
    setRadioValue("saunaAufguss", item.sauna_aufguss);
    setRadioValue("saunaLoylyFrequency", item.sauna_loyly_frequency);
    setValue("saunaLoylyIntervalMinutes", item.sauna_loyly_interval_minutes);
    setValue("saunaLoylyIntervalNote", item.sauna_loyly_interval_note);
    setRadioValue("saunaLoylyReservation", item.sauna_loyly_reservation);
    setValue("saunaLoylyNote", item.sauna_loyly_note);

    if (["押し引きタイプ", "取っ手を回すタイプ"].includes(item.sauna_door_type)) {
      setRadioValue("saunaDoorType", item.sauna_door_type);
    } else if (item.sauna_door_type) {
      setRadioValue("saunaDoorType", "その他");
      setValue("saunaDoorTypeOther", item.sauna_door_type);
      $("saunaDoorTypeOther")?.classList.remove("hidden");
    }
    setRadioValue("saunaExitDirection", item.sauna_exit_direction);
    setRadioValue("saunaLightBrightness", item.sauna_light_brightness);
    setValue("saunaRoomNote", item.sauna_room_note);

    setRadioValue("coldBathAvailability", item.cold_bath_availability);
    setValue("coldBathCount", item.cold_bath_count);
    setCheckboxGroup("coldBathShape", ["一般的タイプ", "浅めタイプ", "深めタイプ", "壺タイプ", "1人用タイプ", "大型・プール"], item.cold_bath_shape, null, null);
    setCheckboxGroup("coldBathLocation", ["屋内", "屋外", "両方設置"], item.cold_bath_location, null, null);
    setCheckboxGroup("coldBathSource", ["水道水", "地下水", "天然水", "井戸水", "不明"], item.cold_bath_source, "coldBathSourceOtherCheck", "coldBathSourceOther");
    setCheckboxGroup("coldBathCooling", ["チラー冷却", "自然冷却", "不明"], item.cold_bath_cooling, "coldBathCoolingOtherCheck", "coldBathCoolingOther");
    setCheckboxGroup("coldBathFlow", ["なし", "バイブラ", "ジェット", "不明"], item.cold_bath_flow, "coldBathFlowOtherCheck", "coldBathFlowOther");
    setValue("coldBathTempMin", item.cold_bath_temp_min);
    setValue("coldBathTempMax", item.cold_bath_temp_max);
    setValue("coldBathCapacity", item.cold_bath_capacity);
    setValue("coldBathDepth", item.cold_bath_depth);
    setRadioValue("coldShower", item.cold_shower);
    setValue("coldBathNote", item.cold_bath_note);

    setRadioValue("outdoor", item.outdoor);
    setCheckboxGroup("outdoorLocation", ["露天エリア", "専用外気浴スペース", "ベランダ・テラス"], item.outdoor_location, "outdoorLocationOtherCheck", "outdoorLocationOther");
    setRadioValue("indoorBathing", item.indoor_bathing);
    setCheckboxGroup("indoorLocation", ["浴場内エリア", "専用内気浴スペース"], item.indoor_location, "indoorLocationOtherCheck", "indoorLocationOther");
    setRadioValue("toriToiChair", item.tori_toi_chair);
    setValue("toriToiChairCount", item.tori_toi_chair_count);
    setRadioValue("reclineChair", item.recline_chair);
    setValue("reclineChairCount", item.recline_chair_count);
    setRadioValue("infinityChair", item.infinity_chair);
    setValue("infinityChairCount", item.infinity_chair_count);
    setRadioValue("bench", item.bench);
    setValue("benchCount", item.bench_count);
    setRadioValue("deckChair", item.deck_chair);
    setValue("deckChairCount", item.deck_chair_count);
    setRadioValue("layingSpace", item.laying_space);
    setCheckboxGroup("layingSpaceMaterial", ["畳", "木製"], item.laying_space_material, "layingSpaceMaterialOtherCheck", "layingSpaceMaterialOther");
    setValue("toriToiOtherNote", item.tori_toi_other_note);
    setRadioValue("roofRainProtection", item.roof_rain_protection);
    setRadioValue("sunShade", item.sun_shade);
    setCheckboxGroup("scenery", ["山・自然", "海・湖", "街並み", "庭園", "星空"], item.scenery, "sceneryOtherCheck", "sceneryOther");
    setValue("outdoorIndoorNote", item.outdoor_indoor_note);

    setValue("showerCount", item.shower_count);
    setCheckboxGroup("showerType", ["押すタイプ", "レバータイプ", "不明"], item.shower_type, "showerTypeOtherCheck", "showerTypeOther");
    setValue("showerHeadInfo", item.shower_head_info);
    setRadioValue("showerFaucet", item.shower_faucet);
    setRadioValue("showerBooth", item.shower_booth);
    setRadioValue("washAreaDivider", item.wash_area_divider);
    setRadioValue("bathTrashBin", item.bath_trash_bin);
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

    // 🔐 ロッカー
    setValue("lockerCount", item.locker_count);
    setCheckboxGroup(
      "lockerKeyType",
      ["不明", "鍵", "リストバンド", "靴箱の鍵と交換方式", "コイン式（有料）", "コイン返却式", "IC・電子キー", "暗証番号", "ダイヤル", "施錠なし（カゴ・棚）"],
      item.locker_key_type,
      "lockerKeyTypeOtherCheck",
      "lockerKeyTypeOther"
    );
    setCheckboxGroup(
      "lockerWristbandType",
      ["不明", "ゴム・シリコン型", "スパイラル型", "マジックテープ型", "バックル型"],
      item.locker_wristband_type,
      "lockerWristbandTypeOtherCheck",
      "lockerWristbandTypeOther"
    );
    setCheckboxGroup(
      "lockerWristbandUse",
      ["不明", "なし", "ロッカーキー", "館内決済", "入退館管理"],
      item.locker_wristband_use,
      "lockerWristbandUseOtherCheck",
      "lockerWristbandUseOther"
    );
    setCheckboxGroup(
      "lockerSize",
      ["正方形タイプ", "縦長タイプ", "通常型タイプ", "小型タイプ", "大型タイプ", "キャリーケース対応タイプ", "かごタイプ", "棚タイプ"],
      item.locker_size,
      "lockerSizeOtherCheck",
      "lockerSizeOther"
    );
    setRadioValue("lockerDivider", item.locker_divider);
    setRadioValue("lockerHanger", item.locker_hanger);
    setRadioValue("lockerSmallItemBox", item.locker_small_item_box);
    setRadioValue("lockerValuables", item.locker_valuables);
    setRadioValue("lockerRental", item.locker_rental);
    setRadioValue("lockerSuitcase", item.locker_suitcase);
    setValue("lockerNote", item.locker_note);

    // 👟 靴箱
    setValue("shoeboxCount", item.shoebox_count);
    setCheckboxGroup(
      "shoeboxType",
      ["不明", "個別靴箱", "オープン棚", "靴カゴ", "大型靴箱", "車いす・大型荷物対応スペース"],
      item.shoebox_type,
      "shoeboxTypeOtherCheck",
      "shoeboxTypeOther"
    );
    setCheckboxGroup(
      "shoeboxKeyType",
      ["不明", "鍵", "リストバンド", "コイン式", "コイン返却式", "IC・電子キー", "暗証番号", "ダイヤル", "施錠なし"],
      item.shoebox_key_type,
      "shoeboxKeyTypeOtherCheck",
      "shoeboxKeyTypeOther"
    );
    setRadioValue("shoeboxFee", item.shoebox_fee);
    setValue("shoeboxNote", item.shoebox_note);

    // 🚻 トイレ・バリアフリー
    setRadioValue("toiletLocationLobby", item.toilet_location_lobby);
    setRadioValue("toiletMensChangingRoom", item.toilet_mens_changing_room);
    setRadioValue("toiletWomensChangingRoom", item.toilet_womens_changing_room);
    setValue("toiletLocationOther", item.toilet_location_other);
    setCheckboxGroup(
      "toiletTypes",
      ["不明", "洋式トイレ", "和式トイレ", "小便器"],
      item.toilet_types,
      "toiletTypesOtherCheck",
      "toiletTypesOther"
    );
    setRadioValue("toiletAccessible", item.toilet_accessible);
    setRadioValue("toiletWheelchair", item.toilet_wheelchair);
    setRadioValue("toiletOstomate", item.toilet_ostomate);
    setRadioValue("toiletDiaperTable", item.toilet_diaper_table);
    setRadioValue("toiletBabyChairInToilet", item.toilet_baby_chair_in_toilet);
    setRadioValue("toiletSlope", item.toilet_slope);
    setRadioValue("toiletElevator", item.toilet_elevator);
    setValue("toiletBarrierFreeNote", item.toilet_barrier_free_note);

    // 🍴 お食事処
    setRadioValue("restaurantStatus", item.restaurant_status);
    setCheckboxGroup(
      "restaurantTypes",
      ["お食事処・レストラン", "食堂", "居酒屋", "カフェ", "軽食・売店", "ドリンクコーナー", "フードコート", "不明", "なし"],
      item.restaurant_types,
      "restaurantTypesOtherCheck",
      "restaurantTypesOther"
    );
    setValue("restaurantFeature", item.restaurant_feature);
    setRadioValue("restaurantHoursType", item.restaurant_hours_type);
    if (item.restaurant_hours_type === "営業時間あり") {
      $("restaurantHoursWrap")?.classList.remove("hidden");
    }
    setTimeValue("restaurantOpenTime", item.restaurant_open_time);
    setTimeValue("restaurantCloseTime", item.restaurant_close_time);
    setTimeValue("restaurantLastOrder", item.restaurant_last_order);
    setCheckboxGroup(
      "restaurantPayment",
      ["現金", "クレジットカード", "電子マネー", "QRコード決済", "食券制", "リストバンド決済"],
      item.restaurant_payment,
      "restaurantPaymentOtherCheck",
      "restaurantPaymentOther"
    );
    setCheckboxGroup(
      "restaurantOtherInfo",
      ["アルコール提供あり", "テイクアウト可能", "子ども向けメニューあり", "ベジタリアン対応", "座席あり", "個室・座敷あり"],
      item.restaurant_other_info,
      "restaurantOtherInfoOtherCheck",
      "restaurantOtherInfoOther"
    );
    setValue("restaurantNote", item.restaurant_note);

    // 🛋 休憩スペース
    setRadioValue("restSpaceStatus", item.rest_space_status);
    setCheckboxGroup(
      "restSpaceType",
      ["リクライニングチェア", "休憩ラウンジ", "畳・座敷", "仮眠スペース", "ソファスペース", "リラックスルーム", "ワークスペース", "テレビ付き", "雑誌・本あり", "おもちゃあり", "不明", "なし"],
      item.rest_space_type,
      "restSpaceTypeOtherCheck",
      "restSpaceTypeOther"
    );
    setRadioValue("restSpaceCondition", item.rest_space_condition);
    setRadioValue("restSpaceFeeType", item.rest_space_fee_type);
    if (item.rest_space_fee_type === "その他") {
      $("restSpaceFeeTypeOtherText")?.classList.remove("hidden");
    }
    if (item.rest_space_fee_type === "別料金") {
      $("restSpaceFeeAmountWrap")?.classList.remove("hidden");
    }
    setValue("restSpaceFeeAmount", item.rest_space_fee_amount);
    setRadioValue("restSpaceHoursType", item.rest_space_hours_type);
    if (item.rest_space_hours_type === "利用時間あり") {
      $("restSpaceHoursWrap")?.classList.remove("hidden");
    }
    setTimeValue("restSpaceHoursOpen", item.rest_space_hours_open);
    setTimeValue("restSpaceHoursClose", item.rest_space_hours_close);
    setRadioValue("restSpacePerPersonType", item.rest_space_per_person_type);
    if (item.rest_space_per_person_type === "時間指定") {
      $("restSpacePerPersonWrap")?.classList.remove("hidden");
    }
    setValue("restSpacePerPersonMinutes", item.rest_space_per_person_minutes);
    setValue("restSpaceNote", item.rest_space_note);

    // 💆‍♀️ マッサージ・リラクゼーション
    setRadioValue("massageStatus", item.massage_status);
    setCheckboxGroup(
      "massageTypes",
      ["マッサージ", "ボディケア・もみほぐし", "フットケア・足つぼ", "アカスリ", "ヘッドスパ", "エステ・美容", "整体・ストレッチ", "リラクゼーションサロン", "不明", "なし"],
      item.massage_types,
      "massageTypesOtherCheck",
      "massageTypesOther"
    );
    const massageFeeRows = $("massageFeeRows");
    if (massageFeeRows) {
      massageFeeRows.innerHTML = "";
      if (Array.isArray(item.massage_menu_fees) && item.massage_menu_fees.length) {
        item.massage_menu_fees.forEach((f) =>
          addFeeRow3("massageFeeRows", f.name || "", f.minutes ?? "", f.price ?? "", { focus: false })
        );
      }
    }
    setRadioValue("massageHoursType", item.massage_hours_type);
    if (item.massage_hours_type === "営業時間あり") {
      $("massageHoursWrap")?.classList.remove("hidden");
    }
    setTimeValue("massageHoursOpen", item.massage_hours_open);
    setTimeValue("massageHoursClose", item.massage_hours_close);
    setRadioValue("massageChairStatus", item.massage_chair_status);
    setValue("massageChairCount", item.massage_chair_count);
    setValue("massageChairMinutes", item.massage_chair_minutes);
    setValue("massageChairPrice", item.massage_chair_price);
    setValue("massageNote", item.massage_note);

    // 💬 レンタル・コワーキングスペース
    setRadioValue("rentalSpaceStatus", item.rental_space_status);
    setRadioValue("coworkingSpaceStatus", item.coworking_space_status);
    setCheckboxGroup(
      "coworkingFeatures",
      ["デスク・作業スペースあり", "Wi-Fiあり", "電源あり", "モニターあり", "通話可能", "個人ブースあり"],
      item.coworking_features,
      "coworkingFeaturesOtherCheck",
      "coworkingFeaturesOther"
    );
    setValue("coworkingNote", item.coworking_note);

    // 🥤 自動販売機
    setRadioValue("vendingMachineStatus", item.vending_machine_status);
    setCheckboxGroup(
      "vendingMachineTypes",
      ["ペットボトル飲料", "ビン飲料", "アイス", "軽食"],
      item.vending_machine_types,
      "vendingMachineTypesOtherCheck",
      "vendingMachineTypesOther"
    );
    setCheckboxGroup(
      "vendingMachineLocation",
      ["更衣室内", "休憩施設内", "ロビー", "屋外"],
      item.vending_machine_location,
      "vendingMachineLocationOtherCheck",
      "vendingMachineLocationOther"
    );
    setRadioValue("recycleBoxStatus", item.recycle_box_status);
    setValue("vendingMachineNote", item.vending_machine_note);

    // 🛍 売店コーナー
    setRadioValue("shopStatus", item.shop_status);
    setCheckboxGroup(
      "shopItems",
      ["入浴用品", "サウナ用品", "衣類・館内着", "履き物", "タオル・バスタオル", "化粧品・スキンケア用品", "軽食・お菓子", "お弁当・食品", "飲料", "アイス・スイーツ", "地元の食材", "お土産・特産品", "雑貨・グッズ", "その他の日用品"],
      item.shop_items,
      "shopItemsOtherCheck",
      "shopItemsOther"
    );
    setRadioValue("shopHoursType", item.shop_hours_type);
    if (item.shop_hours_type === "利用時間あり") {
      $("shopHoursWrap")?.classList.remove("hidden");
    }
    setTimeValue("shopHoursOpen", item.shop_hours_open);
    setTimeValue("shopHoursClose", item.shop_hours_close);
    setCheckboxGroup(
      "shopPayment",
      ["現金", "クレジットカード", "電子マネー", "QRコード決済", "リストバンド決済"],
      item.shop_payment,
      "shopPaymentOtherCheck",
      "shopPaymentOther"
    );
    setValue("shopNote", item.shop_note);

    // その他の各種施設
    setRadioValue("accommodationStatus", item.accommodation_status);
    setRadioValue("poolFacilityStatus", item.pool_facility_status);
    setRadioValue("gameCornerStatus", item.game_corner_status);
    setRadioValue("kidsCornerStatus", item.kids_corner_status);
    setRadioValue("outdoorFacilityStatus", item.outdoor_facility_status);
    setRadioValue("footBathStatus", item.foot_bath_status);
    setRadioValue("ganbanyokuStatus", item.ganbanyoku_status);
    setRadioValue("coinLaundryStatus", item.coin_laundry_status);
    setRadioValue("springTakeawayStatus", item.spring_takeaway_status);
    setRadioValue("onsenTamagoStatus", item.onsen_tamago_status);
    setRadioValue("wifiFacility", item.wifi_facility);
    if (item.wifi_facility === "有料") {
      $("wifiFeeWrap")?.classList.remove("hidden");
    }
    setValue("wifiFeeMinutes", item.wifi_fee_minutes);
    setValue("wifiFeePrice", item.wifi_fee_price);
    setRadioValue("chargingSpot", item.charging_spot);
    if (item.charging_spot === "有料") {
      $("chargingFeeWrap")?.classList.remove("hidden");
    }
    setValue("chargingFeeMinutes", item.charging_fee_minutes);
    setValue("chargingFeePrice", item.charging_fee_price);
    setRadioValue("aedFacilityStatus", item.aed_facility_status);
    setRadioValue("firstAidRoomStatus", item.first_aid_room_status);
    setValue("otherFacilityNote", item.other_facility_note);

    setValue("lat", item.lat);
    setValue("lng", item.lng);
    setValue("googleMapsUrl", item.google_maps_url);
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
              ? detailTags(
                  item.closed_days.map((d) =>
                    ["日", "月", "火", "水", "木", "金", "土"].includes(d) ? `${d}曜日` : d
                  )
                )
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
          ${item.closed_days_note ? `<p class="detail-note">${escapeHtml(item.closed_days_note)}</p>` : ""}

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
          <h3>💰 料金・決済方法</h3>

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
            ${detailField(
              "👤 定員",
              item.private_bath_capacity_status === "人数あり" && item.private_bath_capacity != null
                ? `${item.private_bath_capacity}人`
                : item.private_bath_capacity_status || ""
            )}
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
          <p class="field-subtitle">💧 温泉の色</p>
          ${detailTags(item.spring_color) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">👃 温泉の匂い</p>
          ${detailTags(item.spring_smell) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">🫧 温泉の感触・肌触り</p>
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
            ${detailField("🌡 泉温", item.spring_temperature != null ? `${item.spring_temperature}℃` : "")}
            ${detailField("🌡 源泉温度", item.source_temperature != null ? `${item.source_temperature}℃` : "")}
            ${detailField("🚰 pH", item.spring_ph)}
            ${detailField("♨️ 源泉名・温泉地名", item.spring_source_name)}
            ${detailField("♨️ 開湯年", item.spring_open_year)}
          </div>
          ${item.spring_open_year_note ? `<p class="detail-note">${escapeHtml(item.spring_open_year_note)}</p>` : ""}

          ${detailSubhead("🔍 水質検査等の情報")}
          <div class="detail-grid">
            ${detailField("🧪 温泉成分分析", item.spring_analysis)}
            ${detailField("分析年月日", item.spring_analysis_date)}
            ${detailField("🦠 レジオネラ属菌検査", item.legionella_test)}
            ${detailField("分析年月日", item.legionella_test_date)}
            ${detailField("検査結果", item.legionella_result)}
          </div>
          <p class="field-subtitle">📃 情報源</p>
          ${detailTags(item.spring_info_source) || `<p class="detail-note-tight">情報がありません。</p>`}
          <div class="detail-gap"></div>
          <div class="detail-grid">${detailField("👀 情報確認日", item.spring_info_check_date)}</div>

          ${detailSubhead("👦🏻 子どもの混浴制度")}
          <div class="detail-grid">
            ${detailField("混浴制度", item.child_mixed_bathing)}
            ${detailField("→ 年齢制限", item.child_age_limit)}
            ${detailField("→ 性別による制限", item.child_gender_limit)}
            ${detailField("👦🏻 男児", item.child_boy_age_limit != null ? `${item.child_boy_age_limit}歳以下` : "")}
            ${detailField("👧🏻 女児", item.child_girl_age_limit != null ? `${item.child_girl_age_limit}歳以下` : "")}
          </div>
          ${item.child_mixed_bathing_note ? `<p class="detail-note">${escapeHtml(item.child_mixed_bathing_note)}</p>` : ""}
          <p class="field-subtitle">📃 情報源</p>
          ${detailTags(item.child_info_source) || `<p class="detail-note-tight">情報がありません。</p>`}
          <div class="detail-gap"></div>
          <div class="detail-grid">${detailField("👀 情報確認日", item.child_info_check_date)}</div>
        </section>


        <!-- サウナ関連 -->
        <section class="detail-section">
          <h3>🧖‍♀️ サウナ関連</h3>

          ${detailSubhead("🧖‍♀️ サウナ設備")}
          <div class="detail-grid">
            ${detailField("🧖‍♀️ サウナ設備", item.sauna_facility)}
            ${detailField("🧖‍♀️ サウナ設備の場所", item.sauna_facility_location)}
          </div>
          ${item.sauna_facility_suspended ? `<p class="detail-note">⚠️ 現在休止中</p>` : ""}
          <p class="field-title">🧖‍♀️ サウナの種類</p>
          ${detailTags(item.sauna_types) || `<p class="detail-note-tight">情報がありません。</p>`}

          <p class="field-subtitle">🕒 サウナの利用時間</p>
          <p class="detail-note-tight">${escapeHtml(item.sauna_hours_type || "不明")}</p>
          ${
            item.sauna_hours_type === "利用時間あり"
              ? `
                <div class="detail-grid">
                  ${detailField(
                    "平日",
                    item.sauna_hours_weekday_open || item.sauna_hours_weekday_close
                      ? `${item.sauna_hours_weekday_open || "?"}〜${item.sauna_hours_weekday_close || "?"}`
                      : ""
                  )}
                  ${detailField(
                    "土曜日",
                    item.sauna_hours_saturday_open || item.sauna_hours_saturday_close
                      ? `${item.sauna_hours_saturday_open || "?"}〜${item.sauna_hours_saturday_close || "?"}`
                      : ""
                  )}
                  ${detailField(
                    "日曜日",
                    item.sauna_hours_sunday_open || item.sauna_hours_sunday_close
                      ? `${item.sauna_hours_sunday_open || "?"}〜${item.sauna_hours_sunday_close || "?"}`
                      : ""
                  )}
                  ${detailField(
                    "祝日",
                    item.sauna_hours_holiday_open || item.sauna_hours_holiday_close
                      ? `${item.sauna_hours_holiday_open || "?"}〜${item.sauna_hours_holiday_close || "?"}`
                      : ""
                  )}
                </div>
              `
              : ""
          }

          ${detailSubhead("🌡 サウナ室の仕様")}
          <div class="detail-grid">
            ${detailField(
              "🌡 サウナ室内の温度",
              item.sauna_temp_min != null || item.sauna_temp_max != null
                ? `${item.sauna_temp_min ?? "?"}℃〜${item.sauna_temp_max ?? "?"}℃`
                : ""
            )}
            ${detailField(
              "💧 サウナ室内の湿度",
              item.sauna_humidity_min != null || item.sauna_humidity_max != null
                ? `${item.sauna_humidity_min ?? "?"}%〜${item.sauna_humidity_max ?? "?"}%`
                : ""
            )}
            ${detailField("👤 サウナ室内の定員", item.sauna_capacity_number != null ? `${item.sauna_capacity_number}人` : "")}
            ${detailField("定員の目安", item.sauna_capacity_range)}
            ${detailField("🌡 温度計・湿度計", item.sauna_thermometer)}
            ${detailField("🕒 時計（現在時刻表示）", item.sauna_clock)}
            ${detailField("🕒 12分計", item.sauna_twelve_min_timer)}
            ${detailField("⏳ 砂時計", item.sauna_hourglass)}
            ${detailField("📺 テレビ", item.sauna_tv)}
            ${detailField("📺 テレビリモコン", item.sauna_tv_remote)}
            ${detailField("🪨 サウナストーン", item.sauna_stones)}
            ${detailField("🔥 ストーブタイプ", item.sauna_stove_type)}
            ${detailField(
              "→ ストーブの台数",
              item.sauna_stove_count_status === "台数あり" && item.sauna_stove_count != null
                ? `${item.sauna_stove_count}台`
                : item.sauna_stove_count_status || ""
            )}
            ${detailField("ストーブの製品名・メーカー", item.sauna_stove_brand)}
          </div>

          ${detailSubhead("🧖‍♀️ サウナマット・用品")}
          <div class="detail-grid">
            ${detailField("🧖‍♀️ サウナマットの貸し出し", item.sauna_mat_rental)}
            ${detailField("🧖‍♀️ サウナ用品のレンタル", item.sauna_goods_rental)}
            ${detailField("🧖‍♀️ サウナ用品の販売（施設内）", item.sauna_goods_sale)}
          </div>
          ${item.sauna_mat_rental === "あり" ? `<p class="field-title">→ サウナマットの種類</p>` : ""}
          ${detailTags(item.sauna_mat_type)}
          ${item.sauna_mat_rental === "あり" ? `<p class="field-title">→ サウナマットの設置場所・利用方法</p>` : ""}
          ${detailTags(item.sauna_mat_placement)}

          ${detailSubhead("🔥 ロウリュ・アウフグース")}
          <div class="detail-grid">
            ${detailField("🔥 ロウリュ", item.sauna_loyly)}
            ${detailField("→ アロマロウリュ", item.sauna_aroma_loyly)}
            ${detailField("アロマの種類", item.sauna_aroma_type)}
            ${detailField("→ アウフグース・熱波", item.sauna_aufguss)}
            ${detailField("→ 開催頻度", item.sauna_loyly_frequency)}
            ${detailField("開催時間", item.sauna_loyly_interval_minutes != null ? `${item.sauna_loyly_interval_minutes}分おき` : "")}
            ${detailField("→ 予約", item.sauna_loyly_reservation)}
          </div>
          ${item.sauna_loyly === "あり" ? `<p class="field-title">→ ロウリュの種類</p>` : ""}
          ${detailTags(item.sauna_loyly_type)}
          ${item.sauna_loyly_interval_note ? `<p class="detail-note">${escapeHtml(item.sauna_loyly_interval_note)}</p>` : ""}
          ${item.sauna_loyly_note ? `<p class="detail-note">${escapeHtml(item.sauna_loyly_note)}</p>` : ""}

          ${detailSubhead("🚪 サウナ室の出入り・照明")}
          <div class="detail-grid">
            ${detailField("🚪 サウナ室のドア", item.sauna_door_type)}
            ${detailField("🚪 サウナ室内から出る際", item.sauna_exit_direction)}
            ${detailField("💡 照明の明るさ", item.sauna_light_brightness)}
          </div>
          ${item.sauna_room_note ? `<p class="detail-note">${escapeHtml(item.sauna_room_note)}</p>` : ""}

          ${detailSubhead("💧 水風呂")}
          <div class="detail-grid">
            ${detailField("💧 水風呂", item.cold_bath_availability)}
            ${detailField("💧 水風呂の個数", item.cold_bath_count != null ? `${item.cold_bath_count}個` : "")}
            ${detailField(
              "🌡 水風呂の温度",
              item.cold_bath_temp_min != null || item.cold_bath_temp_max != null
                ? `${item.cold_bath_temp_min ?? "?"}℃〜${item.cold_bath_temp_max ?? "?"}℃`
                : ""
            )}
            ${detailField("👤 水風呂の定員", item.cold_bath_capacity != null ? `${item.cold_bath_capacity}人` : "")}
            ${detailField("💧 水風呂の深さ", item.cold_bath_depth != null ? `およそ${item.cold_bath_depth}cm` : "")}
            ${detailField("🚿 冷水シャワー", item.cold_shower)}
          </div>
          <p class="field-subtitle">💧 水風呂の形状</p>
          ${detailTags(item.cold_bath_shape) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">💧 水風呂の設置場所</p>
          ${detailTags(item.cold_bath_location) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">💧 水風呂の水源</p>
          ${detailTags(item.cold_bath_source) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">💧 水風呂の冷却方法</p>
          ${detailTags(item.cold_bath_cooling) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">💧 水風呂の水流</p>
          ${detailTags(item.cold_bath_flow) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${item.cold_bath_note ? `<p class="detail-note">${escapeHtml(item.cold_bath_note)}</p>` : ""}

          ${detailSubhead("🌿 外気浴・内気浴")}
          <div class="detail-grid">
            ${detailField("🌿 外気浴", item.outdoor)}
            ${detailField("🌿 内気浴", item.indoor_bathing)}
          </div>
          ${item.outdoor === "あり" ? `<p class="field-subtitle">→ 外気浴の設置場所</p>` : ""}
          ${detailTags(item.outdoor_location)}
          ${item.indoor_bathing === "あり" ? `<p class="field-subtitle">→ 内気浴の設置場所</p>` : ""}
          ${detailTags(item.indoor_location)}

          ${detailSubhead("🪑 ととのい椅子・設備")}
          <div class="detail-grid">
            ${detailField("🪑 ととのい椅子", item.tori_toi_chair)}
            ${detailField("ととのい椅子の数", item.tori_toi_chair_count != null ? `${item.tori_toi_chair_count}脚` : "")}
            ${detailField("🪑 リクライニングチェア", item.recline_chair)}
            ${detailField("リクライニングチェアの数", item.recline_chair_count != null ? `${item.recline_chair_count}脚` : "")}
            ${detailField("🪑 インフィニティチェア", item.infinity_chair)}
            ${detailField("インフィニティチェアの数", item.infinity_chair_count != null ? `${item.infinity_chair_count}脚` : "")}
            ${detailField("🪑 ベンチ", item.bench)}
            ${detailField("ベンチの数", item.bench_count != null ? `${item.bench_count}脚` : "")}
            ${detailField("🪑 デッキチェア", item.deck_chair)}
            ${detailField("デッキチェアの数", item.deck_chair_count != null ? `${item.deck_chair_count}脚` : "")}
            ${detailField("🌿 寝ころびスペース", item.laying_space)}
          </div>
          ${item.laying_space === "あり" ? `<p class="field-title">→ 材質</p>` : ""}
          ${detailTags(item.laying_space_material)}
          ${item.tori_toi_other_note ? `<p class="detail-note">${escapeHtml(item.tori_toi_other_note)}</p>` : ""}

          ${detailSubhead("🏠 環境")}
          <div class="detail-grid">
            ${detailField("🏠 屋根・雨対策", item.roof_rain_protection)}
            ${detailField("☀️ 日なた・日陰", item.sun_shade)}
          </div>
          <p class="field-subtitle">🏞️ 景色・景観</p>
          ${detailTags(item.scenery) || `<p class="detail-note-tight">情報がありません。</p>`}

          ${item.outdoor_indoor_note ? `<p class="detail-note">${escapeHtml(item.outdoor_indoor_note)}</p>` : ""}
        </section>

        <!-- シャワー -->
        <section class="detail-section">
          <h3>🚿 シャワー</h3>
          <div class="detail-grid">
            ${detailField("🚿 シャワーの数", item.shower_count)}
          </div>
          <p class="field-subtitle">🚿 シャワーの種類</p>
          ${detailTags(item.shower_type) || `<p class="detail-note-tight">情報がありません。</p>`}
          <div class="detail-gap"></div>
          <div class="detail-grid">
            ${detailField("🚿 シャワーヘッドの種類・メーカー等", item.shower_head_info)}
            ${detailField("🚰 吐水口・カラン", item.shower_faucet)}
            ${detailField("🚿 シャワーブース", item.shower_booth)}
            ${detailField("🚿 洗い場仕切り", item.wash_area_divider)}
            ${detailField("🗑 くず入れ（浴場内）", item.bath_trash_bin)}
            ${detailField("🚿 かけ湯", item.pre_rinse_water)}
          </div>
          ${item.shower_note ? `<p class="detail-note">${escapeHtml(item.shower_note)}</p>` : ""}
        </section>

        <!-- アメニティ -->
        <section class="detail-section">
          <h3>🧴 アメニティ・備品</h3>
          <div class="detail-grid">
            ${detailField("🧴 シャンプー・コンディショナー", item.shampoo_conditioner)}
            ${detailField("🧴 ボディソープ", item.body_soap)}
            ${detailField("🧼 石鹸", item.soap)}
            ${detailField("🧴 洗顔フォーム（浴場内）", item.face_wash)}
            ${detailField("🧴 クレンジング（浴場内）", item.cleansing)}
            ${detailField("🪣 洗面器・桶", item.basin)}
            ${detailField("🪑 浴場内の椅子", item.bath_chair)}
            ${detailField("🪑 シャワーチェア", item.shower_chair)}
            ${detailField("🔌 ドライヤー", item.dryer_status)}
            ${detailField("ドライヤーの個数", item.dryer_count)}
            ${detailField("ドライヤー使用料金", item.dryer_fee)}
            ${detailField("ドライヤーの種類・メーカー", item.dryer_brand)}
            ${detailField("ドライヤー持ち込み", item.dryer_bring_own)}
            ${detailField("🪥 ティッシュ", item.tissue)}
            ${detailField("🪥 綿棒", item.cotton_swab)}
            ${detailField("🪥 化粧品", item.cosmetics)}
            ${detailField("🪥 ヘアゴム", item.hair_tie)}
            ${detailField("💄 パウダールーム", item.powder_room)}
            ${detailField("💄 洗面台", item.vanity)}
            ${detailField("🚰 冷水機", item.water_cooler)}
            ${detailField("🔌 扇風機", item.fan)}
            ${detailField("🌡 体重計・体脂肪計", item.scale)}
            ${detailField("🌡 血圧計", item.blood_pressure_monitor)}
            ${detailField("🗑 ごみ箱", item.trash_bin)}
            ${detailField("🪑 更衣室内の椅子", item.locker_room_chair)}
            ${detailField("👶🏻 ベビーチェア", item.baby_chair)}
            ${detailField("👶🏻 ベビーベッド", item.baby_bed)}
          </div>
          ${
            Array.isArray(item.rental_items) && item.rental_items.length
              ? `
                <p class="field-title">🧴 レンタル品</p>
                <ul class="rental-list">
                  ${item.rental_items.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
                </ul>
              `
              : ""
          }
          ${item.amenity_note ? `<p class="detail-note">${escapeHtml(item.amenity_note)}</p>` : ""}
        </section>

        <!-- ロッカー -->
        <section class="detail-section">
          <h3>🔐 ロッカー</h3>
          <div class="detail-grid">
            ${detailField("🔐 ロッカー数", item.locker_count)}
          </div>
          <p class="field-subtitle">🔐 ロッカーキーの仕組み</p>
          ${detailTags(item.locker_key_type) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">⌚️ リストバンドの種類</p>
          ${detailTags(item.locker_wristband_type) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">⌚️ リストバンド用途</p>
          ${detailTags(item.locker_wristband_use) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">🔐 ロッカーの大きさ</p>
          ${detailTags(item.locker_size) || `<p class="detail-note-tight">情報がありません。</p>`}
          <div class="detail-gap"></div>
          <div class="detail-grid">
            ${detailField("🔐 ロッカー内の仕切り・2段タイプ", item.locker_divider)}
            ${detailField("👕 ロッカー内のハンガー", item.locker_hanger)}
            ${detailField("📱 ロッカー内の小物入れ", item.locker_small_item_box)}
            ${detailField("🔑 貴重品預け用ロッカー", item.locker_valuables)}
            ${detailField("🔐 レンタルロッカー", item.locker_rental)}
            ${detailField("👜 キャリーケース預け", item.locker_suitcase)}
          </div>
          ${item.locker_note ? `<p class="detail-note">${escapeHtml(item.locker_note)}</p>` : ""}
        </section>

        <!-- 靴箱 -->
        <section class="detail-section">
          <h3>👟 靴箱</h3>
          <div class="detail-grid">
            ${detailField("👟 靴箱数", item.shoebox_count)}
            ${detailField("🪙 利用料金", item.shoebox_fee)}
          </div>
          <p class="field-subtitle">👟 靴箱の仕組み</p>
          ${detailTags(item.shoebox_type) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">🔐 靴箱の鍵の仕組み</p>
          ${detailTags(item.shoebox_key_type) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${item.shoebox_note ? `<p class="detail-note">${escapeHtml(item.shoebox_note)}</p>` : ""}
        </section>

        <!-- トイレ・バリアフリー -->
        <section class="detail-section">
          <h3>🚻 トイレ・バリアフリー</h3>

          <p class="field-subtitle">🚻 トイレの設置場所</p>
          <div class="detail-grid">
            ${detailField("💁 ロビー・受付", item.toilet_location_lobby)}
            ${detailField("🚹 男性更衣室内のトイレ", item.toilet_mens_changing_room)}
            ${detailField("🚺 女性更衣室内のトイレ", item.toilet_womens_changing_room)}
          </div>
          ${item.toilet_location_other ? `<p class="detail-note">${escapeHtml(item.toilet_location_other)}</p>` : ""}

          <p class="field-subtitle">🚽 トイレの種類</p>
          ${detailTags(item.toilet_types) || `<p class="detail-note-tight">情報がありません。</p>`}

          <div class="detail-gap"></div>

          <div class="detail-grid">
            ${detailField("♿️ 身障者用・多目的トイレ", item.toilet_accessible)}
            ${detailField("♿️ 車椅子対応トイレ", item.toilet_wheelchair)}
            ${detailField("♿️ オストメイト対応トイレ", item.toilet_ostomate)}
            ${detailField("👶🏻 おむつ交換台", item.toilet_diaper_table)}
            ${detailField("👶🏻 ベビーチェア", item.toilet_baby_chair_in_toilet)}
          </div>

          <div class="detail-gap"></div>

          <div class="detail-grid detail-grid-large">
            ${detailField("♿️ スロープ", item.toilet_slope)}
            ${detailField("🛗 エレベーター・エスカレーター", item.toilet_elevator)}
          </div>
          ${item.toilet_barrier_free_note ? `<p class="detail-note">${escapeHtml(item.toilet_barrier_free_note)}</p>` : ""}
        </section>


        <!-- お食事処・休憩スペース等の施設 -->
        <section class="detail-section">
          <h3>🛋 お食事処・休憩スペース等の施設</h3>

          <div class="detail-grid">
            ${detailField("🍴 お食事処", item.restaurant_status)}
          </div>
          <p class="field-subtitle">🍴 お食事処の種類</p>
          ${detailTags(item.restaurant_types) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${item.restaurant_feature ? `<p class="detail-note">${escapeHtml(item.restaurant_feature)}</p>` : ""}
          <div class="detail-gap"></div>
          <div class="detail-grid">
            ${detailField("🕒 営業時間（お食事処）", item.restaurant_hours_type)}
          </div>
          ${
            item.restaurant_hours_type === "営業時間あり"
              ? `<div class="detail-grid">
                  ${detailField("開店時間", item.restaurant_open_time)}
                  ${detailField("閉店時間", item.restaurant_close_time)}
                  ${detailField("ラストオーダー", item.restaurant_last_order)}
                </div>`
              : ""
          }
          <p class="field-subtitle">💴 決済方法（お食事処）</p>
          ${detailTags(item.restaurant_payment) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">🍺 その他の情報</p>
          ${detailTags(item.restaurant_other_info) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${item.restaurant_note ? `<p class="detail-note">${escapeHtml(item.restaurant_note)}</p>` : ""}

          <div class="detail-gap"></div>

          <div class="detail-grid">
            ${detailField("🛋 休憩スペース", item.rest_space_status)}
            ${detailField("🛋 利用条件", item.rest_space_condition)}
            ${detailField("🪙 利用料金", item.rest_space_fee_type)}
            ${detailField("別料金", item.rest_space_fee_amount != null ? `${item.rest_space_fee_amount}円` : "")}
          </div>
          <p class="field-subtitle">🛋 休憩スペースの形式</p>
          ${detailTags(item.rest_space_type) || `<p class="detail-note-tight">情報がありません。</p>`}
          <div class="detail-gap"></div>
          <div class="detail-grid">
            ${detailField("🕒 利用時間（休憩スペース）", item.rest_space_hours_type)}
          </div>
          ${
            item.rest_space_hours_type === "利用時間あり"
              ? `<div class="detail-grid">
                  ${detailField("開始", item.rest_space_hours_open)}
                  ${detailField("終了", item.rest_space_hours_close)}
                </div>`
              : ""
          }
          <div class="detail-gap"></div>
          <div class="detail-grid">
            ${detailField(
              "1人あたりの利用時間",
              item.rest_space_per_person_type === "時間指定" && item.rest_space_per_person_minutes != null
                ? `${item.rest_space_per_person_minutes}分`
                : item.rest_space_per_person_type || ""
            )}
          </div>
          ${item.rest_space_note ? `<p class="detail-note">${escapeHtml(item.rest_space_note)}</p>` : ""}

          <div class="detail-gap"></div>

          <div class="detail-grid">
            ${detailField("💆‍♀️ マッサージ・リラクゼーション施設", item.massage_status)}
          </div>
          <p class="field-subtitle">💆‍♀️ マッサージ・リラクゼーション施設の種類</p>
          ${detailTags(item.massage_types) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${
            Array.isArray(item.massage_menu_fees) && item.massage_menu_fees.length
              ? `<p class="field-title">💴 料金</p>
                <ul class="rental-list">
                  ${item.massage_menu_fees
                    .map(
                      (f) =>
                        `<li>${escapeHtml(f.name)}：${f.minutes != null ? `${f.minutes}分` : "?"}${f.price != null ? `${f.price}円` : "?円"}</li>`
                    )
                    .join("")}
                </ul>`
              : ""
          }
          <div class="detail-gap"></div>
          <div class="detail-grid">
            ${detailField("🕒 営業時間（マッサージ）", item.massage_hours_type)}
          </div>
          ${
            item.massage_hours_type === "営業時間あり"
              ? `<div class="detail-grid">
                  ${detailField("開始", item.massage_hours_open)}
                  ${detailField("終了", item.massage_hours_close)}
                </div>`
              : ""
          }
          <div class="detail-gap"></div>
          <div class="detail-grid">
            ${detailField("💆‍♀️ マッサージチェア", item.massage_chair_status)}
            ${detailField("設置台数", item.massage_chair_count != null ? `${item.massage_chair_count}台` : "")}
            ${detailField(
              "時間・料金",
              item.massage_chair_minutes != null || item.massage_chair_price != null
                ? `${item.massage_chair_minutes ?? "?"}分 ${item.massage_chair_price ?? "?"}円`
                : ""
            )}
          </div>
          ${item.massage_note ? `<p class="detail-note">${escapeHtml(item.massage_note)}</p>` : ""}

          <div class="detail-gap"></div>

          <div class="detail-grid">
            ${detailField("💬 レンタルスペース", item.rental_space_status)}
            ${detailField("👩🏻‍💻 コワーキングスペース", item.coworking_space_status)}
          </div>
          <p class="field-subtitle">👩🏻‍💻 レンタル・コワーキングスペースの特徴</p>
          ${detailTags(item.coworking_features) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${item.coworking_note ? `<p class="detail-note">${escapeHtml(item.coworking_note)}</p>` : ""}

          <div class="detail-gap"></div>

          <div class="detail-grid">
            ${detailField("🥤 自動販売機", item.vending_machine_status)}
            ${detailField("🚮 リサイクルボックス", item.recycle_box_status)}
          </div>
          <p class="field-subtitle">🥤 自動販売機の種類</p>
          ${detailTags(item.vending_machine_types) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">🥤 設置場所</p>
          ${detailTags(item.vending_machine_location) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${item.vending_machine_note ? `<p class="detail-note">${escapeHtml(item.vending_machine_note)}</p>` : ""}

          <div class="detail-gap"></div>

          <div class="detail-grid">
            ${detailField("🛍 売店コーナー", item.shop_status)}
            ${detailField("🕒 営業時間（売店）", item.shop_hours_type)}
          </div>
          ${
            item.shop_hours_type === "利用時間あり"
              ? `<div class="detail-grid">
                  ${detailField("開始", item.shop_hours_open)}
                  ${detailField("終了", item.shop_hours_close)}
                </div>`
              : ""
          }
          <p class="field-subtitle">🛍 売店コーナーの品揃え</p>
          ${detailTags(item.shop_items) || `<p class="detail-note-tight">情報がありません。</p>`}
          <p class="field-subtitle">💴 決済方法（売店）</p>
          ${detailTags(item.shop_payment) || `<p class="detail-note-tight">情報がありません。</p>`}
          ${item.shop_note ? `<p class="detail-note">${escapeHtml(item.shop_note)}</p>` : ""}

          <div class="detail-gap"></div>

          <div class="detail-grid">
            ${detailField("🛌 宿泊施設", item.accommodation_status)}
            ${detailField("🏊 プール", item.pool_facility_status)}
            ${detailField("🎮 ゲームコーナー", item.game_corner_status)}
            ${detailField("👧🏻 キッズコーナー", item.kids_corner_status)}
            ${detailField("☀️ 屋外施設", item.outdoor_facility_status)}
            ${detailField("♨️ 足湯", item.foot_bath_status)}
            ${detailField("🪨 岩盤浴", item.ganbanyoku_status)}
            ${detailField("🧺 コインランドリー", item.coin_laundry_status)}
            ${detailField("🚰 源泉持ち帰り", item.spring_takeaway_status)}
            ${detailField("🥚 温泉たまご", item.onsen_tamago_status)}
            ${detailField("🛜 Wi-Fi", item.wifi_facility)}
            ${detailField(
              "Wi-Fi利用時間・料金",
              item.wifi_fee_minutes != null || item.wifi_fee_price != null
                ? `${item.wifi_fee_minutes ?? "?"}分 ${item.wifi_fee_price ?? "?"}円`
                : ""
            )}
            ${detailField("🔌 充電スポット", item.charging_spot)}
            ${detailField(
              "充電利用時間・料金",
              item.charging_fee_minutes != null || item.charging_fee_price != null
                ? `${item.charging_fee_minutes ?? "?"}分 ${item.charging_fee_price ?? "?"}円`
                : ""
            )}
            ${detailField("🚑 AED", item.aed_facility_status)}
            ${detailField("🏥 救護室", item.first_aid_room_status)}
          </div>
          ${item.other_facility_note ? `<p class="detail-note">${escapeHtml(item.other_facility_note)}</p>` : ""}
        </section>

        <!-- 地図情報 -->
        ${
          item.lat != null || item.lng != null || item.google_maps_url
            ? `
              <section class="detail-section">
                <h3>地図情報</h3>
                <div class="detail-grid">
                  ${detailField("緯度", item.lat)}
                  ${detailField("経度", item.lng)}
                </div>
                ${
                  item.google_maps_url || (item.lat != null && item.lng != null)
                    ? `
                      <p class="detail-links">
                        <a href="${
                          item.google_maps_url
                            ? escapeHtml(item.google_maps_url)
                            : `https://www.google.com/maps?q=${escapeHtml(item.lat)},${escapeHtml(item.lng)}`
                        }" target="_blank" rel="noopener">Googleマップで見る</a>
                      </p>
                    `
                    : ""
                }
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
    $("saunaStoveCountWrap")?.classList.add("hidden");
    $("privateBathCapacityWrap")?.classList.add("hidden");
    $("saunaStoveCountWrap")?.classList.add("hidden");
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
    $("saunaFacilityLocationOther")?.classList.add("hidden");
    $("saunaTypesOther")?.classList.add("hidden");
    $("saunaStoveTypeOther")?.classList.add("hidden");
    $("saunaMatTypeOther")?.classList.add("hidden");
    $("saunaMatPlacementOther")?.classList.add("hidden");
    $("saunaLoylyTypeOther")?.classList.add("hidden");
    $("saunaDoorTypeOther")?.classList.add("hidden");
    $("coldBathSourceOther")?.classList.add("hidden");
    $("coldBathCoolingOther")?.classList.add("hidden");
    $("coldBathFlowOther")?.classList.add("hidden");
    $("outdoorLocationOther")?.classList.add("hidden");
    $("indoorLocationOther")?.classList.add("hidden");
    $("layingSpaceMaterialOther")?.classList.add("hidden");
    $("sceneryOther")?.classList.add("hidden");
    $("lockerKeyTypeOther")?.classList.add("hidden");
    $("lockerWristbandTypeOther")?.classList.add("hidden");
    $("lockerWristbandUseOther")?.classList.add("hidden");
    $("lockerSizeOther")?.classList.add("hidden");
    $("shoeboxTypeOther")?.classList.add("hidden");
    $("shoeboxKeyTypeOther")?.classList.add("hidden");
    $("toiletTypesOther")?.classList.add("hidden");
    $("restaurantTypesOther")?.classList.add("hidden");
    $("restaurantPaymentOther")?.classList.add("hidden");
    $("restaurantOtherInfoOther")?.classList.add("hidden");
    $("restaurantHoursWrap")?.classList.add("hidden");
    $("restSpaceTypeOther")?.classList.add("hidden");
    $("restSpaceFeeTypeOtherText")?.classList.add("hidden");
    $("restSpaceFeeAmountWrap")?.classList.add("hidden");
    $("restSpaceHoursWrap")?.classList.add("hidden");
    $("restSpacePerPersonWrap")?.classList.add("hidden");
    $("massageTypesOther")?.classList.add("hidden");
    $("massageHoursWrap")?.classList.add("hidden");
    $("coworkingFeaturesOther")?.classList.add("hidden");
    $("vendingMachineTypesOther")?.classList.add("hidden");
    $("vendingMachineLocationOther")?.classList.add("hidden");
    $("shopItemsOther")?.classList.add("hidden");
    $("shopPaymentOther")?.classList.add("hidden");
    $("shopHoursWrap")?.classList.add("hidden");
    $("wifiFeeWrap")?.classList.add("hidden");
    $("chargingFeeWrap")?.classList.add("hidden");
    const massageFeeRows = $("massageFeeRows");
    if (massageFeeRows) massageFeeRows.innerHTML = "";
    $("saunaHoursWrap")?.classList.add("hidden");
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

      const massageFeeRows = $("massageFeeRows");
      if (massageFeeRows && !massageFeeRows.children.length) {
        addFeeRow3("massageFeeRows", "", "", "", { focus: false });
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

    // ラジオボタン方式の「その他」を選んだ時だけ自由記述欄を表示
    [
      ["purchaseMethod", "purchaseMethodOtherWrap"],
      ["saunaFacilityLocation", "saunaFacilityLocationOther"],
      ["saunaStoveType", "saunaStoveTypeOther"],
      ["saunaDoorType", "saunaDoorTypeOther"]
    ].forEach(([groupName, wrapId]) => {
      document.querySelectorAll(`input[name="${groupName}"]`).forEach((radio) => {
        radio.addEventListener("change", () => {
          const wrap = $(wrapId);
          if (!wrap) return;
          wrap.classList.toggle("hidden", radioValue(groupName) !== "その他");
        });
      });
    });

    // 決済方法の「その他」にチェックが入った時だけ自由記述欄を表示
    $("paymentOtherCheck")?.addEventListener("change", (event) => {
      const other = $("paymentOther");
      if (!other) return;
      other.classList.toggle("hidden", !event.target.checked);
    });

    // 浴場・浴槽関連の「その他」チェックボックスも同様にトグル
    // サウナの利用時間：「利用時間あり」を選んだ時だけ時間欄を表示
    document.querySelectorAll('input[name="saunaHoursType"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const wrap = $("saunaHoursWrap");
        if (!wrap) return;
        wrap.classList.toggle("hidden", radioValue("saunaHoursType") !== "利用時間あり");
      });
    });

    // 家族風呂・貸切風呂の定員：「人数を指定」を選んだ時だけ人数欄を表示
    document.querySelectorAll('input[name="privateBathCapacityStatus"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const wrap = $("privateBathCapacityWrap");
        if (!wrap) return;
        wrap.classList.toggle("hidden", radioValue("privateBathCapacityStatus") !== "人数あり");
      });
    });

    // ストーブの台数：「台数を指定」を選んだ時だけ台数欄を表示
    document.querySelectorAll('input[name="saunaStoveCountStatus"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const wrap = $("saunaStoveCountWrap");
        if (!wrap) return;
        wrap.classList.toggle("hidden", radioValue("saunaStoveCountStatus") !== "台数あり");
      });
    });

    // お食事処・休憩スペース等施設：条件付き表示のトグル一覧
    [
      ["restaurantHoursType", "営業時間あり", "restaurantHoursWrap"],
      ["restSpaceHoursType", "利用時間あり", "restSpaceHoursWrap"],
      ["restSpacePerPersonType", "時間指定", "restSpacePerPersonWrap"],
      ["massageHoursType", "営業時間あり", "massageHoursWrap"],
      ["shopHoursType", "利用時間あり", "shopHoursWrap"],
      ["wifiFacility", "有料", "wifiFeeWrap"],
      ["chargingSpot", "有料", "chargingFeeWrap"]
    ].forEach(([name, triggerValue, wrapId]) => {
      document.querySelectorAll(`input[name="${name}"]`).forEach((radio) => {
        radio.addEventListener("change", () => {
          const wrap = $(wrapId);
          if (!wrap) return;
          wrap.classList.toggle("hidden", radioValue(name) !== triggerValue);
        });
      });
    });

    // 休憩スペースの利用料金：「その他」を選んだ時だけ自由記述欄を表示
    document.querySelectorAll('input[name="restSpaceFeeType"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const other = $("restSpaceFeeTypeOtherText");
        const feeWrap = $("restSpaceFeeAmountWrap");
        if (other) other.classList.toggle("hidden", radioValue("restSpaceFeeType") !== "その他");
        if (feeWrap) feeWrap.classList.toggle("hidden", radioValue("restSpaceFeeType") !== "別料金");
      });
    });

    $("addMassageFee")?.addEventListener("click", () => addFeeRow3("massageFeeRows"));
    $("massageFeeRows")?.addEventListener("click", (event) => {
      const button = event.target.closest(".remove-rental");
      if (!button) return;
      button.closest(".rental-row")?.remove();
    });

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
      ["childInfoSourceOtherCheck", "childInfoSourceOther"],
      ["saunaTypesOtherCheck", "saunaTypesOther"],
      ["saunaMatTypeOtherCheck", "saunaMatTypeOther"],
      ["saunaMatPlacementOtherCheck", "saunaMatPlacementOther"],
      ["saunaLoylyTypeOtherCheck", "saunaLoylyTypeOther"],
      ["coldBathSourceOtherCheck", "coldBathSourceOther"],
      ["coldBathCoolingOtherCheck", "coldBathCoolingOther"],
      ["coldBathFlowOtherCheck", "coldBathFlowOther"],
      ["outdoorLocationOtherCheck", "outdoorLocationOther"],
      ["indoorLocationOtherCheck", "indoorLocationOther"],
      ["layingSpaceMaterialOtherCheck", "layingSpaceMaterialOther"],
      ["sceneryOtherCheck", "sceneryOther"],
      ["lockerKeyTypeOtherCheck", "lockerKeyTypeOther"],
      ["lockerWristbandTypeOtherCheck", "lockerWristbandTypeOther"],
      ["lockerWristbandUseOtherCheck", "lockerWristbandUseOther"],
      ["lockerSizeOtherCheck", "lockerSizeOther"],
      ["shoeboxTypeOtherCheck", "shoeboxTypeOther"],
      ["shoeboxKeyTypeOtherCheck", "shoeboxKeyTypeOther"],
      ["toiletTypesOtherCheck", "toiletTypesOther"],
      ["restaurantTypesOtherCheck", "restaurantTypesOther"],
      ["restaurantPaymentOtherCheck", "restaurantPaymentOther"],
      ["restaurantOtherInfoOtherCheck", "restaurantOtherInfoOther"],
      ["restSpaceTypeOtherCheck", "restSpaceTypeOther"],
      ["massageTypesOtherCheck", "massageTypesOther"],
      ["coworkingFeaturesOtherCheck", "coworkingFeaturesOther"],
      ["vendingMachineTypesOtherCheck", "vendingMachineTypesOther"],
      ["vendingMachineLocationOtherCheck", "vendingMachineLocationOther"],
      ["shopItemsOtherCheck", "shopItemsOther"],
      ["shopPaymentOtherCheck", "shopPaymentOther"]
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
