let CURRENT = null;

function show(id) {
  CURRENT = id;
  document.getElementById("vName").textContent = id.full_name || "—";
  document.getElementById("vEmail").textContent = id.email || "—";
  document.getElementById("vUser").textContent = id.username || "—";
  document.getElementById("vPass").textContent = id.password || "—";
  document.getElementById("vDob").textContent =
    (id.dob_month_name || id.dob_month) + " " + id.dob_day + ", " + id.dob_year;
  document.getElementById("vCountry").textContent = id.country || "—";
}

function copyValue(which) {
  if (!CURRENT) return "";
  if (which === "dob") return (CURRENT.dob_month_name || CURRENT.dob_month) + " " + CURRENT.dob_day + ", " + CURRENT.dob_year;
  return CURRENT[which] || "";
}

function load() {
  chrome.runtime.sendMessage({ type: "GET_IDENTITY" }, (resp) => {
    if (resp && resp.identity) show(resp.identity);
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".cp");
  if (!btn) return;
  const val = copyValue(btn.dataset.c);
  navigator.clipboard.writeText(val).then(() => {
    const old = btn.textContent;
    btn.textContent = "Copied"; btn.classList.add("done");
    setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1100);
  });
});

document.getElementById("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL_NOW" });
    const st = document.getElementById("st");
    st.textContent = "Filling the current page…";
    setTimeout(() => { st.textContent = ""; }, 1600);
    window.close();
  }
});

document.getElementById("regen").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "REGENERATE" }, (resp) => {
    if (resp && resp.identity) {
      show(resp.identity);
      const st = document.getElementById("st");
      st.textContent = "New identity generated for this profile.";
      setTimeout(() => { st.textContent = ""; }, 1800);
    }
  });
});

load();
