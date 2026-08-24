const data=[{name:"草津温泉",area:"群馬県",price:800,note:"日本を代表する温泉地。共同浴場も充実しています。"},
{name:"道後温泉",area:"愛媛県",price:700,note:"歴史ある温泉街。周辺の観光も楽しめます。"},
{name:"別府温泉",area:"大分県",price:600,note:"さまざまな泉質の温泉を楽しめます。"}];
let list=[...data];
const $=s=>document.querySelector(s);
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#039;"}[c]))}
function render(){const q=$("#search").value.toLowerCase();const a=list.filter(x=>(x.name+x.area).toLowerCase().includes(q));$("#count").textContent=a.length+"件";$("#cards").innerHTML=a.map((x,i)=>`<article class="card"><span class="badge">♨ 温泉</span><h3>${esc(x.name)}</h3><div class="area">📍 ${esc(x.area||"地域未登録")}</div><div class="price">${x.price?"¥"+Number(x.price).toLocaleString():"料金不明"} <small>入浴料金</small></div><div class="note">${esc(x.note)}</div><button class="detail" onclick="alert('${esc(x.name)}\n${esc(x.area)}\n料金：${x.price?"¥"+x.price:"不明"}')">詳細を見る</button></article>`).join("")}
$("#search").oninput=render;$("#add").onclick=()=>$("#modal").classList.remove("hidden");$("#close").onclick=()=>$("#modal").classList.add("hidden");
$("#form").onsubmit=e=>{e.preventDefault();list.push({name:$("#name").value,area:$("#area").value,price:$("#price").value,note:$("#note").value});e.target.reset();$("#modal").classList.add("hidden");render()};render();