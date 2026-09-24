const select = document.getElementById("privacy-language");
let language = "en";
try { language = localStorage.getItem("jev-decision-lab-language") === "zh" ? "zh" : "en"; } catch { /* storage may be unavailable */ }
function render() {
  const english = language === "en";
  document.documentElement.lang = english ? "en" : "zh-CN";
  document.title = english ? "Data handling · Jev Decision Lab" : "数据说明 · Jev Decision Lab";
  document.getElementById("privacy-title").textContent = english ? "How data is handled" : "数据如何处理";
  document.getElementById("privacy-language-label").textContent = english ? "Interface language" : "界面语言";
  document.getElementById("privacy-back").textContent = english ? "Back to playground" : "返回实验室";
  select.setAttribute("aria-label", english ? "Interface language" : "界面语言");
  select.querySelector('option[value="zh"]').textContent = english ? "Chinese (Simplified)" : "简体中文";
  document.getElementById("chinese").hidden = english;
  document.getElementById("english").hidden = !english;
  select.value = language;
}
select.addEventListener("change", () => {
  language = select.value === "en" ? "en" : "zh";
  try { localStorage.setItem("jev-decision-lab-language", language); } catch { /* still switch for this page */ }
  render();
});
render();
