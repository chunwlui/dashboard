const state = {
  soilMoisture: 41,
  temperature: 28.4,
  humidity: 72,
  light: 620,
  co2: 520,
  tvoc: 85,
  ph: 6.4,
  rain: false,
  hkoForecast: [],
  history: [
    48, 47, 46, 45, 44, 43, 42, 41,
    40, 39, 40, 41, 42, 42, 41, 40,
    39, 40, 41, 42, 42, 41, 40, 41
  ]
};

const $ = id => document.getElementById(id);

function formatHkoForecastDate(dateString) {
  if (!/^\d{8}$/.test(dateString || '')) return dateString || '--';

  const date = new Date(Date.UTC(
    Number(dateString.slice(0, 4)),
    Number(dateString.slice(4, 6)) - 1,
    Number(dateString.slice(6, 8))
  ));

  return date.toLocaleDateString('en-HK', {
    timeZone: 'Asia/Hong_Kong',
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function forecastValue(value, fallback = '--') {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
  }
  return value ?? fallback;
}

function renderHkoForecast() {
  const list = $('hkoForecastList');
  if (!list) return;

  if (!state.hkoForecast.length) {
    list.innerHTML = '<p class="metric-note">HKO forecast unavailable. Please try again later.</p>';
    return;
  }

  list.innerHTML = state.hkoForecast.map(day => `
    <article class="forecast-day">
      <div class="forecast-date">${day.dateLabel}</div>
      <div class="forecast-icon" aria-hidden="true">${day.icon}</div>
      <div class="forecast-weather">${day.weather}</div>
      <div class="forecast-temp">${day.min}–${day.max} °C</div>
      <div class="forecast-rain">Rain: ${day.rain}</div>
    </article>
  `).join('');
}

async function updateHkoForecast() {
  const statusElement = $('hkoForecastStatus');
  const url =
    'https://data.weather.gov.hk/weatherAPI/opendata/weather.php' +
    '?dataType=fnd&lang=en';

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HKO forecast HTTP ${response.status}`);

    const data = await response.json();
    const forecasts = Array.isArray(data.weatherForecast)
      ? data.weatherForecast.slice(0, 7)
      : [];

    if (!forecasts.length) throw new Error('No HKO forecast records returned');

    state.hkoForecast = forecasts.map(day => ({
      date: day.forecastDate || '',
      dateLabel: formatHkoForecastDate(day.forecastDate),
      weather: day.forecastWeather || 'Not available',
      min: forecastValue(day.forecastMintemp),
      max: forecastValue(day.forecastMaxtemp),
      rain: day.PSR || 'Not available',
      icon: '☁'
    }));

    statusElement.textContent = data.updateTime
      ? `Updated ${new Date(data.updateTime).toLocaleString('en-HK', {
          timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit'
        })} HKT`
      : 'Latest available forecast';

    renderHkoForecast();
  } catch (error) {
    console.error('Could not load HKO forecast:', error);
    state.hkoForecast = [];
    statusElement.textContent = 'HKO forecast unavailable';
    renderHkoForecast();
  }
}

function render() {
  $('soilMoisture').textContent = state.soilMoisture;
  $('temperature').textContent = state.temperature.toFixed(1);
  $('humidity').textContent = state.humidity;
  $('light').textContent = state.light;
  $('co2').textContent = state.co2;
  $('tvoc').textContent = state.tvoc;
  $('ph').textContent = state.ph.toFixed(1);
  $('rain').textContent = state.rain ? 'Yes' : 'No';

  $('soilNote').textContent =
    state.soilMoisture < 35
      ? 'Below target - irrigation needed'
      : 'Within target range';

  $('temperatureNote').textContent =
    state.temperature > 32
      ? 'Fan recommended'
      : 'Comfortable for crops';

  $('recommendationTitle').textContent =
    state.soilMoisture < 35
      ? 'Irrigate soon'
      : 'Delay irrigation';

  $('recommendationText').textContent =
    state.soilMoisture < 35
      ? `Soil moisture is ${state.soilMoisture}%. Water for approximately 3 minutes if no rain is detected.`
      : `Soil moisture is currently ${state.soilMoisture}%, and ${state.rain ? 'rain is detected' : 'no rain is detected'}. Recheck tomorrow morning before watering.`;

  $('saving').textContent =
    state.soilMoisture < 35 ? '10%' : '25%';

  const now = new Date();

  $('updatedAt').textContent =
    `Updated ${now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })}`;

  $('footerTime').textContent = now.toLocaleString();

  drawChart();
}

function drawChart() {
  const canvas = $('soilChart');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const pad = { l: 42, r: 16, t: 18, b: 32 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;

  ctx.font = '12px system-ui';
  ctx.fillStyle = '#9aa59e';
  ctx.strokeStyle = '#edf1ed';
  ctx.lineWidth = 1;

  [20, 35, 50].forEach(value => {
    const y = pad.t + ih - ((value - 20) / 30) * ih;

    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();

    ctx.fillText(`${value}%`, 6, y + 4);
  });

  const targetY = pad.t + ih - ((35 - 20) / 30) * ih;

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#cfdad1';
  ctx.beginPath();
  ctx.moveTo(pad.l, targetY);
  ctx.lineTo(w - pad.r, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  const points = state.history.map((value, index) => [
    pad.l + (index / (state.history.length - 1)) * iw,
    pad.t + ih - ((value - 20) / 30) * ih
  ]);

  ctx.beginPath();

  points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.lineTo(points.at(-1)[0], pad.t + ih);
  ctx.lineTo(points[0][0], pad.t + ih);
  ctx.closePath();

  ctx.fillStyle = 'rgba(46,155,104,.10)';
  ctx.fill();

  ctx.beginPath();

  points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.strokeStyle = '#2e9b68';
  ctx.lineWidth = 3;
  ctx.stroke();

  const [lastX, lastY] = points.at(-1);

  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#2e9b68';
  ctx.lineWidth = 3;
  ctx.stroke();
}

$('refreshButton').addEventListener('click', () => {
  const delta = Math.round((Math.random() - 0.5) * 8);

  state.soilMoisture = Math.max(
    22,
    Math.min(65, state.soilMoisture + delta)
  );

  state.temperature = 27.5 + Math.random() * 3;
  state.humidity = Math.round(66 + Math.random() * 15);
  state.light = Math.round(450 + Math.random() * 350);
  state.co2 = Math.round(470 + Math.random() * 120);
  state.tvoc = Math.round(50 + Math.random() * 90);

  state.history = [
    ...state.history.slice(1),
    state.soilMoisture
  ];

  render();
});

const MAX_CHAT_MESSAGES = 12;

$('chatForm').addEventListener('submit', async event => {
  event.preventDefault();

  const input = $('chatInput');
  const question = input.value.trim();
  if (!question) return;

  const messages = $('chatMessages');
  const button = $('chatForm').querySelector('button');

  const userMessage = document.createElement('div');
  userMessage.className = 'message user';
  userMessage.textContent = question;
  messages.appendChild(userMessage);

  const assistantMessage = document.createElement('div');
  assistantMessage.className = 'message assistant';
  assistantMessage.textContent = 'Thinking…';
  messages.appendChild(assistantMessage);

  input.value = '';
  input.disabled = true;
  button.disabled = true;
  messages.scrollTop = messages.scrollHeight;

  const conversation = Array.from(messages.querySelectorAll('.message'))
    .slice(-MAX_CHAT_MESSAGES - 1, -1)
    .map(message => ({
      role: message.classList.contains('user') ? 'user' : 'assistant',
      content: message.textContent
    }));

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        conversation,
        farmData: {
          soilMoisture: state.soilMoisture,
          temperature: state.temperature,
          humidity: state.humidity,
          light: state.light,
          co2: state.co2,
          tvoc: state.tvoc,
          ph: state.ph,
          rain: state.rain,
          hkoForecast: state.hkoForecast
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Chat request failed');
    }

    assistantMessage.textContent = result.answer;
  } catch (error) {
    console.error('DeepSeek chat error:', error);
    assistantMessage.textContent =
      'Sorry, the DeepSeek chat is unavailable right now. Please try again.';
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }
});

/*
 * HKO outdoor temperature is separate from the mock farm sensor state.
 * It does not affect irrigation recommendations or mock chat answers.
 */
async function updateHkoTemperature() {
  const temperatureElement = $('hkoTemperature');
  const statusElement = $('hkoStatus');

  const url =
    'https://data.weather.gov.hk/weatherAPI/opendata/weather.php' +
    '?dataType=rhrread&lang=en';

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HKO API returned HTTP ${response.status}`);
    }

    const data = await response.json();

    const reading = data.temperature?.data?.find(
      item => item.place === 'Hong Kong Observatory'
    );

    if (!reading || !Number.isFinite(Number(reading.value))) {
      throw new Error(
        'Temperature for the Hong Kong Observatory station is unavailable'
      );
    }

    temperatureElement.textContent = Number(reading.value).toFixed(1);

    const observationTime =
      data.temperature?.recordTime ||
      data.updateTime;

    if (observationTime) {
      const date = new Date(observationTime);

      statusElement.textContent = Number.isNaN(date.getTime())
        ? `HKO observation time: ${observationTime}`
        : `HKO observation: ${date.toLocaleString('en-HK', {
            timeZone: 'Asia/Hong_Kong',
            dateStyle: 'medium',
            timeStyle: 'short'
          })} HKT`;
    } else {
      statusElement.textContent =
        'Latest available HKO observation';
    }
  } catch (error) {
    console.error('Could not load HKO temperature:', error);

    temperatureElement.textContent = '--';
    statusElement.textContent =
      'HKO temperature unavailable. Please try again later.';
  }
}

render();
updateHkoTemperature();
updateHkoForecast();

// HKO publishes new observations/forecasts periodically; refresh every 10 minutes.
setInterval(updateHkoTemperature, 10 * 60 * 1000);
setInterval(updateHkoForecast, 10 * 60 * 1000);