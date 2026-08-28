(() => {
  "use strict";

  const TABLE_NAME = "onsen_database";
  const LOCAL_KEY = "onsen_database_local_v1";

  const $ = (id) => document.getElementById(id);

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getIdFromUrl() {
    return new URLSearchParams(location.search).get("id") || "";
  }

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

  function getSupabaseClient() {
    const url = window.ONSEN_SUPABASE_CONFIG?.url || "";
    const anonKey = window.ONSEN_SUPABASE_CONFIG?.anonKey || "";

    if (!url || !anonKey) return null;
    if (!window.supabase?.createClient) return null;

    try {
      return window.supabase.createClient(url, anonKey);
    } catch (error) {
      console.error("Supabase初期化エラー:", error);
      return null;
    }
  }

  async function getSupabaseItem(id) {
    const client = getSupabaseClient();
    if (!client || !id) return null;

    const { data, error } = await client
      .from(TABLE_NAME)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("温泉詳細読込エラー:", error);
      return null;
    }

    return data;
  }

  async function getOnsen(id) {
    if (!id) return null;

    const localItem = getLocalData().find(
      (item) => String(item.id || "") === String(id)
    );

    const supabaseItem = await getSupabaseItem(id);

    return supabaseItem || localItem || null;
  }

  function showField(label, value) {
    if (value === null || value === undefined || value === "") return "";
    return `
      <div class="info-item">
        <span class="info-label">${escapeHtml(label)}</span>
        <span class="info-value">${escapeHtml(value)}</span>
      </div>
    `;
  }

  function showArray(label, values) {
    if (!Array.isArray(values) || !values.length) return "";
    return `
      <div class="info-item full">
        <span class="info-label">${escapeHtml(label)}</span>
        <div class="tag-list">
          ${values.map(v => `<span class="tag">${escapeHtml(v)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  function setSectionVisibility(sectionId, content) {
    const section = $(sectionId);
    if (!section) return;

    const hasContent = String(content || "").trim() !== "";
    section.classList.toggle("hidden", !hasContent);
  }

  function render(item) {
    $("name").textContent = item.name || "名称未設定";
    $("businessType").textContent = item.business_type || "温泉施設";

    const place = [
      item.prefecture,
      item.area,
      item.address
    ].filter(Boolean).join(" ");

    $("place").textContent = place;

    const basic = [
      showField("電話番号", item.phone),
      showField("施設業態", item.business_type)
    ].join("");

    $("basicInfo").innerHTML = basic;
    setSectionVisibility("basicSection", basic);

    const hours = [
      showField(
        "営業時間",
        item.open_time || item.close_time
          ? `${item.open_time || ""}${item.open_time || item.close_time ? "〜" : ""}${item.close_time || ""}`
          : ""
      ),
      showField("最終受付", item.last_entry),
      showField("定休日", item.closed_days),
      showField("補足", item.hours_note)
    ].join("");

    $("hoursInfo").innerHTML = hours;
    setSectionVisibility("hoursSection", hours);

    const price = [
      showField("大人料金", item.price != null ? `${item.price}円` : ""),
      showField("子ども料金", item.child_price != null ? `${item.child_price}円` : ""),
      showField("その他料金", item.other_price != null ? `${item.other_price}円` : ""),
      showField("料金区分", item.price_category),
      showArray("利用条件", item.usage),
      showArray("決済方法", item.payment),
      showField("料金の補足", item.price_note)
    ].join("");

    $("priceInfo").innerHTML = price;
    setSectionVisibility("priceSection", price);

    const links = [];
    if (item.website) {
      links.push(`<a href="${escapeHtml(item.website)}" target="_blank" rel="noopener">公式サイト ↗</a>`);
    }
    if (item.instagram) {
      links.push(`<a href="${escapeHtml(item.instagram)}" target="_blank" rel="noopener">Instagram ↗</a>`);
    }

    $("officialInfo").innerHTML = links.join("");
    setSectionVisibility("officialSection", links.join(""));

    const bath = [
      showArray("お風呂の種類", item.bath),
      showArray("サウナの種類", item.sauna),
      showField("サウナ", item.sauna_status),
      showField("サウナ補足", item.sauna_note),
      showField("水風呂", item.cold_bath_status)
    ].join("");

    $("bathInfo").innerHTML = bath;
    setSectionVisibility("bathSection", bath);

    const equipment = [
      showField("外気浴", item.outdoor),
      showField("休憩スペース", item.rest),
      showField("シャンプー等", item.amenities),
      showField("ドライヤー", item.dryer),
      showField("Wi-Fi", item.wifi),
      showField("駐車場", item.parking),
      showField("貴重品ロッカー", item.locker),
      showField("食事処", item.restaurant),
      showField("バリアフリー", item.barrier_free)
    ].join("");

    $("equipmentInfo").innerHTML = equipment;
    setSectionVisibility("equipmentSection", equipment);

    const spring = [
      showField("泉質", item.spring_type),
      showField("泉温", item.temperature != null ? `${item.temperature}℃` : ""),
      showField("源泉温度", item.source_temperature != null ? `${item.source_temperature}℃` : ""),
      showField("加温", item.heating),
      showField("加水", item.dilution),
      showField("循環", item.circulation),
      showField("消毒", item.disinfection),
      showField("泉質の詳細", item.spring_detail)
    ].join("");

    $("springInfo").innerHTML = spring;
    setSectionVisibility("springSection", spring);

    const rentals = Array.isArray(item.rental_items)
      ? item.rental_items
      : [];

    $("rentalInfo").innerHTML = rentals.length
      ? rentals.map(v => `<span class="tag">${escapeHtml(v)}</span>`).join("")
      : "";

    setSectionVisibility("rentalSection", rentals.length ? "yes" : "");

    const hasLatLng =
      item.lat !== null && item.lat !== undefined && item.lat !== "" &&
      item.lng !== null && item.lng !== undefined && item.lng !== "";

    if (hasLatLng) {
      const lat = Number(item.lat);
      const lng = Number(item.lng);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const mapUrl =
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

        $("mapInfo").innerHTML = `
          <p class="coordinates">緯度 ${escapeHtml(lat)} / 経度 ${escapeHtml(lng)}</p>
          <a class="map-link" href="${mapUrl}" target="_blank" rel="noopener">
            Googleマップで見る ↗
          </a>
        `;
      } else {
        $("mapInfo").textContent = "位置情報は登録されていますが、数値として読み込めませんでした。";
      }
    } else {
      $("mapInfo").textContent = "位置情報はまだ登録されていません。";
    }

    $("note").textContent = item.note || "";
    setSectionVisibility("noteSection", item.note || "");
  }

  function showNotFound(message = "") {
    $("detail")?.classList.add("hidden");
    $("notFound")?.classList.remove("hidden");

    if (message) {
      $("status").textContent = message;
      $("status").className = "status error";
    } else {
      $("status").textContent = "";
      $("status").className = "status hidden";
    }
  }

  async function start() {
    const id = getIdFromUrl();

    if (!id) {
      showNotFound("温泉IDが指定されていません。");
      return;
    }

    const item = await getOnsen(id);

    if (!item) {
      showNotFound("指定された温泉が見つかりませんでした。");
      return;
    }

    render(item);
    $("status")?.classList.add("hidden");
    $("detail")?.classList.remove("hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
