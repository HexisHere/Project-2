'use strict';

const $ = (id) => document.getElementById(id);
const scoutKey = 'oval-color-quest-scout-v1';
let savedPoints = {};
try { savedPoints = JSON.parse(localStorage.getItem(scoutKey)) || {}; } catch {}
const stops = window.STOPS.map((stop, i) => {
  const point = savedPoints[i];
  return stop.lat === null && stop.lon === null && point
    ? { ...stop, lat: point.lat, lon: point.lon } : stop;
});
const params = new URLSearchParams(location.search);
const scout = params.has('scout');
const demo = !scout && (params.has('demo') || params.has('fake'));
const demoStops = stops.map((stop, i) => ({ ...stop, lat: 40 + i * .0006, lon: -83 }));
const targets = demo ? demoStops : stops;
let progress = 0;
let watch = null;
let lastFix = null;
let cameraStream = null;
let cameraPending = false;
const status = (message) => { $('status').textContent = message; };

function distance(lat, lon, target) {
  const r = Math.PI / 180;
  const a = Math.sin((target.lat - lat) * r / 2) ** 2 +
    Math.cos(lat * r) * Math.cos(target.lat * r) * Math.sin((target.lon - lon) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function direction(lat, lon, target) {
  const r = Math.PI / 180;
  const delta = (target.lon - lon) * r;
  const y = Math.sin(delta) * Math.cos(target.lat * r);
  const x = Math.cos(lat * r) * Math.sin(target.lat * r) - Math.sin(lat * r) * Math.cos(target.lat * r) * Math.cos(delta);
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((Math.atan2(y, x) / r + 360) / 45) % 8];
}

function routeProblem() {
  for (const [i, point] of stops.entries()) {
    if (!Number.isFinite(point.lat) || Math.abs(point.lat) > 90 ||
        !Number.isFinite(point.lon) || Math.abs(point.lon) > 180) {
      return 'Record GPS coordinates for stop ' + (i + 1) + ' in Scout mode before starting the field game.';
    }
    if (!(point.radius >= 15 && point.radius <= 25)) return 'Use a radius of 15 to 25 m for stop ' + (i + 1) + '.';
    for (let j = 0; j < i; j++) {
      const other = stops[j];
      if (distance(point.lat, point.lon, other) < point.radius + other.radius) {
        return 'Unlock zones overlap at stops ' + (j + 1) + ' and ' + (i + 1) + '. Scout more widely separated points or adjust the radii.';
      }
    }
  }
  return '';
}

function renderProgress() {
  document.documentElement.style.setProperty('--saturation', progress / stops.length);
  document.documentElement.style.setProperty('--accent', stops[progress - 1]?.color || '#626063');
  $('go').classList.toggle('restored', progress > 0);
  $('count').textContent = progress + ' / ' + stops.length + ' colors';
  $('view').hidden = progress === 0;
  $('finale').hidden = progress !== stops.length;
  document.documentElement.classList.toggle('has-color', progress > 0);
  $('colors').replaceChildren(...stops.map((stop, i) => {
    const chip = document.createElement('li');
    chip.textContent = (i + 1) + ' · ' + stop.name + (i < progress ? ' ✓' : '');
    if (i < progress) {
      chip.style.background = stop.color;
      const find = document.createElement('button');
      find.textContent = chip.textContent;
      find.onclick = () => showFind(i);
      chip.replaceChildren(find);
    }
    if (i === progress && !scout) chip.setAttribute('aria-current', 'step');
    return chip;
  }));
}

function onPosition({ coords, timestamp }) {
  const { latitude, longitude, accuracy } = coords;
  if (scout) {
    lastFix = { coords, timestamp };
    $('mark').disabled = accuracy > 25;
    status(latitude.toFixed(6) + ', ' + longitude.toFixed(6) + ' · ±' + Math.round(accuracy) + ' m');
    return;
  }
  const next = targets[progress];
  if (!next) return;
  const label = 'Stop ' + (progress + 1) + ' · ' + next.name;
  if (Date.now() - timestamp > 15000 || accuracy > next.radius) {
    status(label + ' · Waiting for a fresh GPS fix within ±' + next.radius + ' m.');
    return;
  }
  const d = distance(latitude, longitude, next);
  if (d > next.radius) {
    const wrong = targets.findIndex((target, i) => i > progress &&
      accuracy <= target.radius && distance(latitude, longitude, target) <= target.radius);
    status(wrong >= 0 ? 'Stop ' + (wrong + 1) + ' is locked. Visit ' + label + ' first.'
      : label + ' · ' + Math.round(d) + ' m away · head ' + direction(latitude, longitude, next));
    return;
  }

  progress += 1;
  renderProgress();
  const following = stops[progress];
  status(next.colorName + ' restored! ' + (following
    ? 'Next: stop ' + (progress + 1) + ' · ' + following.name + '.'
    : 'All five colors are back!'));
  if (!demo) navigator.vibrate?.(110);
  if (cameraStream && !$('reward').open) showFind(progress - 1);
  if (!following) stopWatch();
}

function stopWatch() {
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
}

$('go').onclick = () => {
  const problem = scout ? '' : routeProblem();
  if (problem) return status(problem);
  if (!navigator.geolocation) return status('GPS needs a supported browser and a secure page (HTTPS).');
  if (watch !== null) return;
  $('go').disabled = true;
  status('Waiting for GPS…');
  if (!scout && !cameraStream) void startCamera();
  watch = navigator.geolocation.watchPosition(onPosition, (error) => {
    status('GPS: ' + error.message);
    if (error.code === 1) {
      stopWatch();
      $('go').disabled = false;
    }
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
};

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  $('camera').srcObject = null;
  $('camera').hidden = true;
  document.body.classList.remove('camera-on');
  $('cameraToggle').textContent = 'Turn on camera';
}

$('cameraToggle').onclick = () => cameraStream ? stopCamera() : startCamera();

async function startCamera() {
  if (cameraPending) return;
  if (!navigator.mediaDevices?.getUserMedia) return status('The camera needs a secure page (HTTPS).');
  cameraPending = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    $('camera').srcObject = cameraStream;
    $('camera').hidden = false;
    document.body.classList.add('camera-on');
    $('cameraToggle').textContent = 'Turn off camera';
  } catch {
    status('Camera unavailable. You can continue with the map.');
  } finally {
    cameraPending = false;
  }
}

$('view').onclick = () => showFind(progress - 1);
$('finale').onclick = () => {
  if (progress === stops.length) showModel(window.FINALE, window.FINALE.name);
};

function showFind(index) {
  if (index < 0 || index >= progress) return;
  const stop = stops[index];
  showModel(stop, stop.colorName + ' restored');
}

function showModel(stop, title) {
  $('rewardTitle').textContent = title;
  $('preview').replaceChildren();
  $('modelStatus').textContent = stop.glb ? 'Loading your find…' : 'Color collected. The 3D model for this stop is pending.';
  if (stop.glb) {
    const viewer = document.createElement('model-viewer');
    viewer.setAttribute('src', stop.glb);
    if (stop.usdz) viewer.setAttribute('ios-src', stop.usdz);
    if (stop.animation) viewer.setAttribute('animation-name', stop.animation);
    viewer.setAttribute('alt', stop.modelAlt || stop.name);
    viewer.setAttribute('ar', '');
    viewer.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
    viewer.setAttribute('ar-placement', 'floor');
    viewer.setAttribute('camera-controls', '');
    viewer.setAttribute('autoplay', '');
    const ar = document.createElement('button');
    ar.slot = 'ar-button';
    ar.textContent = 'Place in AR';
    ar.addEventListener('click', stopCamera, { capture: true });
    viewer.append(ar);
    viewer.addEventListener('load', () => { $('modelStatus').textContent = ''; });
    viewer.addEventListener('error', () => { $('modelStatus').textContent = 'Could not load this model. Check the model path and connection.'; });
    $('preview').append(viewer);
    setTimeout(() => {
      if (viewer.isConnected && !customElements.get('model-viewer')) {
        $('modelStatus').textContent = 'The 3D viewer could not start. Check your internet connection.';
      }
    }, 8000);
  }
  $('reward').showModal();
}
$('reward').addEventListener('close', () => $('preview').replaceChildren());

if (scout) {
  $('scout').hidden = false;
  $('go').textContent = 'Start scouting';
  status('Select each numbered location and record it from the path.');
  const marks = savedPoints;
  function renderMarks() {
    $('marks').value = stops.map((stop, i) => {
      const point = marks[i];
      return (i + 1) + ' · ' + stop.name + (point
        ? ' | lat: ' + point.lat + ', lon: ' + point.lon + ' | ±' + point.acc + ' m' : ' | pending');
    }).join('\n');
  }
  stops.forEach((stop, i) => $('slot').add(new Option((i + 1) + ' · ' + stop.name, i)));
  $('mark').onclick = () => {
    if (!lastFix || Date.now() - lastFix.timestamp > 15000) return status('Wait for a fresh GPS fix.');
    const { latitude, longitude, accuracy } = lastFix.coords;
    if (accuracy > 25) return status('Wait for accuracy of ±25 m or better.');
    marks[$('slot').value] = { lat: +latitude.toFixed(6), lon: +longitude.toFixed(6), acc: Math.round(accuracy) };
    renderMarks();
    try { localStorage.setItem(scoutKey, JSON.stringify(marks)); }
    catch { status('Copy these coordinates now. Browser storage is unavailable.'); }
  };
  renderMarks();
} else if (demo) {
  $('go').hidden = true;
  $('demo').hidden = false;
  status('Demo · Start at stop 1.');
  demoStops.forEach((stop, i) => {
    const button = document.createElement('button');
    button.textContent = 'Stop ' + (i + 1);
    button.onclick = () => onPosition({
      timestamp: Date.now(),
      coords: { latitude: stop.lat, longitude: stop.lon, accuracy: 0 }
    });
    $('arrivals').append(button);
  });
  $('reset').onclick = () => {
    progress = 0;
    renderProgress();
    status('Demo · Start at stop 1.');
  };
} else {
  status(routeProblem() || 'Start with stop 1 · ' + stops[0].name + '.');
}

window.addEventListener('pagehide', () => {
  stopWatch();
  stopCamera();
});
renderProgress();

