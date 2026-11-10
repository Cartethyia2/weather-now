// 晴雨表 · 天气查询
// 数据源：Open-Meteo（无需 API Key）

const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

// WMO 天气代码 → 描述 + emoji
const WEATHER_MAP = {
  0: ["晴", "☀️"], 1: ["大致晴朗", "🌤️"], 2: ["局部多云", "⛅"], 3: ["阴", "☁️"],
  45: ["雾", "🌫️"], 48: ["冻雾", "🌫️"],
  51: ["小毛毛雨", "🌦️"], 53: ["毛毛雨", "🌦️"], 55: ["大毛毛雨", "🌦️"],
  56: ["冻毛毛雨", "🌧️"], 57: ["强冻毛毛雨", "🌧️"],
  61: ["小雨", "🌧️"], 63: ["中雨", "🌧️"], 65: ["大雨", "🌧️"],
  66: ["冻雨", "🌧️"], 67: ["强冻雨", "🌧️"],
  71: ["小雪", "🌨️"], 73: ["中雪", "❄️"], 75: ["大雪", "❄️"], 77: ["雪粒", "❄️"],
  80: ["小阵雨", "🌦️"], 81: ["阵雨", "🌧️"], 82: ["强阵雨", "⛈️"],
  85: ["小阵雪", "🌨️"], 86: ["大阵雪", "🌨️"],
  95: ["雷暴", "⛈️"], 96: ["雷暴伴冰雹", "⛈️"], 99: ["强雷暴伴冰雹", "⛈️"],
};

const $ = (id) => document.getElementById(id);

const cityInput = $("city-input");
const searchBtn = $("search-btn");
const suggestionsEl = $("suggestions");
const statusEl = $("status");

function weatherInfo(code) {
  return WEATHER_MAP[code] ?? ["未知", "❓"];
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setTheme(code, isDay) {
  document.body.className = "";
  if (!isDay) return document.body.classList.add("theme-night");
  if ([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99, 51, 53, 55].includes(code))
    return document.body.classList.add("theme-rain");
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return document.body.classList.add("theme-snow");
  if ([2].includes(code))
    return document.body.classList.add("theme-cloudy");
  if ([3, 45, 48].includes(code))
    return document.body.classList.add("theme-overcast");
  document.body.classList.add("theme-sunny");
}

// 1. 城市名 → 经纬度候选
async function searchCity(name) {
  const url = `${GEO_API}?name=${encodeURIComponent(name)}&count=6&language=zh&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("城市搜索请求失败");
  return (await res.json()).results ?? [];
}

// 1b. 中文长名逐级截短回退："深圳南山" → "深圳南" → "深圳"
async function searchCityWithFallback(name) {
  let places = await searchCity(name);
  if (places.length || !hasCJK(name)) return { places, matched: name };
  for (let len = name.length - 1; len >= 2; len--) {
    places = await searchCity(name.slice(0, len));
    if (places.length) return { places, matched: name.slice(0, len) };
  }
  return { places: [], matched: name };
}

// 1c. 中文 → 英文翻译回退（MyMemory 免费接口，无需 key）
async function translateToEn(name) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(name)}&langpair=zh-CN|en`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const t = (await res.json())?.responseData?.translatedText ?? "";
    // 翻译失败时接口会原样吐回中文，这种不算数
    return t && !hasCJK(t) ? t : null;
  } catch {
    return null;  // 翻译接口挂了不连累主流程
  }
}

// 2. 经纬度 → 天气数据
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
    hourly: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: 7,
  });
  const res = await fetch(`${WEATHER_API}?${params}`);
  if (!res.ok) throw new Error("天气数据请求失败");
  return res.json();
}

// 是否包含中日韩文字（用于判断要不要提示"试试英文名"）
const hasCJK = (s) => /[一-鿿぀-ヿ가-힯]/.test(s);

function renderSuggestions(places, query) {
  suggestionsEl.innerHTML = "";
  if (!places.length) {
    suggestionsEl.classList.add("hidden");
    // 地名库对部分国外小城镇只收录了英文名，给用户一个能行动的提示
    setStatus(
      hasCJK(query)
        ? `没有找到「${query}」：一些国外小地方在地名库里只有英文名，试试英文名或拼音（如 Rankin Inlet）`
        : `没有找到「${query}」，检查一下拼写，或换成中文名试试？`
    );
    return;
  }
  for (const p of places) {
    const li = document.createElement("li");
    const region = [p.admin1, p.country].filter(Boolean).join(" · ");
    li.innerHTML = `${p.name}<span class="region">${region}</span>`;
    li.addEventListener("click", () => {
      suggestionsEl.classList.add("hidden");
      loadWeather(p);
    });
    suggestionsEl.appendChild(li);
  }
  suggestionsEl.classList.remove("hidden");
}

