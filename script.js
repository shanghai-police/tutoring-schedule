const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

let supabaseClient = null;
if(window.supabase && typeof window.supabase.createClient === "function"){
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function emptyRow(){
  return { id: uid(), studentName:"", start:"", finish:"", address:"", payRate:"", notes:"", paid:false };
}

function computeTotal(row){
  if(!row.start || !row.finish || !row.payRate) return 0;
  const [sh, sm] = row.start.split(":").map(Number);
  const [fh, fm] = row.finish.split(":").map(Number);
  if(isNaN(sh)||isNaN(sm)||isNaN(fh)||isNaN(fm)) return 0;
  let hours = (fh*60+fm - (sh*60+sm)) / 60;
  if(hours < 0) hours = 0;
  const rate = parseFloat(row.payRate);
  if(isNaN(rate)) return 0;
  return hours * rate;
}

function fmt(n){
  return "$" + n.toFixed(2);
}

function pad(n){ return n.toString().padStart(2,"0"); }

function isoDate(d){
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
}

function mondayOf(date){
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate()+n);
  return d;
}

function weekKey(monday){
  return "week:" + isoDate(monday);
}

function displayDate(d){
  return d.toLocaleDateString(undefined, { day:"numeric", month:"short" });
}

// ---------- storage helpers (Supabase-backed key/value store) ----------
async function loadJSON(key, fallback){
  try{
    const { data, error } = await supabaseClient
      .from("kv_store")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if(error) throw error;
    return data ? data.value : fallback;
  }catch(e){
    console.error("load failed", key, e);
    return fallback;
  }
}
async function saveJSON(key, value){
  try{
    const { error } = await supabaseClient
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if(error) throw error;
  }catch(e){
    console.error("save failed", key, e);
  }
}
async function listKeys(prefix){
  try{
    const { data, error } = await supabaseClient
      .from("kv_store")
      .select("key")
      .like("key", prefix + "%");
    if(error) throw error;
    return (data || []).map(r => r.key);
  }catch(e){
    console.error("list failed", prefix, e);
    return [];
  }
}

// ---------- app state ----------
let defaultTemplate = null;   // { Monday:[rows], ... }
let currentMonday = null;     // Date object, Monday of the viewed week
let currentWeekData = null;   // { Monday:[rows], ... }

function emptyTemplate(){
  const t = {};
  DAYS.forEach(d => t[d] = []);
  return t;
}

async function init(){
  if(!supabaseClient){
    document.querySelector(".sub").textContent =
      "Couldn't load the Supabase library (check your internet connection or the browser console for errors).";
    return;
  }
  if(!SUPABASE_URL || SUPABASE_URL.includes("YOUR_SUPABASE")){
    document.querySelector(".sub").textContent =
      "Setup needed: add your Supabase URL and anon key to config.js (see README).";
    return;
  }
  document.querySelector(".sub").textContent = "Your lessons, rates, and what's still owed to you.";

  defaultTemplate = await loadJSON("default-template", emptyTemplate());

  const savedMonday = await loadJSON("current-week-monday", null);
  currentMonday = savedMonday ? new Date(savedMonday) : mondayOf(new Date());

  await loadCurrentWeek();

  renderDefault();
  await renderWeek();
  await renderTotals();

  document.getElementById("prev-week").addEventListener("click", () => navigateWeek(-1));
  document.getElementById("next-week").addEventListener("click", () => navigateWeek(1));

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab){
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.getElementById("default-block").style.display = tab === "default" ? "" : "none";
  document.getElementById("week-block").style.display = tab === "week" ? "" : "none";
}

async function loadCurrentWeek(){
  const key = weekKey(currentMonday);
  let data = await loadJSON(key, null);
  if(!data){
    // first visit to this week: clone default template with fresh ids and paid=false
    data = {};
    DAYS.forEach(d => {
      data[d] = (defaultTemplate[d] || []).map(r => ({...r, id: uid(), paid:false}));
    });
    await saveJSON(key, data);
  }
  currentWeekData = data;
}

async function navigateWeek(delta){
  currentMonday = addDays(currentMonday, delta*7);
  await saveJSON("current-week-monday", isoDate(currentMonday));
  await loadCurrentWeek();
  await renderWeek();
  await renderTotals();
}

