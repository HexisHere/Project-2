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
// Map coordinates follow the approved yellow route on the watercolor illustration.
const trailPins = [[558, 677], [319, 402], [366, 242], [540, 314], [380, 487]];
const trailPaths = [
  'M558 677 L380 487 319 402',
  'M319 402 L366 242',
  'M366 242 L469 229 540 314',
  'M540 314 L380 487'
];
let progress = 0;
const bonusStop = 2; // Stop 3, the P tree.
let bonus = 'locked';
const bonusClue = 'Remember the tree with a connection to the letter P? Go back there to find the Bonus Reunion.';
let watch = null;
let lastFix = null;
let cameraStream = null;
let cameraPending = false;
let cameraHeading = null;
let compassListening = false;
const status = (message) => {
  $('status').textContent = message;
  $('camera-status').textContent = message;
};

function distance(lat, lon, target) {
  const r = Math.PI / 180;
  const a = Math.sin((target.lat - lat) * r / 2) ** 2 +
    Math.cos(lat * r) * Math.cos(target.lat * r) * Math.sin((target.lon - lon) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function bearing(lat, lon, target) {
  const r = Math.PI / 180;
  const delta = (target.lon - lon) * r;
  const y = Math.sin(delta) * Math.cos(target.lat * r);
  const x = Math.cos(lat * r) * Math.sin(target.lat * r) - Math.sin(lat * r) * Math.cos(target.lat * r) * Math.cos(delta);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function direction(degrees) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
}

function onOrientation(event) {
  if (!cameraStream) return;
  if (Number.isFinite(event.webkitCompassHeading) && !(event.webkitCompassAccuracy < 0)) {
    cameraHeading = event.webkitCompassHeading;
  } else if (event.absolute && [event.alpha, event.beta, event.gamma].every(Number.isFinite)) {
    const r = Math.PI / 180;
    const [a, b, g] = [event.alpha, event.beta, event.gamma].map(value => value * r);
    const east = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
    const north = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
    // Project the rear camera's viewing direction onto the horizontal plane.
    cameraHeading = Math.hypot(east, north) < .2 ? null : Math.atan2(east, north) / r;
  } else {
    return;
  }
  renderGuide();
}

async function enableCompass() {
  if (demo || scout || compassListening) return;
  const sensor = window.DeviceOrientationEvent;
  try {
    if (typeof sensor?.requestPermission === 'function' && await sensor.requestPermission(true) !== 'granted') return;
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    compassListening = true;
  } catch {
    // Cardinal directions remain available if the browser denies sensor access.
  }
}

function renderGuide() {
  const index = bonus === 'return' ? bonusStop : progress;
  const target = targets[index];
  const guide = $('camera-guide');
  const arrow = $('guide-arrow');
  guide.hidden = !cameraStream || scout || !target;
  if (guide.hidden) return;
  arrow.setAttribute('hidden', '');
  const name = bonus === 'return' ? 'P tree' : 'Stop ' + (index + 1);
  let text = name + ' · Waiting for GPS';
  if (demo) {
    const [x, y] = trailPins[index];
    const [fromX, fromY] = trailPins[progress - 1] || [x, y + 1];
    arrow.style.transform = 'rotate(' + Math.atan2(x - fromX, fromY - y) * 180 / Math.PI + 'deg)';
    arrow.removeAttribute('hidden');
    text = name + ' · Demo';
  } else if (!Number.isFinite(target.lat) || !Number.isFinite(target.lon)) {
    text = name + ' · GPS point pending';
  } else if (lastFix && Date.now() - lastFix.timestamp <= 15000 && lastFix.coords.accuracy <= target.radius) {
    const { latitude, longitude } = lastFix.coords;
    const degrees = bearing(latitude, longitude, target);
    const meters = Math.round(distance(latitude, longitude, target));
    text = name + ' · ' + meters + ' m';
    if (cameraHeading === null) {
      text += ' ' + direction(degrees);
    } else {
      arrow.style.transform = 'rotate(' + (degrees - cameraHeading) + 'deg)';
      arrow.removeAttribute('hidden');
    }
  }
  if ($('guide-label').textContent !== text) $('guide-label').textContent = text;
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

function svgElement(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function renderTrail() {
  const completed = scout ? trailPaths : trailPaths.slice(0, Math.max(0, progress - 1));
  $('trail-segments').replaceChildren(...completed.flatMap(d => [
    svgElement('path', { d, class: 'trail-edge' }),
    svgElement('path', { d, class: 'trail-line' })
  ]));

  const visiblePins = scout ? trailPins : trailPins.slice(0, progress + 1);
  $('trail-stops').replaceChildren(...visiblePins.map(([x, y], index) => {
    const next = !scout && index === progress;
    const pin = svgElement('g', { class: next ? 'trail-pin next' : 'trail-pin', transform: 'translate(' + x + ' ' + y + ')' });
    const label = svgElement('text', {});
    label.textContent = index + 1;
    pin.append(svgElement('circle', { r: 17 }), label);
    return pin;
  }));

  const next = stops[progress];
  $('trail-status').textContent = scout ? 'Scout view · all five candidate stops'
    : next ? (progress === 0 ? 'Start at 1 · ' : 'Next: ' + (progress + 1) + ' · ') + next.name
      : 'Trail complete · all five stops found';
}

function renderProgress() {
  document.documentElement.style.setProperty('--saturation', progress / stops.length);
  document.documentElement.style.setProperty('--accent', stops[progress - 1]?.color || '#626063');
  $('go').classList.toggle('restored', progress > 0);
  $('count').textContent = progress + ' / ' + stops.length + ' colors';
  $('camera-count').textContent = progress + ' / ' + stops.length;
  $('camera-find').hidden = progress === 0;
  $('view').hidden = progress === 0;
  renderBonus();
  document.documentElement.classList.toggle('has-color', progress > 0);
  renderTrail();
  renderGuide();
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

function renderBonus() {
  const label = bonus === 'collected' ? 'View Bonus Reunion'
    : bonus === 'return' ? 'Read the P tree clue' : 'Congratulations! Bonus Reunion unlocked';
  for (const id of ['finale', 'camera-bonus']) {
    $(id).hidden = bonus === 'locked';
    $(id).textContent = label;
  }
}

function onPosition({ coords, timestamp }) {
  lastFix = { coords, timestamp };
  const { latitude, longitude, accuracy } = coords;
  if (scout) {
    $('mark').disabled = accuracy > 25;
    status(latitude.toFixed(6) + ', ' + longitude.toFixed(6) + ' · ±' + Math.round(accuracy) + ' m');
    return;
  }
  const returning = bonus === 'return';
  const next = targets[returning ? bonusStop : progress];
  renderGuide();
  if (!next) return;
  if (returning) {
    if (Date.now() - timestamp <= 15000 && accuracy <= next.radius &&
        distance(latitude, longitude, next) <= next.radius) {
      bonus = 'collected';
      renderBonus();
      renderGuide();
      stopWatch();
      status('You found the P tree! Bonus Reunion is ready.');
      showModel(window.FINALE, window.FINALE.name);
    }
    return;
  }
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
      : label + ' · ' + Math.round(d) + ' m away · head ' + direction(bearing(latitude, longitude, next)));
    return;
  }

  progress += 1;
  renderProgress();
  const following = stops[progress];
  status(next.colorName + ' restored! ' + (following
    ? 'Next: stop ' + (progress + 1) + ' · ' + following.name + '.'
    : 'All five colors are back!'));
  if (!demo) navigator.vibrate?.(110);
  showFind(progress - 1);
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

function setCameraPanel(open) {
  document.body.classList.toggle('camera-panel-open', open);
  $('camera-panel-toggle').setAttribute('aria-expanded', String(open));
  $('camera-panel-toggle').textContent = open ? 'Hide panel' : 'Map & game';
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraHeading = null;
  renderGuide();
  $('camera').srcObject = null;
  $('camera').hidden = true;
  document.body.classList.remove('camera-on');
  $('camera-hud').hidden = true;
  setCameraPanel(false);
  $('cameraToggle').textContent = 'Turn on camera';
}

$('cameraToggle').onclick = () => cameraStream ? stopCamera() : startCamera();
$('camera-close').onclick = stopCamera;
$('camera-panel-toggle').onclick = () => {
  setCameraPanel($('camera-panel-toggle').getAttribute('aria-expanded') !== 'true');
};
$('camera-find').onclick = () => showFind(progress - 1);

async function startCamera() {
  if (cameraPending) return;
  if (!navigator.mediaDevices?.getUserMedia) return status('The camera needs a secure page (HTTPS).');
  cameraPending = true;
  void enableCompass();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    $('camera').srcObject = cameraStream;
    $('camera').hidden = false;
    document.body.classList.add('camera-on');
    setCameraPanel(false);
    $('camera-hud').hidden = false;
    renderGuide();
    $('cameraToggle').textContent = 'Turn off camera';
  } catch {
    status('Camera unavailable. You can continue with the map.');
  } finally {
    cameraPending = false;
  }
}

$('view').onclick = () => showFind(progress - 1);
$('finale').onclick = $('camera-bonus').onclick = () => {
  if (bonus === 'locked') return;
  if (bonus === 'collected') return showModel(window.FINALE, window.FINALE.name);
  bonus = 'return';
  renderBonus();
  renderGuide();
  status(bonusClue);
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
    viewer.addEventListener('load', () => {
      if (viewer.parentNode !== $('preview')) return;
      $('modelStatus').textContent = '';
      if (stop === stops[stops.length - 1] && bonus === 'locked') {
        bonus = 'clue';
        renderBonus();
      }
    });
    viewer.addEventListener('error', () => { $('modelStatus').textContent = 'Could not load this model. Check the model path and connection.'; });
    $('preview').append(viewer);
    setTimeout(() => {
      if (viewer.isConnected && !customElements.get('model-viewer')) {
        $('modelStatus').textContent = 'The 3D viewer could not start. Check your internet connection.';
      }
    }, 8000);
  }
  if (!$('reward').open) $('reward').showModal();
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
    bonus = 'locked';
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
function playOpening() {
  const opening = $('story-opening');
  opening.showModal();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const lines = Array.from(opening.querySelectorAll('.story-line'), paragraph => {
    const source = document.createElement('span');
    source.className = 'story-source';
    source.textContent = paragraph.textContent;
    const overlay = document.createElement('span');
    overlay.setAttribute('aria-hidden', 'true');
    const typed = document.createElement('span');
    const tail = document.createElement('span');
    tail.className = 'story-tail';
    tail.textContent = source.textContent;
    overlay.append(typed, tail);
    paragraph.replaceChildren(source, overlay);
    return { paragraph, typed, tail, text: source.textContent };
  });

  let row = 0;
  let index = 0;
  let timer;
  function typeNext() {
    if (!opening.open || row === lines.length) return;
    const { paragraph, typed, tail, text } = lines[row];
    index += 1;
    typed.classList.add('story-typing');
    typed.textContent = text.slice(0, index);
    tail.textContent = text.slice(index);
    if (index === text.length) {
      paragraph.textContent = text;
      index = 0;
      row += 1;
      timer = setTimeout(typeNext, 360);
    } else {
      timer = setTimeout(typeNext, 23);
    }
  }
  opening.addEventListener('close', () => clearTimeout(timer), { once: true });
  timer = setTimeout(typeNext, 250);
}

renderProgress();
if (!scout) playOpening();