function render(data, place) {
  const { current, hourly, daily } = data;
  const [desc, emoji] = weatherInfo(current.weather_code);

  // 当前天气
  $("city-name").textContent = place.name;
  $("local-time").textContent =
    new Date(current.time).toLocaleString("zh-CN", {
      month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    }) + " 更新";
  $("current-emoji").textContent = emoji;
  $("current-temp").textContent = `${Math.round(current.temperature_2m)}°`;
  $("current-desc").textContent = desc;
  $("feels-like").textContent = `${Math.round(current.apparent_temperature)}°`;
  $("humidity").textContent = `${current.relative_humidity_2m}%`;
  $("wind").textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  $("day-range").textContent =
    `${Math.round(daily.temperature_2m_min[0])}° ~ ${Math.round(daily.temperature_2m_max[0])}°`;

  // 未来 24 小时（从当前小时起）
  const nowIndex = hourly.time.findIndex((t) => new Date(t) >= new Date(current.time));
  const start = nowIndex === -1 ? 0 : nowIndex;
  const hourlyList = $("hourly-list");
  hourlyList.innerHTML = "";
  for (let i = start; i < Math.min(start + 24, hourly.time.length); i++) {
    const [, e] = weatherInfo(hourly.weather_code[i]);
    const div = document.createElement("div");
    div.className = "hourly-item";
    div.innerHTML = `
      <span class="time">${i === start ? "现在" : new Date(hourly.time[i]).getHours() + "时"}</span>
      <span class="h-emoji">${e}</span>
      <span class="h-temp">${Math.round(hourly.temperature_2m[i])}°</span>`;
    hourlyList.appendChild(div);
  }

  // 未来 7 天
  const weekMin = Math.min(...daily.temperature_2m_min);
  const weekMax = Math.max(...daily.temperature_2m_max);
  const dailyList = $("daily-list");
  dailyList.innerHTML = "";
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  daily.time.forEach((t, i) => {
    const [dDesc, dEmoji] = weatherInfo(daily.weather_code[i]);
    const min = daily.temperature_2m_min[i];
    const max = daily.temperature_2m_max[i];
    const prob = daily.precipitation_probability_max[i];
    const left = ((min - weekMin) / (weekMax - weekMin || 1)) * 100;
    const width = ((max - min) / (weekMax - weekMin || 1)) * 100;
    const li = document.createElement("li");
    li.title = dDesc;
    li.innerHTML = `
      <span>${i === 0 ? "今天" : weekdays[new Date(t).getDay()]}</span>
      <span class="d-emoji">${dEmoji}</span>
      <span class="d-pop">💧${prob}%</span>
      <div class="d-bar">
        <span class="min">${Math.round(min)}°</span>
        <div class="track"><div class="fill" style="margin-left:${left}%;width:${Math.max(width, 6)}%"></div></div>
        <span>${Math.round(max)}°</span>
      </div>`;
    dailyList.appendChild(li);
  });

  setTheme(current.weather_code, current.is_day === 1);
  ["current-card", "hourly-card", "daily-card"].forEach((id) =>
    $(id).classList.remove("hidden")
  );
}

async function loadWeather(place) {
  try {
    setStatus("正在获取天气数据…");
    const data = await fetchWeather(place.latitude, place.longitude);
    render(data, place);
    localStorage.setItem("lastCity", JSON.stringify(place));
    setStatus("");
  } catch (err) {
    setStatus(`出错了：${err.message}，请检查网络后重试`);
  }
}

async function handleSearch() {
  const name = cityInput.value.trim();
  if (!name) return setStatus("先输入一个城市名吧");
  try {
    cityInput.disabled = true;
    searchBtn.disabled = true;
    searchBtn.textContent = "查询中...";
    // 降级链：直接搜 → 中文截短搜 → 翻译成英文搜 → 全灭才认输
    setStatus("正在搜索城市…");
    let { places, matched } = await searchCityWithFallback(name);
    if (!places.length && hasCJK(name)) {
      setStatus("中文没找到，正在试试翻译成英文…");
      const en = await translateToEn(name);
      if (en) {
        places = await searchCity(en);
        if (places.length) matched = en;
      }
    }
    setStatus(
      matched !== name ? `未找到「${name}」，已为你匹配最接近的「${matched}」` : ""
    );
    renderSuggestions(places, name);
  } catch (err) {
    setStatus(`出错了：${err.message}，请检查网络后重试`);
  }
  finally{
    searchBtn.disabled = false;
    searchBtn.textContent = "查询";
    cityInput.disabled = false;
  }
}

searchBtn.addEventListener("click", handleSearch);
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});

// 页面加载时默认查一次北京，让首页不空着
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const savedCity = JSON.parse(localStorage.getItem("lastCity"));
    if(savedCity) {
      loadWeather(savedCity);
    }
    else {const places = await searchCity("北京");
    if (places.length) loadWeather(places[0])};
  } catch { /* 首次加载失败静默处理，用户手动搜索即可 */ }
});
