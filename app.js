constSUPABASE_URL="https://kquwafghdaopeeqsalxm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6jb3CQIiwJf7dR1eEGMStq_MLcoJVeM";

const db = (!SUPABASE_URL.includes("ここに") && !SUPABASE_ANON_KEY.includes("ここに"))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let onsenList = [];
const $ = s => document.querySelector(s);
const checked = n => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map(x=>x.value);
const radio = n => document.querySelector(`input[name="${n}"]:checked`)?.value || "不明";

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function render(){
  const q=($("#search")?.value || "").trim().toLowerCase();
  const list=onsenList.filter(x=>{
    const text=[x.name,x.prefecture,x.area,x.address].filter(Boolean).join(" ").toLowerCase();
    return text.includes(q);
  });

  const count=$("#count");
  const cards=$("#cards");
  if(count) count.textContent=`${list.length}件`;
  if(!cards) return;

  if(!list.length){
    cards.innerHTML='<p class="empty">まだ登録されている温泉がありません。</p>';
    return;
  }

  cards.innerHTML=list.map(x=>`
    <article class="card">
      <span class="badge">♨ 温泉</span>
      <h3>${esc(x.name)}</h3>
      <div class="area">📍 ${esc(x.prefecture || x.area || "地域未登録")}${x.area && x.prefecture ? " " + esc(x.area) : ""}</div>
      <div class="price">${x.price !== "" && x.price != null ? "¥" + Number(x.price).toLocaleString() : "料金不明"} <small>入浴料金</small></div>
      <div class="note">${esc(x.note || "")}</div>
      <button type="button" class="detail" data-onsen-id="${esc(x.id)}">詳細を見る</button>
    </article>
  `).join("");
}

function showDetail(id){
  const x=onsenList.find(v=>String(v.id)===String(id));
  if(!x) return;
  alert([
    x.name,
    `${x.prefecture||""} ${x.area||""}`.trim(),
    x.businessType ? `業態：${x.businessType}` : "",
    x.openTime && x.closeTime ? `営業時間：${x.openTime}〜${x.closeTime}` : "",
    x.closedDays ? `定休日：${x.closedDays}` : "",
    x.price !== "" && x.price != null ? `大人料金：¥${Number(x.price).toLocaleString()}` : "",
    x.springType ? `泉質：${x.springType}` : "",
    x.note || ""
  ].filter(Boolean).join("\n"));
}

function openModal(){
  const modal=$("#modal");
  if(!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-open");
  setTimeout(()=>$("#name")?.focus({preventScroll:true}),50);
}

function closeModal(){
  const modal=$("#modal");
  if(!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
  document.body.classList.remove("modal-open");
}

$("#search")?.addEventListener("input",render);
$("#add")?.addEventListener("click",openModal);
$("#close")?.addEventListener("click",closeModal);
$("#cancel")?.addEventListener("click",closeModal);
$("#modal")?.addEventListener("click",e=>{
  if(e.target.id==="modal") closeModal();
});
$("#cards")?.addEventListener("click",e=>{
  const button=e.target.closest(".detail");
  if(button) showDetail(button.dataset.onsenId);
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape") closeModal();
});


function collectFormData(){
  const get=id=>$(id)?.value ?? "";
  const rentals=[...document.querySelectorAll(".rental-row")].map(r=>({
    name:r.querySelector(".rental-name")?.value.trim()||"",
    price:r.querySelector(".rental-price")?.value||""
  })).filter(x=>x.name);

  return {
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),
    name:get("#name").trim(), prefecture:get("#prefecture"), area:get("#area").trim(),
    address:get("#address").trim(), businessType:get("#businessType"), phone:get("#phone").trim(),
    openTime:get("#openTime"), closeTime:get("#closeTime"), lastEntry:get("#lastEntry"),
    closedDays:get("#closedDays"), hoursNote:get("#hoursNote"),
    usage:checked("usage"), price:get("#price"), childPrice:get("#childPrice"), otherPrice:get("#otherPrice"),
    priceType:get("#priceType"), priceNote:get("#priceNote"), payment:checked("payment"),
    website:get("#website"), instagram:get("#instagram"), twitter:get("#twitter"), facebook:get("#facebook"),
    bath:checked("bath"), bathNote:get("#bathNote"), sauna:checked("sauna"), saunaNote:get("#saunaNote"),
    saunaStatus:get("#saunaStatus"), saunaTemp:get("#saunaTemp"), coldBathStatus:get("#coldBathStatus"),
    coldBathTemp:get("#coldBathTemp"), outdoor:radio("outdoor"), rest:radio("rest"), amenities:radio("amenities"),
    dryer:radio("dryer"), wifi:radio("wifi"), parking:radio("parking"), locker:radio("locker"),
    restaurant:radio("restaurant"), barrierFree:radio("barrierFree"),
    springType:get("#springType"), temperature:get("#temperature"), sourceTemp:get("#sourceTemp"),
    heating:get("#heating"), dilution:get("#dilution"), circulation:get("#circulation"),
    disinfection:get("#disinfection"), springDetail:get("#springDetail"), rentals, lat:get("#lat"), lng:get("#lng"), note:get("#note")
  };
}

async function loadOnsenData(){
  if(!db) return;
  const {data,error}=await db.from("onsen_database").select("id,created_at,data").order("created_at",{ascending:true});
  if(error){console.error(error);return;}
  onsenList=(data||[]).map(r=>({...r.data,_dbId:r.id,_createdAt:r.created_at}));
  if(typeof render==="function") render();
}

async function saveOnsenData(item){
  if(!db) throw new Error("SupabaseのURL / anon keyが未設定です。");
  const {data,error}=await db.from("onsen_database").insert({data:item}).select("id,created_at,data").single();
  if(error) throw error;
  return {...data.data,_dbId:data.id,_createdAt:data.created_at};
}

function addRentalRow(){
  const row=document.createElement("div");
  row.className="rental-row";
  row.innerHTML='<input class="rental-name" placeholder="品名（例：バスタオル）"><input class="rental-price" type="number" min="0" placeholder="料金"><button type="button" class="remove-rental">×</button>';
  row.querySelector(".remove-rental").onclick=()=>row.remove();
  $("#rentalRows")?.appendChild(row);
}
$("#addRental")?.addEventListener("click",addRentalRow);

$("#form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const b=e.submitter||$(".submit"); if(b){b.disabled=true;b.textContent="保存中…";}
  try{
    const item=collectFormData();
    if(!item.name){alert("温泉名を入力してください。");return;}
    const saved=await saveOnsenData(item);
    onsenList.push(saved);
    if(typeof render==="function") render();
    if(typeof closeModal==="function") closeModal();
    alert(`「${item.name}」をSupabaseに保存しました！`);
  }catch(err){
    console.error(err);
    alert("保存できませんでした。\n\nSupabaseのURL・anon key、onsen_databaseテーブル、RLSポリシーを確認してください。\n\n詳細："+(err?.message||err));
  }finally{if(b){b.disabled=false;b.textContent="登録する";}}
});

loadOnsenData();
