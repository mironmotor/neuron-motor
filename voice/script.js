// ===== Voice Decomposer — 50 музыкальных тонов + регистр + обертоны =====
let audioContext, stream, animationFrame, isRunning = false;
let voiceAn, rawAn, voicePitch, rawPitch, toneVoice, toneRaw;
let freqData, toneData, pitchBuf, binHz, toneBinHz, SR;
let mode = 'voice';
let history = [];
let f0smooth = 0;

const FMIN_VOICE = 70, FMAX_VOICE = 1000;
const VOICE_BAND = [80, 1100];

// --- 50 музыкальных тонов: от C2 вверх по полутонам ---
const TONE_COUNT = 50;
const TONE_BASE = 65.4064; // C2, Гц
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const toneFreqs = [], toneLabels = [];
for (let i = 0; i < TONE_COUNT; i++) {
  const f = TONE_BASE * Math.pow(2, i / 12);
  toneFreqs.push(f);
  const midi = Math.round(12 * Math.log2(f / 440) + 69);
  toneLabels.push(NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1));
}
const toneVals = new Float32Array(TONE_COUNT); // сглаженные уровни 0..1

const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const spectrumCanvas = document.getElementById('spectrum');
const spectrogramCanvas = document.getElementById('spectrogram');
const tonesCanvas = document.getElementById('tones');
const specCtx = spectrumCanvas.getContext('2d');
const spectroCtx = spectrogramCanvas.getContext('2d');
const tonesCtx = tonesCanvas.getContext('2d');
const el = id => document.getElementById(id);
const ui = { state: el('stateVal'), f0: el('f0val'), note: el('noteVal'), cents: el('centsVal'), clar: el('clarVal'), regMark: el('regMark'), regTxt: el('regTxt'), loFill: el('loFill'), loTxt: el('loTxt'), hiFill: el('hiFill'), hiTxt: el('hiTxt'), brFill: el('brFill'), brTxt: el('brTxt'), bars: el('bars') };

const barEls = [];
for (let i = 0; i < 12; i++) { const b = document.createElement('div'); b.className = 'b'; const i2 = document.createElement('i'); i2.textContent = (i + 1) + '×'; b.appendChild(i2); ui.bars.appendChild(b); barEls.push(b); }

document.querySelectorAll('.mode-btn').forEach(b => { b.addEventListener('click', () => { mode = b.dataset.mode; document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('active', x === b)); document.body.classList.toggle('space', mode === 'space'); }); });
btn.addEventListener('click', toggleMic);

