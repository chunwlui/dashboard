(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const FARM_STORAGE_KEY = 'agrosense-farm-state-v1';
  const ZONE_STORAGE_KEY = 'agrosense-selected-zone-v1';
  const CONTROL_STORAGE_KEY = 'agrosense-device-controls-v1';
  const ACTIVITY_STORAGE_KEY = 'agrosense-control-activity-v1';
  const zoneSeeds = {
    greenhouse: { label: 'Greenhouse A', description: 'Leafy greens · covered growing area', soilMoisture: 41, temperature: 28.4, humidity: 72, light: 620, co2: 520, tvoc: 85, ph: 6.4, rain: false, threshold: 35, updated: Date.now() },
    field: { label: 'Open field B', description: 'Seasonal vegetables · outdoor growing area', soilMoisture: 31, temperature: 30.2, humidity: 65, light: 810, co2: 430, tvoc: 61, ph: 6.7, rain: false, threshold: 35, updated: Date.now() },
    nursery: { label: 'Nursery C', description: 'Young seedlings · sheltered growing area', soilMoisture: 49, temperature: 26.1, humidity: 78, light: 480, co2: 560, tvoc: 72, ph: 6.2, rain: false, threshold: 35, updated: Date.now() }
  };

  const safeGet = key => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const safeSet = (key, value) => {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  };
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const hktTime = timestamp => new Date(timestamp).toLocaleTimeString('en-HK', {
    timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const hktDateTime = timestamp => new Date(timestamp).toLocaleString('en-HK', {
    timeZone: 'Asia/Hong_Kong', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });

  function readFarmState() {
    const fallback = {
      version: 1,
      selectedZone: 'greenhouse',
      updatedAt: Date.now(),
      zones: Object.fromEntries(Object.entries(zoneSeeds).map(([key, value]) => [key, { ...value }]))
    };
    const raw = safeGet(FARM_STORAGE_KEY);
    if (!raw) return fallback;
    try {
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object' || !stored.zones) return fallback;
      Object.keys(zoneSeeds).forEach(key => {
        if (!stored.zones[key] || typeof stored.zones[key] !== 'object') stored.zones[key] = { ...zoneSeeds[key] };
        else stored.zones[key] = { ...zoneSeeds[key], ...stored.zones[key] };
      });
      return stored;
    } catch {
      return fallback;
    }
  }

  function defaultZoneControls(zone) {
    return {
      light: { mode: 'manual', on: false, threshold: 400 },
      fan: { mode: 'manual', on: false, temperatureThreshold: 30, humidityThreshold: 80 },
      pump: {
        mode: 'manual', on: false, moistureThreshold: clamp(zone.threshold, 20, 60, 35), duration: 10,
        cooldownMinutes: 5, runStartedAt: null, runEndsAt: null, lastRunAt: null, cooldownEndsAt: null,
        runningSource: null
      }
    };
  }

  function sanitizeDeviceControls(raw, farm) {
    const result = { version: 1, zones: {} };
    Object.keys(zoneSeeds).forEach(key => {
      const base = defaultZoneControls(farm.zones[key]);
      const saved = raw?.zones?.[key] || {};
      const savedLight = saved.light || {};
      const savedFan = saved.fan || {};
      const savedPump = saved.pump || {};
      result.zones[key] = {
        light: {
          mode: savedLight.mode === 'auto' ? 'auto' : 'manual',
          on: Boolean(savedLight.on),
          threshold: clamp(savedLight.threshold, 100, 900, base.light.threshold)
        },
        fan: {
          mode: savedFan.mode === 'auto' ? 'auto' : 'manual',
          on: Boolean(savedFan.on),
          temperatureThreshold: clamp(savedFan.temperatureThreshold, 20, 40, base.fan.temperatureThreshold),
          humidityThreshold: clamp(savedFan.humidityThreshold, 40, 95, base.fan.humidityThreshold)
        },
        pump: {
          mode: savedPump.mode === 'auto' ? 'auto' : 'manual',
          on: Boolean(savedPump.on),
          moistureThreshold: clamp(savedPump.moistureThreshold, 20, 60, base.pump.moistureThreshold),
          duration: clamp(savedPump.duration, 5, 30, base.pump.duration),
          cooldownMinutes: clamp(savedPump.cooldownMinutes, 1, 10, base.pump.cooldownMinutes),
          runStartedAt: Number.isFinite(Number(savedPump.runStartedAt)) ? Number(savedPump.runStartedAt) : null,
          runEndsAt: Number.isFinite(Number(savedPump.runEndsAt)) ? Number(savedPump.runEndsAt) : null,
          lastRunAt: Number.isFinite(Number(savedPump.lastRunAt)) ? Number(savedPump.lastRunAt) : null,
          cooldownEndsAt: Number.isFinite(Number(savedPump.cooldownEndsAt)) ? Number(savedPump.cooldownEndsAt) : null,
          runningSource: typeof savedPump.runningSource === 'string' ? savedPump.runningSource : null
        }
      };
    });
    return result;
  }

  function readControlState(farm) {
    try { return sanitizeDeviceControls(JSON.parse(safeGet(CONTROL_STORAGE_KEY) || '{}'), farm); }
    catch { return sanitizeDeviceControls({}, farm); }
  }

  function readActivity() {
    try {
      const value = JSON.parse(safeGet(ACTIVITY_STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.slice(0, 40) : [];
    } catch { return []; }
  }

  let farmState = readFarmState();
  let controls = readControlState(farmState);
  let activity = readActivity();
  let selectedZone = safeGet(ZONE_STORAGE_KEY) || farmState.selectedZone || 'greenhouse';
  if (!zoneSeeds[selectedZone]) selectedZone = 'greenhouse';
  let toastTimer;
  let lastEvaluatedAt = Date.now();

  const farm = () => farmState.zones[selectedZone];
  const zoneControls = () => controls.zones[selectedZone];

  function saveFarmState() {
    farmState.selectedZone = selectedZone;
    farmState.updatedAt = Date.now();
    safeSet(FARM_STORAGE_KEY, JSON.stringify(farmState));
    safeSet(ZONE_STORAGE_KEY, selectedZone);
  }

  function saveControls() {
    safeSet(CONTROL_STORAGE_KEY, JSON.stringify(controls));
  }

  function saveActivity() {
    safeSet(ACTIVITY_STORAGE_KEY, JSON.stringify(activity.slice(0, 40)));
  }

  function showToast(message) {
    $('controlToast').textContent = message;
    $('controlToast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('controlToast').hidden = true; }, 4200);
  }

  function addActivity(device, message, kind = 'normal', mode = null) {
    activity.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: Date.now(), zone: farm().label, device, message, kind,
      mode: mode || zoneControls()[device]?.mode || 'system'
    });
    activity = activity.slice(0, 40);
    saveActivity();
    renderActivity();
  }

  function remainingCooldown(pump, now = Date.now()) {
    return pump.cooldownEndsAt && pump.cooldownEndsAt > now ? pump.cooldownEndsAt - now : 0;
  }

  function setSimpleDevice(device, on, source, logChange = true) {
    const item = zoneControls()[device];
    if (item.on === on) return false;
    item.on = on;
    saveControls();
    if (logChange) addActivity(device, `${device === 'light' ? 'Grow light' : 'Ventilation fan'} turned ${on ? 'on' : 'off'} ${source}.`, on ? 'normal' : 'stop');
    return true;
  }

  function updateMockMoisture(increase) {
    const zone = farm();
    zone.soilMoisture = Math.min(100, Math.round(Number(zone.soilMoisture) + increase));
    zone.watered = true;
    zone.updated = Date.now();
    if (Array.isArray(zone.history) && zone.history.length) {
      const latest = zone.history[zone.history.length - 1];
      zone.history[zone.history.length - 1] = { ...latest, time: Date.now(), soilMoisture: zone.soilMoisture };
    }
    saveFarmState();
  }

  function startPump(source) {
    const pump = zoneControls().pump;
    if (pump.on) return false;
    const cooldown = remainingCooldown(pump);
    if (cooldown > 0) {
      showToast(`Pump safety cooldown has ${Math.ceil(cooldown / 60000)} minute(s) remaining.`);
      return false;
    }
    const now = Date.now();
    pump.on = true;
    pump.runStartedAt = now;
    pump.runEndsAt = now + pump.duration * 1000;
    pump.runningSource = source;
    saveControls();
    addActivity('pump', `Water pump started a ${pump.duration}-second simulated cycle (${source}).`, 'warning');
    render();
    return true;
  }

  function stopPump(reason, options = {}) {
    const pump = zoneControls().pump;
    if (!pump.on) return false;
    const { completed = false, logChange = true, cooldown = true } = options;
    pump.on = false;
    pump.runStartedAt = null;
    pump.runEndsAt = null;
    pump.runningSource = null;
    pump.lastRunAt = Date.now();
    pump.cooldownEndsAt = cooldown ? Date.now() + pump.cooldownMinutes * 60 * 1000 : null;
    if (completed) updateMockMoisture(5);
    saveControls();
    if (logChange) addActivity('pump', completed ? 'Watering cycle completed. Mock soil moisture increased by 5%.' : `Water pump stopped (${reason}).`, completed ? 'normal' : 'stop');
    render();
    return true;
  }

  function evaluateAutomation(logChanges = true) {
    const readings = farm();
    const state = zoneControls();
    lastEvaluatedAt = Date.now();

    if (state.light.mode === 'auto') {
      setSimpleDevice('light', Number(readings.light) < state.light.threshold, 'by the automatic light rule', logChanges);
    }

    if (state.fan.mode === 'auto') {
      const shouldRun = Number(readings.temperature) >= state.fan.temperatureThreshold || Number(readings.humidity) >= state.fan.humidityThreshold;
      setSimpleDevice('fan', shouldRun, 'by the automatic climate rule', logChanges);
    }

    if (state.pump.mode === 'auto' && !state.pump.on) {
      const needsWater = Number(readings.soilMoisture) < state.pump.moistureThreshold;
      if (needsWater && remainingCooldown(state.pump) === 0) startPump('automatic moisture rule');
    }

    saveControls();
    render();
  }

  function modeHelp(device, mode) {
    if (mode === 'manual') {
      if (device === 'pump') return 'Manual starts always require confirmation.';
      return `You decide when the ${device} runs.`;
    }
    if (device === 'light') return 'The light follows the lux threshold.';
    if (device === 'fan') return 'The fan follows temperature or humidity.';
    return 'The pump follows moisture, timer, and cooldown rules.';
  }

  function statusBadge(element, state, text) {
    element.classList.remove('on', 'off', 'cooldown');
    element.classList.add(state);
    element.lastChild.textContent = ` ${text}`;
  }

  function setModeButtons(device, mode) {
    document.querySelectorAll(`[data-device="${device}"][data-mode]`).forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderDevice(device) {
    const readings = farm();
    const state = zoneControls()[device];
    const card = $(`${device}Card`);
    card.classList.toggle('is-on', state.on);
    setModeButtons(device, state.mode);
    $(`${device}ModeHelp`).textContent = modeHelp(device, state.mode);

    if (device === 'light') {
      statusBadge($('lightStatusBadge'), state.on ? 'on' : 'off', state.on ? 'On' : 'Off');
      $('lightThreshold').value = state.threshold;
      $('lightThresholdValue').value = `${state.threshold} lux`;
      $('lightCurrentValue').textContent = `${readings.light} lux`;
      $('lightRuleText').textContent = state.mode === 'manual'
        ? `Manual mode · light is ${state.on ? 'on' : 'off'}.`
        : `${readings.light} lux is ${Number(readings.light) < state.threshold ? 'below' : 'at or above'} the ${state.threshold} lux target · light ${state.on ? 'on' : 'off'}.`;
    }

    if (device === 'fan') {
      statusBadge($('fanStatusBadge'), state.on ? 'on' : 'off', state.on ? 'On' : 'Off');
      $('fanTemperatureThreshold').value = state.temperatureThreshold;
      $('fanHumidityThreshold').value = state.humidityThreshold;
      $('fanTemperatureValue').value = `${state.temperatureThreshold}°C`;
      $('fanHumidityValue').value = `${state.humidityThreshold}%`;
      $('fanCurrentValue').textContent = `${Number(readings.temperature).toFixed(1)}°C · ${readings.humidity}%`;
      const trigger = Number(readings.temperature) >= state.temperatureThreshold
        ? `temperature is at or above ${state.temperatureThreshold}°C`
        : Number(readings.humidity) >= state.humidityThreshold
          ? `humidity is at or above ${state.humidityThreshold}%`
          : 'temperature and humidity are below their limits';
      $('fanRuleText').textContent = state.mode === 'manual' ? `Manual mode · fan is ${state.on ? 'on' : 'off'}.` : `Auto rule · ${trigger} · fan ${state.on ? 'on' : 'off'}.`;
    }

    if (device === 'pump') {
      const cooldown = remainingCooldown(state);
      const seconds = state.on && state.runEndsAt ? Math.max(0, Math.ceil((state.runEndsAt - Date.now()) / 1000)) : 0;
      if (state.on) statusBadge($('pumpStatusBadge'), 'on', `Running · ${seconds}s`);
      else if (cooldown) statusBadge($('pumpStatusBadge'), 'cooldown', `Cooldown · ${Math.ceil(cooldown / 60000)}m`);
      else statusBadge($('pumpStatusBadge'), 'off', 'Off');
      $('pumpMoistureThreshold').value = state.moistureThreshold;
      $('pumpDuration').value = String(state.duration);
      $('pumpCooldown').value = String(state.cooldownMinutes);
      $('pumpMoistureValue').value = `${state.moistureThreshold}%`;
      $('pumpCurrentValue').textContent = `${readings.soilMoisture}%`;
      $('pumpRuleText').textContent = state.on
        ? `${state.runningSource || 'Timed cycle'} · stopping automatically in ${seconds} second${seconds === 1 ? '' : 's'}.`
        : cooldown
          ? `Safety cooldown active · ${Math.ceil(cooldown / 1000)} seconds remaining.`
          : state.mode === 'manual'
            ? 'Manual mode · pump is safely off.'
            : `${readings.soilMoisture}% is ${Number(readings.soilMoisture) < state.moistureThreshold ? 'below' : 'at or above'} the ${state.moistureThreshold}% target · pump ${state.on ? 'on' : 'off'}.`;
    }

    const manualButtons = document.querySelectorAll(`[data-device="${device}"][data-command]`);
    manualButtons.forEach(button => {
      if (device === 'pump' && button.dataset.command === 'stop') button.disabled = !state.on;
      else if (device === 'pump') button.disabled = state.mode === 'auto' || state.on || remainingCooldown(state) > 0;
      else if (button.dataset.command === 'on') button.disabled = state.mode === 'auto' || state.on;
      else button.disabled = state.mode === 'auto' || !state.on;
    });
  }

  function renderActivity() {
    const list = $('activityLog');
    list.replaceChildren();
    if (!activity.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-activity';
      empty.textContent = 'No control activity yet. Change a mode or operate a simulated device.';
      list.append(empty);
      return;
    }
    activity.forEach(entry => {
      const row = document.createElement('article'); row.className = 'activity-entry';
      const dot = document.createElement('span'); dot.className = `activity-dot ${entry.kind || ''}`; dot.setAttribute('aria-hidden', 'true');
      const meta = document.createElement('div'); meta.className = 'activity-meta';
      const device = document.createElement('strong'); device.textContent = entry.device === 'system' ? 'System' : entry.device.charAt(0).toUpperCase() + entry.device.slice(1);
      const time = document.createElement('span'); time.textContent = `${hktDateTime(entry.time)} HKT`;
      meta.append(device, time);
      const message = document.createElement('div'); message.className = 'activity-message'; message.textContent = `${entry.zone}: ${entry.message}`;
      const mode = document.createElement('span'); mode.className = 'activity-mode'; mode.textContent = entry.mode || 'system';
      row.append(dot, meta, message, mode); list.append(row);
    });
  }

  function render() {
    const readings = farm();
    const state = zoneControls();
    $('controlZoneSelect').value = selectedZone;
    $('controlZoneLabel').textContent = readings.label;
    $('controlZoneDescription').textContent = readings.description;
    $('controlLightReading').textContent = `${readings.light} lux`;
    $('controlTemperatureReading').textContent = `${Number(readings.temperature).toFixed(1)} °C`;
    $('controlHumidityReading').textContent = `${readings.humidity}%`;
    $('controlMoistureReading').textContent = `${readings.soilMoisture}%`;
    $('sensorSourceStatus').textContent = safeGet(FARM_STORAGE_KEY) ? 'Shared mock readings' : 'Built-in mock readings';
    $('automaticCount').textContent = `${['light', 'fan', 'pump'].filter(device => state[device].mode === 'auto').length} of 3`;
    $('runningCount').textContent = `${['light', 'fan', 'pump'].filter(device => state[device].on).length} of 3`;
    $('lastEvaluation').textContent = `Rules checked ${hktTime(lastEvaluatedAt)} HKT · mock data`;
    $('controlFooterTime').textContent = new Date().toLocaleDateString('en-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'short', day: 'numeric' });
    renderDevice('light'); renderDevice('fan'); renderDevice('pump'); renderActivity();
  }

  function changeMode(device, mode) {
    const state = zoneControls()[device];
    if (state.mode === mode) return;
    if (device === 'pump' && mode === 'auto' && Number(farm().soilMoisture) < state.moistureThreshold) {
      const accepted = window.confirm('The mock soil moisture is below the automatic threshold, so the simulated pump may start immediately. Continue?');
      if (!accepted) return;
    }
    if (device === 'pump' && state.on && mode === 'manual') stopPump('mode changed to manual', { completed: false });
    state.mode = mode;
    saveControls();
    addActivity(device, `${device === 'pump' ? 'Water pump' : device === 'fan' ? 'Ventilation fan' : 'Grow light'} changed to ${mode} mode.`, mode === 'auto' ? 'warning' : 'normal', mode);
    evaluateAutomation();
  }

  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => changeMode(button.dataset.device, button.dataset.mode)));

  document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
    const { device, command } = button.dataset;
    const state = zoneControls()[device];
    if (device === 'light' || device === 'fan') {
      if (state.mode !== 'manual') return;
      setSimpleDevice(device, command === 'on', 'manually');
      render();
      return;
    }
    if (command === 'start') {
      if (state.mode !== 'manual') return;
      const accepted = window.confirm(`Start a ${state.duration}-second simulated watering cycle for ${farm().label}? No physical pump is connected.`);
      if (accepted) startPump('manual command');
    } else if (command === 'stop' && state.on) {
      if (state.mode === 'auto') {
        state.mode = 'manual';
        addActivity('pump', 'Automatic mode was cancelled by the stop command.', 'stop', 'manual');
      }
      stopPump('manual stop', { completed: false });
    }
  }));

  $('lightThreshold').addEventListener('input', () => {
    zoneControls().light.threshold = Number($('lightThreshold').value);
    saveControls(); evaluateAutomation();
  });
  $('fanTemperatureThreshold').addEventListener('input', () => {
    zoneControls().fan.temperatureThreshold = Number($('fanTemperatureThreshold').value);
    saveControls(); evaluateAutomation();
  });
  $('fanHumidityThreshold').addEventListener('input', () => {
    zoneControls().fan.humidityThreshold = Number($('fanHumidityThreshold').value);
    saveControls(); evaluateAutomation();
  });
  $('pumpMoistureThreshold').addEventListener('input', () => {
    const value = Number($('pumpMoistureThreshold').value);
    zoneControls().pump.moistureThreshold = value;
    farm().threshold = value;
    saveControls(); saveFarmState(); evaluateAutomation();
  });
  $('pumpDuration').addEventListener('change', () => {
    zoneControls().pump.duration = Number($('pumpDuration').value);
    saveControls(); render();
  });
  $('pumpCooldown').addEventListener('change', () => {
    zoneControls().pump.cooldownMinutes = Number($('pumpCooldown').value);
    saveControls(); render();
  });

  $('controlZoneSelect').addEventListener('change', () => {
    selectedZone = $('controlZoneSelect').value;
    saveFarmState();
    lastEvaluatedAt = Date.now();
    evaluateAutomation(false);
    showToast(`Viewing controls for ${farm().label}.`);
  });

  $('applyAutoAll').addEventListener('click', () => {
    const state = zoneControls();
    const pumpMayStart = Number(farm().soilMoisture) < state.pump.moistureThreshold && remainingCooldown(state.pump) === 0;
    const accepted = !pumpMayStart || window.confirm('Auto mode may immediately start the simulated water pump because soil moisture is below its target. Apply Auto to all devices?');
    if (!accepted) return;
    ['light', 'fan', 'pump'].forEach(device => { state[device].mode = 'auto'; });
    saveControls();
    addActivity('system', 'All three devices changed to automatic mode.', 'warning', 'auto');
    evaluateAutomation();
    showToast('Automatic rules are active for all simulated devices.');
  });

  $('allOffButton').addEventListener('click', () => {
    const state = zoneControls();
    state.light.mode = 'manual'; state.light.on = false;
    state.fan.mode = 'manual'; state.fan.on = false;
    if (state.pump.on) stopPump('all-off safety action', { completed: false, logChange: false });
    state.pump.mode = 'manual'; state.pump.on = false; state.pump.runStartedAt = null; state.pump.runEndsAt = null; state.pump.runningSource = null;
    saveControls();
    addActivity('system', 'All simulated devices were set to manual mode and turned off.', 'stop', 'manual');
    render(); showToast('All simulated devices are off.');
  });

  $('clearActivity').addEventListener('click', () => {
    activity = []; saveActivity(); renderActivity(); showToast('Control activity cleared.');
  });

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.bsTheme = theme;
    $('controlThemeToggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  }
  applyTheme(safeGet('agrosense-theme') === 'dark' ? 'dark' : 'light');
  $('controlThemeToggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme); safeSet('agrosense-theme', theme);
  });

  window.addEventListener('storage', event => {
    if (event.key === FARM_STORAGE_KEY) {
      farmState = readFarmState();
      if (zoneSeeds[farmState.selectedZone]) selectedZone = farmState.selectedZone;
      evaluateAutomation();
    }
    if (event.key === ZONE_STORAGE_KEY && zoneSeeds[event.newValue]) {
      selectedZone = event.newValue; farmState.selectedZone = selectedZone; evaluateAutomation(false);
    }
    if (event.key === CONTROL_STORAGE_KEY) {
      controls = readControlState(farmState); render();
    }
  });

  if (!activity.length) addActivity('system', 'Device control workspace initialized in safe simulation mode.', 'normal', 'system');

  Object.keys(controls.zones).forEach(key => {
    const pump = controls.zones[key].pump;
    if (pump.on && (!pump.runEndsAt || pump.runEndsAt <= Date.now())) {
      pump.on = false; pump.runStartedAt = null; pump.runEndsAt = null; pump.runningSource = null;
    }
  });
  saveControls(); saveFarmState(); evaluateAutomation(false);

  setInterval(() => {
    const pump = zoneControls().pump;
    if (pump.on && pump.runEndsAt && Date.now() >= pump.runEndsAt) stopPump('cycle complete', { completed: true });
    else render();
  }, 1000);
  setInterval(() => evaluateAutomation(), 5000);
})();
