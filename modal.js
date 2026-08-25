// ===== モーダル開閉 =====
const $modal = s => document.querySelector(s);

function openModal(){
  const modal = $modal("#modal");
  if(!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(()=> $modal("#name")?.focus(), 0);
}

function closeModal(){
  const modal = $modal("#modal");
  if(!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

$modal("#add")?.addEventListener("click", openModal);
$modal("#close")?.addEventListener("click", closeModal);
$modal("#cancel")?.addEventListener("click", closeModal);
$modal("#modal")?.addEventListener("click", e=>{
  if(e.target === e.currentTarget) closeModal();
});
document.addEventListener("keydown", e=>{
  if(e.key === "Escape" && !$modal("#modal")?.classList.contains("hidden")) closeModal();
});
