const state = {
  soilMoisture: 41,
  temperature: 28.4,
  humidity: 72,
  light: 620,
  co2: 520,
  tvoc: 85,
  ph: 6.4,
  rain: false,
  history: [48,47,46,45,44,43,42,41,40,39,40,41,42,42,41,40,39,40,41,42,42,41,40,41]
};
const $ = id => document.getElementById(id);
function render() {
  $('soilMoisture').textContent = state.soilMoisture;
  $('temperature').textContent = state.temperature.toFixed(1);
  $('humidity').textContent = state.humidity;
  $('light').textContent = state.light;
  $('co2').textContent = state.co2;
  $('tvoc').textContent = state.tvoc;
  $('ph').textContent = state.ph.toFixed(1);
  $('rain').textContent = state.rain ? 'Yes' : 'No';
  $('soilNote').textContent = state.soilMoisture < 35 ? 'Below target - irrigation needed' : 'Within target range';
  $('temperatureNote').textContent = state.temperature > 32 ? 'Fan recommended' : 'Comfortable for crops';
  $('recommendationTitle').textContent = state.soilMoisture < 35 ? 'Irrigate soon' : 'Delay irrigation';
  $('recommendationText').textContent = state.soilMoisture < 35 ? `Soil moisture is ${state.soilMoisture}%. Water for approximately 3 minutes if no rain is detected.` : `Soil moisture is currently ${state.soilMoisture}%, and ${state.rain ? 'rain is detected' : 'no rain is detected'}. Recheck tomorrow morning before watering.`;
  $('saving').textContent = state.soilMoisture < 35 ? '10%' : '25%';
  const now = new Date(); $('updatedAt').textContent = `Updated ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`; $('footerTime').textContent = now.toLocaleString();
  drawChart();
}
function drawChart() {
  const canvas = $('soilChart'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h); const pad = {l:42,r:16,t:18,b:32}, iw=w-pad.l-pad.r, ih=h-pad.t-pad.b;
  ctx.font='12px system-ui'; ctx.fillStyle='#9aa59e'; ctx.strokeStyle='#edf1ed'; ctx.lineWidth=1;
  [20,35,50].forEach(v=>{const y=pad.t+ih-(v-20)/30*ih;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(`${v}%`,6,y+4)});
  const targetY=pad.t+ih-(35-20)/30*ih;ctx.setLineDash([5,5]);ctx.strokeStyle='#cfdad1';ctx.beginPath();ctx.moveTo(pad.l,targetY);ctx.lineTo(w-pad.r,targetY);ctx.stroke();ctx.setLineDash([]);
  const points=state.history.map((v,i)=>[pad.l+i/(state.history.length-1)*iw,pad.t+ih-(v-20)/30*ih]);
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.lineTo(points.at(-1)[0],pad.t+ih);ctx.lineTo(points[0][0],pad.t+ih);ctx.closePath();ctx.fillStyle='rgba(46,155,104,.10)';ctx.fill();
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#2e9b68';ctx.lineWidth=3;ctx.stroke();
  const [lx,ly]=points.at(-1);ctx.beginPath();ctx.arc(lx,ly,5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#2e9b68';ctx.lineWidth=3;ctx.stroke();
}
$('refreshButton').addEventListener('click',()=>{ const delta=Math.round((Math.random()-.5)*8); state.soilMoisture=Math.max(22,Math.min(65,state.soilMoisture+delta)); state.temperature=27.5+Math.random()*3; state.humidity=Math.round(66+Math.random()*15); state.light=Math.round(450+Math.random()*350); state.co2=Math.round(470+Math.random()*120); state.tvoc=Math.round(50+Math.random()*90); state.history=[...state.history.slice(1),state.soilMoisture]; render(); });
$('chatForm').addEventListener('submit',e=>{e.preventDefault();const input=$('chatInput'),q=input.value.trim();if(!q)return;const messages=$('chatMessages');messages.insertAdjacentHTML('beforeend',`<div class="message user"></div>`);messages.lastElementChild.textContent=q;let answer='Based on the mock readings, conditions look stable. I would recheck soil moisture tomorrow morning.';if(/water|irrigat/i.test(q))answer=state.soilMoisture<35?'Yes. Mock soil moisture is low, so irrigation is recommended if no rain is detected.':'Not yet. Mock soil moisture is above 35%, so delaying irrigation should save water.';if(/temperature|hot|fan/i.test(q))answer=state.temperature>32?'The mock temperature is high; increase fan speed.':'Temperature is currently comfortable for the crops.';messages.insertAdjacentHTML('beforeend',`<div class="message assistant"></div>`);messages.lastElementChild.textContent=answer;messages.scrollTop=messages.scrollHeight;input.value='';});
render();
async function updateHkoTemperature() {
  const temperatureElement = document.getElementById('hkoTemperature');
  const statusElement = document.getElementById('hkoStatus');

  try {
    const url =
      'https://data.weather.gov.hk/weatherAPI/opendata/weather.php' +
      '?dataType=rhrread&lang=en';

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HKO returned HTTP ${response.status}`);
    }

    const data = await response.json();

    // Select the Hong Kong Observatory station, rather than a random HK station.
    const reading = data.temperature?.data?.find(
      item => item.place === 'Hong Kong Observatory'
    );

    if (!reading || !Number.isFinite(Number(reading.value))) {
      throw new Error('Hong Kong Observatory temperature is unavailable');
    }

    temperatureElement.textContent = `${reading.value} °C`;

    const observationTime = data.temperature.recordTime || data.updateTime;
    statusElement.textContent = observationTime
      ? `HKO observation: ${new Date(observationTime).toLocaleString('en-HK', {
          timeZone: 'Asia/Hong_Kong',
          dateStyle: 'medium',
          timeStyle: 'short'
        })} HKT`
      : 'Source: Hong Kong Observatory';
  } catch (error) {
    console.error('Could not load HKO temperature:', error);
    temperatureElement.textContent = 'Unavailable';
    statusElement.textContent = 'HKO data could not be loaded. Try again later.';
  }
}

updateHkoTemperature();
setInterval(updateHkoTemperature, 10 * 60 * 1000);
