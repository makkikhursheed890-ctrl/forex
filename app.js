(()=>{
/*
  MarketPulse economic calendar
  Configure API_URL below with a public, CORS-enabled endpoint that returns
  { events: [{ id, datetime, currency, impact, title, category, actual,
  forecast, previous, description, betterWhen }] }. Use ISO 8601 datetime
  values with an explicit timezone. Never put a private API key here.
*/
const API_URL = window.MARKETPULSE_CONFIG?.apiUrl || "";
const AUTO_REFRESH_MS = 0; // Set to a provider-safe interval in milliseconds, or leave disabled.
const CURRENCIES = ["USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","CNY"];
const CATEGORIES = ["Inflation","Interest Rates","Employment","GDP","PMI","Retail Sales","Central Bank Speeches"];
const TIMEZONES = {
  "Asia/Karachi":"Pakistan (PKT)", UTC:"UTC", "America/New_York":"New York",
  "Europe/London":"London", "Asia/Tokyo":"Tokyo", "Australia/Sydney":"Sydney"
};
const FLAGS = {USD:"🇺🇸",EUR:"🇪🇺",GBP:"🇬🇧",JPY:"🇯🇵",AUD:"🇦🇺",CAD:"🇨🇦",CHF:"🇨🇭",NZD:"🇳🇿",CNY:"🇨🇳"};
const STORAGE_KEYS = {favorites:"marketpulse.favoriteCurrencies",timezone:"marketpulse.timezone"};
const $ = selector => document.querySelector(selector);

const state = {
  events: [], range:"today", currency:"all", impact:"all", category:"all", query:"",
  highOnly:false, favoritesOnly:false, timezone:readTimezone(), loading:false, error:"", lastUpdated:null
};

function safeStorageGet(key,fallback){try{const value=localStorage.getItem(key);return value===null?fallback:JSON.parse(value)}catch{return fallback}}
function safeStorageSet(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function readTimezone(){const saved=safeStorageGet(STORAGE_KEYS.timezone,"Asia/Karachi");return TIMEZONES[saved]?saved:"Asia/Karachi"}
function readFavorites(){const saved=safeStorageGet(STORAGE_KEYS.favorites,[]);return Array.isArray(saved)?saved.filter(currency=>CURRENCIES.includes(currency)):[]}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}
function slug(value){return String(value||"event").replace(/[^a-z0-9_-]/gi,"-").slice(0,80)}

function makeDemoEvents(){
  const now=new Date();
  const at=(day,hour,minute=0)=>{const date=new Date(now);date.setDate(date.getDate()+day);date.setHours(hour,minute,0,0);return date.toISOString()};
  const definitions=[
    [-0,now.getHours()-1,15,"USD","medium","Initial Jobless Claims","Employment","218K","220K","221K","Weekly claims data can indicate changes in labor market conditions.","lower"],
    [0,now.getHours(),45,"EUR","high","Eurozone CPI (YoY)","Inflation","2.6%","2.5%","2.7%","Consumer price inflation across the euro area.","lower"],
    [0,now.getHours()+1,0,"GBP","high","Bank of England Rate Decision","Interest Rates","—","4.50%","4.50%","The Bank of England announces its policy rate decision.","higher"],
    [0,now.getHours()+2,30,"USD","high","Core PCE Price Index (MoM)","Inflation","—","0.3%","0.2%","The Federal Reserve's preferred measure of underlying inflation.","lower"],
    [0,now.getHours()+3,0,"CAD","medium","Retail Sales (MoM)","Retail Sales","—","0.4%","0.2%","Monthly change in Canadian retail spending.","higher"],
    [0,now.getHours()+4,0,"JPY","low","Leading Economic Index","GDP","—","108.2","107.9","A composite indicator of expected economic activity.","higher"],
    [0,now.getHours()+5,15,"USD","high","Federal Reserve Press Conference","Central Bank Speeches","—","—","—","Remarks and questions following the Federal Reserve policy decision.","higher"],
    [0,now.getHours()+7,0,"CHF","low","Trade Balance","GDP","—","4.2B","4.0B","Monthly difference between Swiss exports and imports.","higher"],
    [1,8,0,"AUD","high","Employment Change","Employment","—","25.0K","17.9K","Monthly change in the number of employed people.","higher"],
    [1,9,30,"CNY","medium","Manufacturing PMI","PMI","—","50.4","50.2","Survey of purchasing managers in the manufacturing sector.","higher"],
    [1,13,0,"EUR","medium","German ZEW Economic Sentiment","GDP","—","18.0","15.2","Survey of institutional investor expectations for the German economy.","higher"],
    [2,8,30,"GBP","high","CPI (YoY)","Inflation","—","2.8%","2.9%","Annual change in consumer prices in the United Kingdom.","lower"],
    [2,14,0,"USD","medium","S&P Global Services PMI","PMI","—","52.1","51.8","Business activity survey across the US services sector.","higher"],
    [3,9,0,"NZD","low","Business Confidence","GDP","—","—","—","Survey of business outlook in New Zealand.","higher"],
    [4,12,0,"EUR","high","ECB President Lagarde Speaks","Central Bank Speeches","—","—","—","Scheduled remarks by the European Central Bank president.","higher"],
    [5,13,30,"CAD","medium","GDP (MoM)","GDP","—","0.2%","0.1%","Monthly change in Canadian gross domestic product.","higher"]
  ];
  return definitions.map((row,index)=>{
    const [day,hour,minute,currency,impact,title,category,actual,forecast,previous,description,betterWhen]=row;
    const dayOffset=Number(day), hourValue=Number(hour);
    let datetime;
    if(dayOffset===0&&index===0){datetime=at(0,Math.max(0,hourValue),minute)}
    else datetime=at(dayOffset,Math.min(23,Math.max(0,hourValue)),minute);
    return {id:`demo-${index+1}`,datetime,currency,impact,title,category,actual,forecast,previous,description,betterWhen};
  });
}

function normalizeEvents(payload){
  const rows=Array.isArray(payload)?payload:(payload?.events||payload?.data?.events||payload?.data);
  if(!Array.isArray(rows))throw new Error("The API response must contain an events array.");
  return rows.map((raw,index)=>{
    const dateTime=raw.datetime||raw.dateTime||raw.timestamp||(raw.date?`${raw.date}T${raw.time||"00:00"}:00Z`:"");
    const parsed=new Date(dateTime);
    if(!Number.isFinite(parsed.getTime()))return null;
    const currency=String(raw.currency||raw.countryCurrency||"—").toUpperCase();
    const rawImpact=String(raw.impact||raw.importance||"low").toLowerCase();
    const impact=rawImpact.includes("high")||rawImpact==="3"?"high":rawImpact.includes("medium")||rawImpact==="2"?"medium":"low";
    const title=String(raw.title||raw.event||raw.name||"Economic event");
    const rawCategory=String(raw.category||inferCategory(title));
    const category=CATEGORIES.find(item=>item.toLowerCase()===rawCategory.toLowerCase())||rawCategory;
    return {
      id:slug(raw.id||`${parsed.getTime()}-${currency}-${index}`),datetime:parsed.toISOString(),currency,
      impact,title,category,
      actual:raw.actual??"—",forecast:raw.forecast??"—",previous:raw.previous??"—",
      description:String(raw.description||raw.details||"No additional event details provided."),
      betterWhen:String(raw.betterWhen||raw.better_when||"").toLowerCase()
    };
  }).filter(event=>event&&event.title).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
}
function inferCategory(title){
  const text=title.toLowerCase();
  if(/cpi|inflation|pce|price index/.test(text))return "Inflation";
  if(/rate decision|interest rate|policy rate/.test(text))return "Interest Rates";
  if(/employment|payroll|jobless|unemployment|wage/.test(text))return "Employment";
  if(/pmi|purchasing managers/.test(text))return "PMI";
  if(/retail sales/.test(text))return "Retail Sales";
  if(/speech|speaks|press conference|testifies/.test(text))return "Central Bank Speeches";
  if(/gdp|gross domestic|trade balance|economic sentiment/.test(text))return "GDP";
  return "Other";
}

function dateKey(date,timezone=state.timezone){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function addDays(dateString,days){const date=new Date(`${dateString}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function todayKey(){return dateKey(new Date())}
function formatTime(date){return new Intl.DateTimeFormat("en-GB",{timeZone:state.timezone,hour:"2-digit",minute:"2-digit",hour12:false}).format(date)}
function formatDate(date,options={day:"2-digit",month:"short"}){return new Intl.DateTimeFormat("en-GB",{timeZone:state.timezone,...options}).format(date)}
function formatDateLong(date){return new Intl.DateTimeFormat("en-US",{timeZone:state.timezone,weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(date)}
function isToday(event){return dateKey(new Date(event.datetime))===todayKey()}
function getFilteredEvents(){
  const now=new Date(), today=todayKey(), favorites=readFavorites();
  let start=today,end=today;
  if(state.range==="tomorrow")start=end=addDays(today,1);
  if(state.range==="week"){
    const day=new Date(`${today}T12:00:00Z`).getUTCDay();
    const offset=day===0?-6:1-day;
    start=addDays(today,offset);end=addDays(start,6);
  }
  if(state.range==="custom"){
    start=$("#dateFrom").value||today;end=$("#dateTo").value||start;
    if(end<start)[start,end]=[end,start];
  }
  const query=state.query.trim().toLowerCase();
  return state.events.filter(event=>{
    const eventDate=dateKey(new Date(event.datetime));
    const dateMatch=eventDate>=start&&eventDate<=end;
    const textMatch=!query||`${event.title} ${event.currency} ${event.category}`.toLowerCase().includes(query);
    return dateMatch&&textMatch&&(state.currency==="all"||event.currency===state.currency)&&
      (state.impact==="all"||event.impact===state.impact)&&(state.category==="all"||event.category===state.category)&&
      (!state.highOnly||event.impact==="high")&&(!state.favoritesOnly||favorites.includes(event.currency));
  }).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
}
function resultClass(event){
  if(event.actual==="—"||event.forecast==="—"||!["lower","higher"].includes(event.betterWhen))return "actual-neutral";
  const actual=parseFloat(String(event.actual).replace(/,/g,"")),forecast=parseFloat(String(event.forecast).replace(/,/g,""));
  if(!Number.isFinite(actual)||!Number.isFinite(forecast))return "actual-neutral";
  const positive=event.betterWhen==="lower"?actual<forecast:actual>forecast;
  return actual===forecast?"actual-neutral":positive?"actual-good":"actual-bad";
}
function countdownText(milliseconds){
  const total=Math.max(0,Math.floor(milliseconds/1000)),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
  return days?`${days}d ${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m`:`${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(seconds).padStart(2,"0")}s`;
}
function eventIsPast(event){return new Date(event.datetime).getTime()<Date.now()}
function renderSummaries(){
  const now=Date.now(),todayEvents=state.events.filter(isToday);
  const nextHigh=state.events.filter(event=>event.impact==="high"&&new Date(event.datetime).getTime()>=now).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime))[0];
  $("#totalToday").textContent=todayEvents.length;
  $("#highToday").textContent=todayEvents.filter(event=>event.impact==="high").length;
  $("#next24Count").textContent=state.events.filter(event=>{const time=new Date(event.datetime).getTime();return time>=now&&time<=now+86400000}).length;
  $("#nextHighName").textContent=nextHigh?`${nextHigh.currency} · ${nextHigh.title}`:"No upcoming high-impact events";
  $("#nextHighCountdown").textContent=nextHigh?`In ${countdownText(new Date(nextHigh.datetime).getTime()-now)}`:"Check back for updates";
}
function renderUpcoming(){
  const now=Date.now();
  const upcoming=state.events.filter(event=>event.impact==="high"&&new Date(event.datetime).getTime()>=now).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime)).slice(0,6);
  $("#upcomingCount").textContent=upcoming.length;
  $("#upcomingEvents").innerHTML=upcoming.length?upcoming.map(event=>{
    const date=new Date(event.datetime);
    return `<article class="upcoming-item"><div class="upcoming-event-top"><span class="upcoming-event-name">${escapeHtml(event.title)}</span><span class="upcoming-currency">${escapeHtml(event.currency)}</span></div><div class="upcoming-event-meta"><span class="upcoming-time">${escapeHtml(formatDate(date,{weekday:"short",day:"2-digit",month:"short"}))} · ${escapeHtml(formatTime(date))}</span><span class="countdown" data-countdown="${escapeHtml(event.id)}">${countdownText(date.getTime()-now)}</span></div></article>`;
  }).join(""):'<div class="upcoming-empty">There are no upcoming high-impact events in the loaded calendar.</div>';
}
function renderTableEvent(event){
  const date=new Date(event.datetime),past=eventIsPast(event),fav=readFavorites().includes(event.currency),key=escapeHtml(event.id);
  const favoriteButton=CURRENCIES.includes(event.currency)?`<button type="button" class="favorite-button ${fav?"saved":""}" data-favorite="${escapeHtml(event.currency)}" aria-label="${fav?"Remove":"Add"} ${escapeHtml(event.currency)} ${fav?"from":"to"} favorites" title="Toggle ${escapeHtml(event.currency)} favorite">${fav?"★":"☆"}</button>`:"";
  return `<tr class="event-row ${event.impact==="high"?"high-row":""} ${past?"past-event":""}" data-row-id="${key}"><td class="date-cell">${escapeHtml(formatDate(date))}</td><td class="time-cell">${escapeHtml(formatTime(date))}</td><td class="currency-cell"><span class="currency-flag" aria-hidden="true">${FLAGS[event.currency]||"◉"}</span>${escapeHtml(event.currency)}</td><td><span class="impact-badge impact-${event.impact}">${event.impact[0].toUpperCase()+event.impact.slice(1)}</span></td><td><span class="event-name">${favoriteButton}<span class="event-name-text">${escapeHtml(event.title)}</span></span></td><td class="event-actual ${resultClass(event)}">${escapeHtml(event.actual)}</td><td class="event-forecast">${escapeHtml(event.forecast)}</td><td class="event-previous">${escapeHtml(event.previous)}</td><td><button class="details-button" type="button" data-details="${key}" aria-expanded="false" aria-label="Show details for ${escapeHtml(event.title)}"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button></td></tr><tr class="details-row" data-detail-row="${key}" hidden><td colspan="9"><div class="details-content"><strong>${escapeHtml(event.title)} · ${escapeHtml(event.category)}</strong>${escapeHtml(event.description)}<br>Previous: ${escapeHtml(event.previous)} · Forecast: ${escapeHtml(event.forecast)} · Actual: ${escapeHtml(event.actual)}</div></td></tr>`;
}
function renderMobileEvent(event){
  const date=new Date(event.datetime),fav=readFavorites().includes(event.currency),id=escapeHtml(event.id);
  const favoriteButton=CURRENCIES.includes(event.currency)?`<button type="button" class="star-button ${fav?"saved":""}" data-favorite="${escapeHtml(event.currency)}" aria-label="Toggle ${escapeHtml(event.currency)} favorite">${fav?"★":"☆"}</button>`:"";
  return `<article class="mobile-event ${event.impact==="high"?"high-row":""} ${eventIsPast(event)?"past-event":""}"><div class="mobile-event-top"><span class="mobile-event-date">${escapeHtml(formatDate(date,{weekday:"short",day:"2-digit",month:"short"}))} · ${escapeHtml(formatTime(date))}</span><span class="impact-badge impact-${event.impact}">${event.impact[0].toUpperCase()+event.impact.slice(1)}</span></div><div class="mobile-event-title">${escapeHtml(event.title)}</div><div class="mobile-event-sub"><span class="currency-cell"><span class="currency-flag" aria-hidden="true">${FLAGS[event.currency]||"◉"}</span>${escapeHtml(event.currency)}</span>${favoriteButton}</div><div class="mobile-event-values"><div class="mobile-event-value"><span>Actual</span><strong class="${resultClass(event)}">${escapeHtml(event.actual)}</strong></div><div class="mobile-event-value"><span>Forecast</span><strong>${escapeHtml(event.forecast)}</strong></div><div class="mobile-event-value"><span>Previous</span><strong>${escapeHtml(event.previous)}</strong></div></div><details><summary>Event details</summary><p>${escapeHtml(event.description)}</p></details></article>`;
}
function render(){
  const events=getFilteredEvents(),hasEvents=events.length>0;
  $("#loadingState").hidden=!state.loading;
  $("#tableWrap").hidden=state.loading||!hasEvents;
  $("#mobileEvents").hidden=state.loading||!hasEvents;
  $("#emptyState").hidden=state.loading||hasEvents;
  $("#eventRows").innerHTML=events.map(renderTableEvent).join("");
  $("#mobileEvents").innerHTML=events.map(renderMobileEvent).join("");
  $("#visibleCount").textContent=`${events.length} ${events.length===1?"event":"events"} shown`;
  $("#eventCountFooter").textContent=`${events.length} ${events.length===1?"event":"events"}`;
  $("#apiMessage").hidden=!state.error;
  $("#apiMessage").textContent=state.error;
  const demoNotice=$("#demoNotice");if(demoNotice)demoNotice.hidden=Boolean(API_URL);
  $("#tableWrap").classList.toggle("has-events",hasEvents);
  renderSummaries();renderUpcoming();
}

async function loadEvents(){
  state.error="";state.loading=true;render();$("#refreshButton").disabled=true;$("#refreshButton").classList.add("spinning");
  if(!API_URL){
    state.events=makeDemoEvents();state.loading=false;state.lastUpdated=new Date();
    finishLoad();return;
  }
  try{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    let response;
    try{response=await fetch(API_URL,{signal:controller.signal,headers:{Accept:"application/json"}})}finally{clearTimeout(timeout)}
    if(!response.ok)throw new Error(`Calendar API returned ${response.status}${response.status===429?" (rate limit)":""}.`);
    const payload=await response.json();
    const normalized=normalizeEvents(payload);
    state.events=normalized;state.lastUpdated=new Date();state.error="";
  }catch(error){
    const message=error.name==="AbortError"?"Calendar API request timed out. Check the endpoint and try again.":error.message||"Calendar API could not be reached. Check your network and endpoint.";
    state.error=`Live data unavailable: ${message} ${state.events.length?"Showing the last successful update.":"No demo data has been substituted."}`;
  }
  state.loading=false;finishLoad();
}
function finishLoad(){
  $("#refreshButton").disabled=false;$("#refreshButton").classList.remove("spinning");
  $("#lastUpdated").textContent=state.lastUpdated?`Updated ${new Intl.DateTimeFormat("en-GB",{timeZone:state.timezone,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(state.lastUpdated)}`:"Waiting for first update";
  render();
}

function updateClock(){
  const now=new Date();
  $("#currentDate").textContent=formatDateLong(now);
  $("#currentClock").textContent=new Intl.DateTimeFormat("en-GB",{timeZone:state.timezone,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(now);
  $("#timezoneLabel").textContent=TIMEZONES[state.timezone];
  if(state.lastUpdated)$("#lastUpdated").textContent=`Updated ${new Intl.DateTimeFormat("en-GB",{timeZone:state.timezone,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(state.lastUpdated)}`;
  renderSummaries();renderUpcoming();
}

function setRange(range){
  state.range=range;
  document.querySelectorAll(".date-chip").forEach(button=>button.classList.toggle("active",button.dataset.range===range));
  $("#customDates").hidden=range!=="custom";
  render();
}
function resetFilters(){
  state.range="today";state.currency="all";state.impact="all";state.category="all";state.query="";state.highOnly=false;state.favoritesOnly=false;
  $("#currencyFilter").value="all";$("#impactFilter").value="all";$("#categoryFilter").value="all";$("#eventSearch").value="";$("#highOnly").checked=false;$("#favoritesOnly").checked=false;
  $("#dateFrom").value=todayKey();$("#dateTo").value=todayKey();$("#eventSearchField").hidden=true;
  setRange("today");
}

document.querySelectorAll(".date-chip").forEach(button=>button.addEventListener("click",()=>setRange(button.dataset.range)));
$("#currencyFilter").addEventListener("change",event=>{state.currency=event.target.value;render()});
$("#impactFilter").addEventListener("change",event=>{state.impact=event.target.value;render()});
$("#categoryFilter").addEventListener("change",event=>{state.category=event.target.value;render()});
$("#highOnly").addEventListener("change",event=>{state.highOnly=event.target.checked;render()});
$("#favoritesOnly").addEventListener("change",event=>{state.favoritesOnly=event.target.checked;render()});
$("#eventSearch").addEventListener("input",event=>{state.query=event.target.value;render()});
$("#clearSearch").addEventListener("click",()=>{$("#eventSearch").value="";state.query="";render();$("#eventSearch").focus()});
$("#dateFrom").addEventListener("change",render);$("#dateTo").addEventListener("change",render);
$("#resetFilters").addEventListener("click",resetFilters);$("#emptyReset").addEventListener("click",resetFilters);
$("#refreshButton").addEventListener("click",loadEvents);
$("#searchToggle").addEventListener("click",()=>{
  const field=$("#eventSearchField");field.hidden=!field.hidden;
  if(!field.hidden)$("#eventSearch").focus();else{$("#eventSearch").value="";state.query="";render()}
});
$("#timezoneSelect").value=state.timezone;
$("#timezoneSelect").addEventListener("change",event=>{
  state.timezone=event.target.value;safeStorageSet(STORAGE_KEYS.timezone,state.timezone);updateClock();render();
});
document.addEventListener("click",event=>{
  const favorite=event.target.closest("[data-favorite]");
  if(favorite){
    const currency=favorite.dataset.favorite,favorites=readFavorites();
    safeStorageSet(STORAGE_KEYS.favorites,favorites.includes(currency)?favorites.filter(item=>item!==currency):[...favorites,currency]);
    render();return;
  }
  const details=event.target.closest("[data-details]");
  if(details){
    const id=details.dataset.details,row=document.querySelector(`[data-detail-row="${CSS.escape(id)}"]`),parent=details.closest(".event-row");
    if(row){const opening=row.hidden;row.hidden=!opening;details.setAttribute("aria-expanded",String(opening));parent.classList.toggle("expanded",opening)}
  }
});

updateClock();setInterval(updateClock,1000);loadEvents();
if(API_URL&&AUTO_REFRESH_MS>0)setInterval(loadEvents,AUTO_REFRESH_MS);
})();
