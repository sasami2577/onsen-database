const data=[{name:"草津温泉",area:"群馬県",price:800,note:"日本を代表する温泉地。共同浴場も充実しています。"},{name:"道後温泉",area:"愛媛県",price:700,note:"歴史ある温泉街。周辺の観光も楽しめます。"},{name:"別府温泉",area:"大分県",price:600,note:"さまざまな泉質の温泉を楽しめます。"}];
let list=[...data];const $=s=>document.querySelector(s);function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}function vals(n){return [...document.querySelectorAll(`input[name="${n}"]:checked`)].map(x=>x.value)}function radio(n){return document.querySelector(`input[name="${n}"]:checked`)?.value||"不明"}
function render(){const q=$("#search").value.toLowerCase();const a=list.filter(x=>(x.name+(x.area||"")+(x.prefecture||"")).toLowerCase().includes(q));$("#count").textContent=a.length+"件";$("#cards").innerHTML=a.map(x=>`<article class="card"><span class="badge">♨ 温泉</span><h3>${esc(x.name)}</h3><div class="area">📍 ${esc(x.prefecture||x.area||"地域未登録")}${x.area&&x.prefecture?" "+esc(x.area):""}</div><div class="price">${x.price!==""&&x.price!=null?"¥"+Number(x.price).toLocaleString():"料金不明"} <small>入浴料金</small></div><div class="tags">${(x.sauna||[]).slice(0,3).map(v=>`<span>${esc(v)}</span>`).join("")}</div><div class="note">${esc(x.note||"")}</div><button class="detail" onclick="showDetail(${x.id})">詳細を見る</button></article>`).join("")}
function showDetail(id){
  const x=list.find(v=>v.id===id); if(!x)return;
  alert([
    x.name, `${x.prefecture||""} ${x.area||""}`.trim(),
    x.businessType?`業態：${x.businessType}`:"",
    x.openTime&&x.closeTime?`営業時間：${x.openTime}〜${x.closeTime}`:"",
    x.closedDays?`定休日：${x.closedDays}`:"",
    x.price!==""&&x.price!=null?`大人料金：¥${Number(x.price).toLocaleString()}`:"",
    x.childPrice?`子ども料金：¥${Number(x.childPrice).toLocaleString()}`:"",
    x.payment?.length?`決済：${x.payment.join("、")}`:"",
    x.springType?`泉質：${x.springType}`:"",
    x.sauna?.length?`サウナ：${x.sauna.join("、")}`:"",
    x.bath?.length?`浴場：${x.bath.join("、")}`:"",
    x.rentals?.length?`レンタル：${x.rentals.map(r=>r.name+(r.price!==""?" "+r.price+"円":"")).join("、")}`:"",
    x.note||""
  ].filter(Boolean).join("\n"))
}
function addRentalRow(){const r=document.createElement("div");r.className="rental-row";r.innerHTML='<input class="rental-name" placeholder="品名（例：バスタオル）"><input class="rental-price" type="number" min="0" placeholder="料金"><button type="button" class="remove-rental">×</button>';r.querySelector(".remove-rental").onclick=()=>r.remove();$("#rentalRows").appendChild(r)}function resetForm(){$("#form").reset();document.querySelectorAll('input[type="radio"][value="不明"]').forEach(x=>x.checked=true);$("#rentalRows").innerHTML="";addRentalRow()}
function openModal(){$("#modal").classList.remove("hidden");$("#modal").setAttribute("aria-hidden","false");document.body.classList.add("modal-open");$("#modal").scrollTop=0;setTimeout(()=>$("#name").focus({preventScroll:true}),50)}function closeModal(){$("#modal").classList.add("hidden");$("#modal").setAttribute("aria-hidden","true");document.body.classList.remove("modal-open")}
$("#search").oninput=render;$("#add").onclick=openModal;$("#close").onclick=closeModal;$("#cancel").onclick=closeModal;$("#addRental").onclick=addRentalRow;$("#modal").onclick=e=>{if(e.target.id==="modal")closeModal()};document.onkeydown=e=>{if(e.key==="Escape")closeModal()};
$("#form").onsubmit=e=>{
  e.preventDefault();
  const rentals=[...document.querySelectorAll(".rental-row")].map(r=>({
    name:r.querySelector(".rental-name").value.trim(),
    price:r.querySelector(".rental-price").value
  })).filter(x=>x.name);
  const item={
    id:Date.now(), name:$("#name").value.trim(), prefecture:$("#prefecture").value,
    area:$("#area").value.trim(), address:$("#address").value.trim(),
    businessType:$("#businessType").value, phone:$("#phone").value.trim(),
    usage:vals("usage"), openTime:$("#openTime").value, closeTime:$("#closeTime").value,
    lastEntry:$("#lastEntry").value, closedDays:$("#closedDays").value.trim(),
    hoursNote:$("#hoursNote").value.trim(), price:$("#price").value,
    childPrice:$("#childPrice").value, otherPrice:$("#otherPrice").value,
    priceType:$("#priceType").value, priceNote:$("#priceNote").value.trim(),
    payment:vals("payment"), website:$("#website").value.trim(),
    instagram:$("#instagram").value.trim(), twitter:$("#twitter").value.trim(),
    facebook:$("#facebook").value.trim(), bath:vals("bath"), sauna:vals("sauna"),
    saunaStatus:$("#saunaStatus").value, saunaTemp:$("#saunaTemp").value,
    coldBathStatus:$("#coldBathStatus").value, coldBathTemp:$("#coldBathTemp").value,
    outdoor:radio("outdoor"), rest:radio("rest"), amenities:radio("amenities"),
    dryer:radio("dryer"), wifi:radio("wifi"), parking:radio("parking"),
    locker:radio("locker"), restaurant:radio("restaurant"), barrierFree:radio("barrierFree"),
    springType:$("#springType").value, temperature:$("#temperature").value,
    sourceTemp:$("#sourceTemp").value, heating:$("#heating").value, dilution:$("#dilution").value,
    circulation:$("#circulation").value, disinfection:$("#disinfection").value,
    springNote:$("#springNote").value.trim(), rentals, lat:$("#lat").value, lng:$("#lng").value,
    note:$("#note").value.trim()
  };
  list.push(item); resetForm(); closeModal(); render()
};resetForm();render();