// ---------- rendering: default week ----------
function renderDefault(){
  const container = document.getElementById("default-days");
  container.innerHTML = "";
  DAYS.forEach(day => {
    container.appendChild(buildDayBlock({
      day,
      dateLabel: null,
      rows: defaultTemplate[day] || [],
      showPaid: false,
      onAdd: () => {
        defaultTemplate[day] = defaultTemplate[day] || [];
        defaultTemplate[day].push(emptyRow());
        saveJSON("default-template", defaultTemplate);
        renderDefault();
      },
      onChange: (rowId, field, value) => {
        const row = (defaultTemplate[day]||[]).find(r=>r.id===rowId);
        if(!row) return;
        row[field] = value;
        saveJSON("default-template", defaultTemplate);
      },
      onDelete: (rowId) => {
        defaultTemplate[day] = (defaultTemplate[day]||[]).filter(r=>r.id!==rowId);
        saveJSON("default-template", defaultTemplate);
        renderDefault();
      }
    }));
  });
}

// ---------- rendering: active week ----------
async function renderWeek(){
  const container = document.getElementById("week-days");
  container.innerHTML = "";
  const sunday = addDays(currentMonday, 6);
  document.getElementById("week-range").textContent =
    displayDate(currentMonday) + " \u2013 " + displayDate(sunday) + ", " + currentMonday.getFullYear();

  DAYS.forEach((day, idx) => {
    const date = addDays(currentMonday, idx);
    container.appendChild(buildDayBlock({
      day,
      dateLabel: displayDate(date),
      rows: currentWeekData[day] || [],
      showPaid: true,
      onAdd: async () => {
        currentWeekData[day] = currentWeekData[day] || [];
        currentWeekData[day].push(emptyRow());
        await saveJSON(weekKey(currentMonday), currentWeekData);
        await renderWeek();
        await renderTotals();
      },
      onChange: async (rowId, field, value) => {
        const row = (currentWeekData[day]||[]).find(r=>r.id===rowId);
        if(!row) return;
        row[field] = value;
        await saveJSON(weekKey(currentMonday), currentWeekData);
        await renderTotals();
      },
      onDelete: async (rowId) => {
        currentWeekData[day] = (currentWeekData[day]||[]).filter(r=>r.id!==rowId);
        await saveJSON(weekKey(currentMonday), currentWeekData);
        await renderWeek();
        await renderTotals();
      }
    }));
  });
}

