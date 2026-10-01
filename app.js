(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const definitions = {
    soilMoisture: { label: 'Soil moisture', unit: '%', icon: '♧', color: '#789651', tint: '#f0f4e8', min: 0, max: 100 },
    temperature: { label: 'Temperature', unit: '°C', icon: '♨', color: '#c49a63', tint: '#fbf4e9', min: 10, max: 45 },
    humidity: { label: 'Humidity', unit: '%', icon: '◈', color: '#7e9eaf', tint: '#edf4f8', min: 0, max: 100 },
    light: { label: 'Light level', unit: 'lux', icon: '☼', color: '#b9a367', tint: '#f8f5e9', min: 0, max: 1000 }
  };
  const hour = 60 * 60 * 1000;
  const start = Math.floor(Date.now() / hour) * hour;
  const seeds = {
    greenhouse: { label: 'Greenhouse A', description: 'Leafy greens · covered growing area', soilMoisture: 41, temperature: 28.4, humidity: 72, light: 620, co2: 520, tvoc: 85, ph: 6.4, rain: false },
    field: { label: 'Open field B', description: 'Seasonal vegetables · outdoor growing area', soilMoisture: 31, temperature: 30.2, humidity: 65, light: 810, co2: 430, tvoc: 61, ph: 6.7, rain: false },
    nursery: { label: 'Nursery C', description: 'Young seedlings · sheltered growing area', soilMoisture: 49, temperature: 26.1, humidity: 78, light: 480, co2: 560, tvoc: 72, ph: 6.2, rain: false }
  };
  const zones = Object.fromEntries(Object.entries(seeds).map(([key, seed]) => [key, {
    ...seed, threshold: 35, updated: Date.now(), watered: false,
    history: Array.from({ length: 24 }, (_, i) => {
      const wave = Math.sin(i * .5) * 2 + Math.cos(i * .95);
      return { time: start - (23 - i) * hour, soilMoisture: i === 23 ? seed.soilMoisture : Math.round(seed.soilMoisture + wave + (23 - i) * .18), temperature: i === 23 ? seed.temperature : +(seed.temperature + wave * .4).toFixed(1), humidity: i === 23 ? seed.humidity : Math.round(seed.humidity + wave * 2), light: i === 23 ? seed.light : Math.round(seed.light + wave * 28) };
    })
  }]));
  let zoneKey = 'greenhouse';
  let metric = 'soilMoisture';
  let range = 24;
  let hkoForecast = [];
  let weatherLoading = false;
  let weatherUpdated = null;
  let toastTimer;
  const current = () => zones[zoneKey];
  const timeLabel = timestamp => new Date(timestamp).toLocaleTimeString('en-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });
  const display = (key, value) => key === 'temperature' ? Number(value).toFixed(1) : String(value);
  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
  }
  function note(key, zone) {
    if (key === 'soilMoisture') return zone[key] < zone.threshold ? '↓ Below your target' : '↗ Above your target';
    if (key === 'temperature') return zone[key] > 32 ? 'Warm · check ventilation' : 'Within demo range';
    if (key === 'humidity') return zone[key] > 80 ? 'High · check airflow' : 'Within demo range';
    return 'Simulated light reading';
  }
  function sparkline(key, history, color) {
    const values = history.slice(-12).map(p => p[key]);
    const min = Math.min(...values) - 1;
    const max = Math.max(...values) + 1;
    const points = values.map((v, i) => `${i * 6},${22 - (v - min) / (max - min) * 20}`).join(' ');
    return `<svg class="sparkline" viewBox="0 0 66 25" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function renderCards() {
    const zone = current();
    // Markup here contains only fixed definitions and locally generated numeric values.
    $('metricCards').innerHTML = Object.entries(definitions).map(([key, d]) => `<button class="metric-card ${metric === key ? 'active' : ''}" data-sensor="${key}" aria-pressed="${metric === key}" style="--accent:${d.color};--accent-bg:${d.tint}"><span class="metric-top"><span>${d.label}</span><span class="metric-icon" aria-hidden="true">${d.icon}</span></span><div class="metric-number">${display(key, zone[key])}<small>${d.unit}</small></div><div class="metric-bottom"><span class="metric-note">${note(key, zone)}</span>${sparkline(key, zone.history, d.color)}</div></button>`).join('');
  }
  function drawChart() {
    const zone = current();
    const d = definitions[metric];
    const points = zone.history.slice(-range);
    const width = 640, height = 180;
    const left = 34, right = 16, top = 15, bottom = 28;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const values = points.map(p => p[metric]);
    if (metric === 'soilMoisture') values.push(zone.threshold);
    const padding = metric === 'light' ? 60 : metric === 'temperature' ? 2 : 6;
    const low = Math.max(d.min, Math.floor(Math.min(...values) - padding));
    const high = Math.min(d.max, Math.ceil(Math.max(...values) + padding));
    const x = i => left + i / (points.length - 1) * plotWidth;
    const y = value => top + (high - value) / (high - low) * plotHeight;
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[metric]).toFixed(1)}`).join(' ');
    const grid = Array.from({ length: 4 }, (_, i) => {
      const value = low + (high - low) * i / 3;
      return `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" stroke="var(--border)" stroke-dasharray="3 5"/><text x="${left - 8}" y="${y(value) + 3}" text-anchor="end">${Math.round(value)}</text>`;
    }).join('');
    const labels = [...new Set([0, Math.floor((points.length - 1) / 3), Math.floor((points.length - 1) * 2 / 3), points.length - 1])].map(i => `<text x="${x(i)}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${timeLabel(points[i].time)}</text>`).join('');
    const target = metric === 'soilMoisture' ? `<line x1="${left}" x2="${width - right}" y1="${y(zone.threshold)}" y2="${y(zone.threshold)}" stroke="#b4a67d" stroke-dasharray="5 5"/><text x="${width - right}" y="${y(zone.threshold) - 5}" text-anchor="end">Target ${zone.threshold}%</text>` : '';
    $('chartArea').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="group" aria-label="${d.label} mock history, last ${range} hours"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${d.color}" stop-opacity=".2"/><stop offset="100%" stop-color="${d.color}" stop-opacity=".01"/></linearGradient></defs>${grid}<path d="${path} L${x(points.length - 1)},${height - bottom} L${left},${height - bottom} Z" fill="url(#chartFill)"/>${target}<path d="${path}" fill="none" stroke="${d.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${labels}${points.map((p, i) => `<circle class="chart-point" data-point="${i}" tabindex="0" role="button" aria-label="${timeLabel(p.time)} HKT: ${display(metric, p[metric])} ${d.unit}" cx="${x(i)}" cy="${y(p[metric])}" r="7"><title>${timeLabel(p.time)} HKT · ${display(metric, p[metric])} ${d.unit}</title></circle>`).join('')}</svg>`;
    $('chartValue').innerHTML = `${display(metric, zone[metric])}<span>${d.unit}</span>`;
    $('chartCaption').textContent = `Current ${d.label.toLowerCase()}`;
    $('chartHint').textContent = 'Hover, focus, or select a point to inspect.';
    document.querySelectorAll('[data-metric]').forEach(button => {
      const selected = button.dataset.metric === metric;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function renderInsight() {
    const zone = current();
    const dry = zone.soilMoisture < zone.threshold;
    $('threshold').value = zone.threshold;
    $('thresholdValue').value = `${zone.threshold}%`;
    $('recommendationTitle').textContent = dry ? 'A little water could help.' : 'Let nature do its thing.';
    $('recommendationText').textContent = dry
      ? `Mock soil moisture is ${zone.soilMoisture}%, below your ${zone.threshold}% target. Verify real soil conditions and rainfall before watering.`
      : `Mock soil moisture is ${zone.soilMoisture}%, above your ${zone.threshold}% target. Hold off for now and check your real sensors before deciding.`;
    $('pumpStatus').textContent = zone.watered ? 'Demo cycle completed' : 'Standby';
  }
  function render() {
    const zone = current();
    $('zoneLabel').textContent = zone.label;
    $('zoneDescription').textContent = zone.description;
    $('updatedAt').textContent = `Mock reading · ${timeLabel(zone.updated)} HKT`;
    $('environmentList').innerHTML = [
      ['CO₂', 'Carbon dioxide', `${zone.co2} ppm`], ['◌', 'Air quality · TVOC', `${zone.tvoc} ppb`],
      ['pH', 'Soil pH', zone.ph.toFixed(1)], ['☂', 'Rain detected', zone.rain ? 'Yes · mock' : 'No · mock']
    ].map(([icon, label, value]) => `<div class="sensor-row"><span><b aria-hidden="true">${icon}</b>${label}</span><strong>${value}</strong></div>`).join('');
    renderCards(); drawChart(); renderInsight();
  }
  function recordReading() {
    const zone = current();
    const now = Date.now();
    const bucket = Math.floor(now / hour) * hour;
    const reading = { time: bucket, ...Object.fromEntries(Object.keys(definitions).map(key => [key, zone[key]])) };
    // Updating within an hour replaces that bucket rather than fabricating an hour of history.
    if (zone.history.at(-1).time === bucket) zone.history[zone.history.length - 1] = reading;
    else zone.history = [...zone.history, reading].slice(-24);
    zone.updated = now;
  }
  function chooseMetric(key) { metric = key; renderCards(); drawChart(); }
  $('metricCards').addEventListener('click', event => { const button = event.target.closest('[data-sensor]'); if (button) chooseMetric(button.dataset.sensor); });
  document.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => chooseMetric(button.dataset.metric)));
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
    range = Number(button.dataset.range);
    document.querySelectorAll('[data-range]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    drawChart();
  }));
  function inspectPoint(event) {
    const point = event.target.closest('[data-point]');
    if (!point) return;
    const reading = current().history.slice(-range)[Number(point.dataset.point)];
    $('chartValue').innerHTML = `${display(metric, reading[metric])}<span>${definitions[metric].unit}</span>`;
    $('chartCaption').textContent = `${timeLabel(reading.time)} HKT · mock reading`;
    $('chartHint').textContent = `${definitions[metric].label}: ${display(metric, reading[metric])} ${definitions[metric].unit} at ${timeLabel(reading.time)} HKT`;
    $('chartArea').querySelectorAll('.inspected').forEach(item => item.classList.remove('inspected'));
    point.classList.add('inspected');
  }
  ['pointerover', 'focusin', 'click'].forEach(type => $('chartArea').addEventListener(type, inspectPoint));
  $('chartArea').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspectPoint(event); } });
  $('zoneSelect').addEventListener('change', () => { zoneKey = $('zoneSelect').value; render(); toast(`Viewing ${current().label} · simulated readings`); });
  $('refreshButton').addEventListener('click', () => {
    const zone = current();
    Object.entries(definitions).forEach(([key, d]) => {
      const delta = key === 'light' ? 90 : key === 'temperature' ? 1.4 : 7;
      const value = Math.max(d.min, Math.min(d.max, zone[key] + (Math.random() - .5) * delta));
      zone[key] = key === 'temperature' ? +value.toFixed(1) : Math.round(value);
    });
    zone.co2 = Math.round(470 + Math.random() * 120);
    zone.tvoc = Math.round(50 + Math.random() * 90);
    zone.watered = false;
    recordReading(); render(); toast('Mock readings refreshed. No live farm sensors connected.');
  });
  $('threshold').addEventListener('input', () => { current().threshold = Number($('threshold').value); renderInsight(); renderCards(); drawChart(); });
  $('irrigateButton').addEventListener('click', () => {
    const zone = current();
    zone.soilMoisture = Math.min(100, zone.soilMoisture + 5);
    zone.watered = true;
    recordReading(); render(); toast('Demo watering complete: mock moisture +5 percentage points. No pump was activated.');
  });
  $('exportButton').addEventListener('click', () => {
    const zone = current();
    const rows = ['zone,data_source,timestamp,soil_moisture_percent,temperature_c,humidity_percent,light_lux', ...zone.history.map(row => `${zone.label},MOCK,${new Date(row.time).toISOString()},${row.soilMoisture},${row.temperature},${row.humidity},${row.light}`)];
    const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `agrosense-${zoneKey}-mock.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Mock sensor history exported.');
  });
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.bsTheme = theme;
    $('themeToggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  }
  try { applyTheme(localStorage.getItem('agrosense-theme') === 'dark' ? 'dark' : 'light'); } catch { applyTheme('light'); }
  $('themeToggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(theme);
    try { localStorage.setItem('agrosense-theme', theme); } catch { /* Storage can be blocked in private browsing. */ }
  });
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach(item => { item.classList.toggle('active', item === link); if (item === link) item.setAttribute('aria-current', 'location'); else item.removeAttribute('aria-current'); });
  }));
  function addText(parent, className, text, tag = 'div') { const node = document.createElement(tag); node.className = className; node.textContent = text; parent.append(node); return node; }
  async function weatherRequest(type) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=${type}&lang=en`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function updateWeather() {
    if (weatherLoading) return;
    weatherLoading = true; $('weatherRefresh').disabled = true;
    $('hkoStatus').textContent = 'Loading outdoor observation…';
    $('hkoForecastStatus').textContent = 'Loading forecast…';
    const results = await Promise.allSettled([weatherRequest('rhrread'), weatherRequest('fnd')]);
    const observation = results[0].status === 'fulfilled' ? results[0].value : null;
    const reading = observation?.temperature?.data?.find(item => item.place === 'Hong Kong Observatory');
    if (reading && Number.isFinite(Number(reading.value))) {
      $('hkoTemperature').textContent = Number(reading.value).toFixed(1);
      const timestamp = observation.temperature.recordTime || observation.updateTime;
      $('hkoStatus').textContent = timestamp && Number.isFinite(Date.parse(timestamp)) ? `Observed ${new Date(timestamp).toLocaleString('en-HK', { timeZone: 'Asia/Hong_Kong', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} HKT` : 'Latest available HKO observation';
    } else {
      $('hkoTemperature').textContent = '—'; $('hkoStatus').textContent = 'Observation unavailable. Use Refresh weather to retry.';
    }
    const forecast = results[1].status === 'fulfilled' ? results[1].value : null;
    hkoForecast = Array.isArray(forecast?.weatherForecast) ? forecast.weatherForecast.slice(0, 7).map(day => {
      const raw = String(day.forecastDate || '');
      const date = /^\d{8}$/.test(raw) ? new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T12:00:00+08:00`) : null;
      return { date: raw, dateLabel: date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-HK', { timeZone: 'Asia/Hong_Kong', weekday: 'short', day: 'numeric' }) : '—', weather: String(day.forecastWeather || 'Forecast unavailable'), min: day.forecastMintemp?.value ?? '—', max: day.forecastMaxtemp?.value ?? '—', rain: String(day.PSR || 'Not available') };
    }) : [];
    $('hkoForecastList').replaceChildren();
    if (!hkoForecast.length) {
      addText($('hkoForecastList'), 'muted', 'Forecast unavailable. Refresh to try again.');
      $('hkoForecastStatus').textContent = 'Forecast unavailable'; weatherUpdated = null;
    } else {
      hkoForecast.forEach(day => {
        const card = document.createElement('article'); card.className = 'forecast-day';
        addText(card, 'forecast-date', day.dateLabel);
        const icon = addText(card, 'forecast-icon', /rain|shower|thunder/i.test(day.weather) ? '☂' : /cloud|overcast/i.test(day.weather) ? '☁' : '☀'); icon.setAttribute('aria-hidden', 'true');
        addText(card, 'forecast-temp', `${day.min}–${day.max}°`);
        addText(card, 'forecast-rain', `Rain: ${day.rain}`);
        const details = document.createElement('details'); details.className = 'forecast-details';
        addText(details, '', 'Details', 'summary'); addText(details, 'forecast-weather', day.weather); card.append(details);
        $('hkoForecastList').append(card);
      });
      weatherUpdated = forecast.updateTime || null;
      $('hkoForecastStatus').textContent = weatherUpdated && Number.isFinite(Date.parse(weatherUpdated)) ? `Forecast issued ${new Date(weatherUpdated).toLocaleString('en-HK', { timeZone: 'Asia/Hong_Kong', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} HKT` : 'Latest available seven-day forecast';
    }
    weatherLoading = false; $('weatherRefresh').disabled = false;
  }
  $('weatherRefresh').addEventListener('click', updateWeather);
  window.AgroSense = Object.freeze({
    getFarmData: () => {
      const { label, soilMoisture, temperature, humidity, light, co2, tvoc, ph, rain, threshold } = current();
      return { zone: label, dataSource: 'MOCK FARM SENSORS', soilMoisture, temperature, humidity, light, co2, tvoc, ph, rain, threshold, hkoForecast: hkoForecast.map(day => ({ ...day })), hkoForecastUpdated: weatherUpdated };
    }
  });
  render(); updateWeather();
  setInterval(updateWeather, 10 * 60 * 1000);
})();
