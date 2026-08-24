/* === Toast notifications === */
function showToast(html, ms = 3000) {
  const wrap = $("#toast-wrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = html;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; setTimeout(() => el.remove(), 260); }, ms);
  return el;
}