// ---------- shared day block builder ----------
function buildDayBlock({day, dateLabel, rows, onAdd, onChange, onDelete, showPaid}){
  const wrap = document.createElement("div");
  wrap.className = "day";

  const head = document.createElement("div");
  head.className = "day-head";
  head.innerHTML = `<div><span class="name">${day}</span>${dateLabel ? `<span class="date">${dateLabel}</span>` : ""}</div>`;
  const addBtn = document.createElement("button");
  addBtn.className = "add-btn";
  addBtn.type = "button";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", onAdd);
  head.appendChild(addBtn);
  wrap.appendChild(head);

  if(!rows || rows.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty-day";
    empty.textContent = "No lessons.";
    wrap.appendChild(empty);
    return wrap;
  }

  const table = document.createElement("table");
  table.className = "rows";
  table.innerHTML = `
    <thead><tr>
      <th class="col-name">Student</th>
      <th class="col-time">Start</th>
      <th class="col-time">Finish</th>
      <th class="col-addr">Address</th>
      <th class="col-rate">Rate/hr</th>
      <th class="col-notes">Notes</th>
      <th class="col-total">Total</th>
      ${showPaid ? '<th class="col-paid">Paid</th>' : ''}
      <th class="col-del"></th>
    </tr></thead>
  `;
  const tbody = document.createElement("tbody");

  rows.forEach(row => {
    const tr = document.createElement("tr");
    if(showPaid && row.paid) tr.classList.add("paid");

    tr.innerHTML = `
      <td class="col-name"><input type="text" value="${escapeAttr(row.studentName)}" placeholder="Name"></td>
      <td class="col-time"><input type="time" value="${row.start||""}"></td>
      <td class="col-time"><input type="time" value="${row.finish||""}"></td>
      <td class="col-addr"><input type="text" value="${escapeAttr(row.address)}" placeholder="Address"></td>
      <td class="col-rate"><input type="number" step="0.01" min="0" value="${row.payRate||""}" placeholder="0.00"></td>
      <td class="col-notes"><input type="text" value="${escapeAttr(row.notes)}" placeholder="Notes"></td>
      <td class="col-total">${fmt(computeTotal(row))}</td>
      ${showPaid ? `<td class="col-paid"><input type="checkbox" ${row.paid?"checked":""}></td>` : ''}
      <td class="col-del"><button type="button" class="del-btn" title="Delete row">&times;</button></td>
    `;

    const [nameInp, startInp, finishInp, addrInp, rateInp, notesInp] = tr.querySelectorAll("input[type=text], input[type=time], input[type=number]");
    const totalCell = tr.querySelector(".col-total");
    const paidInp = showPaid ? tr.querySelector('input[type=checkbox]') : null;
    const delBtn = tr.querySelector(".del-btn");

    function refreshTotal(){
      totalCell.textContent = fmt(computeTotal(row));
    }

    nameInp.addEventListener("input", e => { row.studentName = e.target.value; onChange(row.id,"studentName", row.studentName); });
    startInp.addEventListener("input", e => { row.start = e.target.value; onChange(row.id,"start", row.start); refreshTotal(); });
    finishInp.addEventListener("input", e => { row.finish = e.target.value; onChange(row.id,"finish", row.finish); refreshTotal(); });
    addrInp.addEventListener("input", e => { row.address = e.target.value; onChange(row.id,"address", row.address); });
    rateInp.addEventListener("input", e => { row.payRate = e.target.value; onChange(row.id,"payRate", row.payRate); refreshTotal(); });
    notesInp.addEventListener("input", e => { row.notes = e.target.value; onChange(row.id,"notes", row.notes); });
    if(paidInp){
      paidInp.addEventListener("change", e => {
        row.paid = e.target.checked;
        tr.classList.toggle("paid", row.paid);
        onChange(row.id,"paid", row.paid);
      });
    }
    delBtn.addEventListener("click", () => onDelete(row.id));

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function escapeAttr(str){
  if(str === undefined || str === null) return "";
  return String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

// ---------- totals ----------
async function renderTotals(){
  // week totals from currently loaded week
  let weekPaid = 0, weekUnpaid = 0;
  DAYS.forEach(day => {
    (currentWeekData[day]||[]).forEach(row => {
      const t = computeTotal(row);
      if(row.paid) weekPaid += t; else weekUnpaid += t;
    });
  });
  document.getElementById("week-paid").textContent = fmt(weekPaid);
  document.getElementById("week-unpaid").textContent = fmt(weekUnpaid);

  // month totals: month is taken from the Thursday of the displayed week
  // (the ISO convention for "which month a week belongs to")
  const refDate = addDays(currentMonday, 3);
  const refMonth = refDate.getMonth();
  const refYear = refDate.getFullYear();
  const monthName = refDate.toLocaleDateString(undefined, { month:"long", year:"numeric" });
  document.getElementById("month-title").textContent = monthName;
  document.getElementById("earnings-hint").textContent =
    "Month totals use the month containing most of the displayed week";

  let monthPaid = 0, monthUnpaid = 0;
  try{
    const keys = await listKeys("week:");
    for(const key of keys){
      const data = await loadJSON(key, null);
      if(!data) continue;
      // derive that week's Monday from the key
      const mondayStr = key.replace("week:", "");
      const monday = new Date(mondayStr + "T00:00:00");
      DAYS.forEach((day, idx) => {
        const date = addDays(monday, idx);
        if(date.getMonth() === refMonth && date.getFullYear() === refYear){
          (data[day]||[]).forEach(row => {
            const t = computeTotal(row);
            if(row.paid) monthPaid += t; else monthUnpaid += t;
          });
        }
      });
    }
  }catch(e){
    console.error("month totals failed", e);
  }
  document.getElementById("month-paid").textContent = fmt(monthPaid);
  document.getElementById("month-unpaid").textContent = fmt(monthUnpaid);
}

init();