function savePNG(canvas, name) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const a = document.createElement('a');
  a.download = `${name}-${ts}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}
el('saveTones').addEventListener('click', () => savePNG(tonesCanvas, 'tones'));
el('saveSpectrum').addEventListener('click', () => savePNG(spectrumCanvas, 'spectrum'));
el('saveSpectro').addEventListener('click', () => savePNG(spectrogramCanvas, 'spectrogram'));

async function toggleMic() {
  if (isRunning) { stopMic(); return; }
  statusEl.textContent = 'Запрашиваем доступ к микрофону...';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    SR = audioContext.sampleRate; binHz = SR / 4096; toneBinHz = SR / 16384;
    const source = audioContext.createMediaStreamSource(stream);
    // полосовой фильтр вокального диапазона (для режима «Голос»)
    const hp = audioContext.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 78; hp.Q.value = 0.7;
    const lp = audioContext.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000;
    source.connect(hp); hp.connect(lp);

    voiceAn = audioContext.createAnalyser(); voiceAn.fftSize = 4096; voiceAn.smoothingTimeConstant = 0.72;
    voicePitch = audioContext.createAnalyser(); voicePitch.fftSize = 2048;
    toneVoice = audioContext.createAnalyser(); toneVoice.fftSize = 16384; toneVoice.smoothingTimeConstant = 0.6;
    lp.connect(voiceAn); lp.connect(voicePitch); lp.connect(toneVoice);

    rawAn = audioContext.createAnalyser(); rawAn.fftSize = 4096; rawAn.smoothingTimeConstant = 0.72;
    rawPitch = audioContext.createAnalyser(); rawPitch.fftSize = 2048;
    toneRaw = audioContext.createAnalyser(); toneRaw.fftSize = 16384; toneRaw.smoothingTimeConstant = 0.6;
    source.connect(rawAn); source.connect(rawPitch); source.connect(toneRaw);

    pitchBuf = new Float32Array(2048);
    toneData = new Uint8Array(8192);
    isRunning = true; btn.textContent = '⏹ Остановить'; btn.classList.add('active'); statusEl.textContent = '✅ Работает! Говори в микрофон';
    animate();
  } catch (err) { console.error(err); statusEl.innerHTML = `<span style="color:#ff6666">Ошибка: ${err.message || 'Доступ запрещён'}</span>`; }
}

function stopMic() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (audioContext) audioContext.close();
  isRunning = false; btn.textContent = '▶ Запустить микрофон'; btn.classList.remove('active'); statusEl.textContent = 'Остановлено';
}

// Автокорреляционный детектор основного тона (70–1000 Гц)
function detectPitch(buf) {
  const N = buf.length; let rms = 0;
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.008) return { f: -1, rms, clarity: 0 };
  const minLag = Math.max(2, Math.floor(SR / 1000));
  const maxLag = Math.min(N - 2, Math.floor(SR / 70));
  let c0 = 0; for (let i = 0; i < N; i++) c0 += buf[i] * buf[i];
  const corr = new Float32Array(maxLag + 1); let best = -1, bestC = 0;
  for (let lag = minLag; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i < N - lag; i++) s += buf[i] * buf[i + lag]; const c = s / c0; corr[lag] = c; if (c > bestC) { bestC = c; best = lag; } }
  if (best < 0 || bestC < 0.45) return { f: -1, rms, clarity: bestC };
  let lag = best; const a = corr[best - 1], b = corr[best], cc = corr[best + 1], d = (a + cc - 2 * b);
  if (d !== 0) lag = best - 0.5 * (cc - a) / d;
  return { f: SR / lag, rms, clarity: bestC };
}

function noteOf(f) { const n = 12 * Math.log2(f / 440) + 69; const r = Math.round(n); return { name: NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1), cents: Math.round((n - r) * 100) }; }
const logT = (v, a, b) => (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a));

// «Акустическое состояние» — короткий человекочитаемый вердикт
function acousticState(F0, voiced, rms, bright, reg) {
  if (rms < 0.008) return '🔇 Тишина';
  if (!voiced) return mode === 'voice' ? '🌫 Шум / не голос' : '🌐 Окружающий звук';
  const regWord = reg < 0.33 ? 'низкий' : reg < 0.66 ? 'средний' : 'высокий';
  const brWord = bright < 33 ? 'тёплый' : bright < 66 ? 'сбалансированный' : 'яркий';
  return `🎙 ${regWord}, ${brWord} голос`;
}

// Энергия по каждому из 50 музыкальных тонов (±полутона вокруг ноты)
function computeTones() {
  const src = mode === 'voice' ? toneVoice : toneRaw;
  src.getByteFrequencyData(toneData);
  for (let i = 0; i < TONE_COUNT; i++) {
    const f = toneFreqs[i];
    const flo = f * Math.pow(2, -0.5 / 12), fhi = f * Math.pow(2, 0.5 / 12);
    let lo = Math.floor(flo / toneBinHz), hi = Math.ceil(fhi / toneBinHz);
    if (hi >= toneData.length) hi = toneData.length - 1;
    if (lo < 1) lo = 1;
    let peak = 0;
    for (let b = lo; b <= hi; b++) if (toneData[b] > peak) peak = toneData[b];
    const lvl = peak / 255;
    // сглаживание: быстрый подъём, мягкое затухание
    toneVals[i] = lvl > toneVals[i] ? lvl : toneVals[i] * 0.82 + lvl * 0.18;
  }
}

function animate() {
  if (!isRunning) return;
  const A = mode === 'voice' ? voiceAn : rawAn;
  const P = mode === 'voice' ? voicePitch : rawPitch;
  const bufferLength = A.frequencyBinCount;
  if (!freqData || freqData.length !== bufferLength) freqData = new Uint8Array(bufferLength);
  A.getByteFrequencyData(freqData);
  P.getFloatTimeDomainData(pitchBuf);

  const pitch = detectPitch(pitchBuf);
  const voiced = pitch.f >= 65 && pitch.f <= 1200;
  if (voiced) f0smooth = f0smooth ? f0smooth * 0.7 + pitch.f * 0.3 : pitch.f;
  const F0 = voiced ? f0smooth : 0;

  let loE = 0, hiE = 0, cNum = 0, cDen = 0;
  for (let i = 1; i < bufferLength; i++) { const f = i * binHz, v = freqData[i]; cNum += f * v; cDen += v; if (f >= 80 && f <= 400) loE += v; if (f >= 2000 && f <= 8000) hiE += v; }
  const centroid = cDen > 0 ? cNum / cDen : FMIN_VOICE;
  const bright = Math.round(Math.max(0, Math.min(1, logT(Math.max(centroid, 100), 200, 5000))) * 100);
  const loP = Math.min(100, Math.round(loE / 220));
  const hiP = Math.min(100, Math.round(hiE / 150));
  const reg = F0 ? Math.max(0, Math.min(1, logT(F0, FMIN_VOICE, FMAX_VOICE))) : 0;

  computeTones();
  updatePanel(F0, pitch, loP, hiP, bright, reg, voiced);
  drawTones(F0);
  drawSpectrum(bufferLength, F0);
  drawSpectrogram(bufferLength);
  animationFrame = requestAnimationFrame(animate);
}

function updatePanel(F0, pitch, loP, hiP, bright, reg, voiced) {
  ui.state.textContent = acousticState(F0, voiced, pitch.rms, bright, reg);
  if (F0) {
    ui.f0.textContent = Math.round(F0);
    const nt = noteOf(F0); ui.note.textContent = nt.name;
    ui.cents.textContent = (nt.cents >= 0 ? '+' : '') + nt.cents + ' c';
    ui.clar.textContent = Math.round(pitch.clarity * 100) + '%';
    ui.regMark.style.left = (reg * 100) + '%';
    ui.regTxt.textContent = reg < 0.33 ? 'низкий' : reg < 0.66 ? 'средний' : 'высокий';
  } else {
    ui.f0.textContent = '—'; ui.note.textContent = '—'; ui.cents.textContent = ''; ui.clar.textContent = '—';
    ui.regTxt.textContent = mode === 'voice' ? (pitch.rms > 0.008 ? 'не голос' : 'тишина') : 'окружение';
  }
  ui.loFill.style.width = loP + '%'; ui.loTxt.textContent = loP + '%';
  ui.hiFill.style.width = hiP + '%'; ui.hiTxt.textContent = hiP + '%';
  ui.brFill.style.width = bright + '%'; ui.brTxt.textContent = bright + '%';
  for (let h = 0; h < 12; h++) {
    let amp = 0;
    if (F0) { const bin = Math.round(F0 * (h + 1) / binHz); if (bin > 0 && bin < freqData.length) amp = freqData[bin] / 255; barEls[h].classList.add('on'); }
    else barEls[h].classList.remove('on');
    barEls[h].style.height = (3 + amp * 74) + 'px';
  }
}

// Разложение на 50 музыкальных тонов — главная визуализация «как в рилсе»
function drawTones(F0) {
  const W = tonesCanvas.width, H = tonesCanvas.height, pad = 22;
  tonesCtx.fillStyle = '#000'; tonesCtx.fillRect(0, 0, W, H);
  const slot = W / TONE_COUNT, bw = slot * 0.66, gap = (slot - bw) / 2;
  // индексы тонов, ближайших к F0 и его обертонам (подсветка «человека»)
  const harmIdx = new Set();
  if (F0) for (let k = 1; k <= 12; k++) { const idx = Math.round(12 * Math.log2((F0 * k) / TONE_BASE)); if (idx >= 0 && idx < TONE_COUNT) harmIdx.add(idx); }
  const baseHue = mode === 'voice' ? 140 : 190;
  for (let i = 0; i < TONE_COUNT; i++) {
    const v = toneVals[i];
    const x = i * slot + gap;
    const bh = Math.max(2, v * (H - pad - 6));
    const y = H - pad - bh;
    const hue = baseHue - i / TONE_COUNT * 90; // низ → верх по цвету
    const isHarm = harmIdx.has(i);
    const grad = tonesCtx.createLinearGradient(0, y, 0, H - pad);
    grad.addColorStop(0, `hsl(${hue}, 100%, ${55 + v * 25}%)`);
    grad.addColorStop(1, `hsl(${hue}, 90%, 30%)`);
    tonesCtx.fillStyle = v > 0.04 ? grad : '#16201b';
    tonesCtx.shadowBlur = isHarm ? 16 : (v > 0.3 ? 10 : 0);
    tonesCtx.shadowColor = `hsl(${hue}, 100%, 60%)`;
    roundRect(tonesCtx, x, y, bw, bh, 3);
    tonesCtx.fill();
    tonesCtx.shadowBlur = 0;
    if (isHarm) { // обводка для основного тона/обертонов
      tonesCtx.strokeStyle = 'rgba(255,255,255,0.85)'; tonesCtx.lineWidth = 1.2;
      tonesCtx.beginPath(); tonesCtx.moveTo(x, y); tonesCtx.lineTo(x + bw, y); tonesCtx.stroke();
    }
    // подписи нот «C» на каждой октаве
    if (toneLabels[i].startsWith('C') && !toneLabels[i].includes('#')) {
      tonesCtx.fillStyle = '#6f7d76'; tonesCtx.font = '10px Arial'; tonesCtx.textAlign = 'center';
      tonesCtx.fillText(toneLabels[i], x + bw / 2, H - 7);
    }
  }
}
function roundRect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function drawSpectrum(bufferLength, F0) {
  const W = spectrumCanvas.width, H = spectrumCanvas.height;
  specCtx.fillStyle = '#000'; specCtx.fillRect(0, 0, W, H);
  const barWidth = W / (bufferLength / 2.5);
  if (mode === 'voice') {
    const x1 = (VOICE_BAND[0] / binHz) * barWidth, x2 = (VOICE_BAND[1] / binHz) * barWidth;
    specCtx.fillStyle = 'rgba(0,255,136,0.07)'; specCtx.fillRect(x1, 0, x2 - x1, H);
  }
  for (let i = 0; i < bufferLength; i += 2) {
    const height = (freqData[i] / 255) * H * 0.92;
    const hue = mode === 'voice' ? (120 + i / bufferLength * 60) : (180 + i / bufferLength * 60);
    specCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    specCtx.fillRect(i * barWidth, H - height, barWidth * 0.85, height);
  }
  if (F0) {
    specCtx.strokeStyle = 'rgba(255,235,120,0.85)'; specCtx.lineWidth = 1;
    for (let k = 1; k <= 12; k++) { const x = (F0 * k / binHz) * barWidth; if (x > W) break; specCtx.beginPath(); specCtx.moveTo(x, 0); specCtx.lineTo(x, 12); specCtx.stroke(); }
  }
}

function drawSpectrogram(bufferLength) {
  history.push(freqData.slice(0));
  if (history.length > 140) history.shift();
  const W = spectrogramCanvas.width, H = spectrogramCanvas.height;
  spectroCtx.fillStyle = '#000'; spectroCtx.fillRect(0, 0, W, H);
  const baseHue = mode === 'voice' ? 120 : 180;
  for (let y = 0; y < history.length; y++) {
    const row = history[y];
    for (let x = 0; x < 320; x++) { const intensity = row[x] / 280; spectroCtx.fillStyle = `hsl(${baseHue + intensity * 60}, 100%, 50%)`; spectroCtx.fillRect(x * 3.12, y * 2.15, 3.1, 2.15); }
  }
}
