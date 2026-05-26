let audioContext, analyser, stream, animationFrame;
let isRunning = false;
let spectrumHistory = [];
let soloHistory = [];
let selectedTone = 24;
let displayMode = 'all';

const TONE_COUNT = 50;
const MIN_FREQ = 80;
const MAX_FREQ = 4200;
const MAX_HISTORY = 144;
const toneBands = createToneBands();

const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const spectrumCanvas = document.getElementById('spectrum');
const spectrogramCanvas = document.getElementById('spectrogram');
const specCtx = spectrumCanvas.getContext('2d');
const spectroCtx = spectrogramCanvas.getContext('2d');
const toneGrid = document.getElementById('toneGrid');
const toneSlider = document.getElementById('toneSlider');
const toneNumber = document.getElementById('toneNumber');
const toneNote = document.getElementById('toneNote');
const toneRange = document.getElementById('toneRange');
const toneLevel = document.getElementById('toneLevel');
const tonePercent = document.getElementById('tonePercent');
const spectrumLabel = document.getElementById('spectrumLabel');
const historyLabel = document.getElementById('historyLabel');
const modeTabs = [...document.querySelectorAll('.mode-tab')];

btn.addEventListener('click', toggleMic);
toneSlider.addEventListener('input', () => selectTone(Number(toneSlider.value) - 1));
modeTabs.forEach(tab => {
 tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

buildToneGrid();
updateToneUI();
drawIdle();

async function toggleMic() {
 if (isRunning) {
 stopMic();
 return;
 }

 setStatus('Запрашиваем доступ к микрофону...');

 try {
 stream = await navigator.mediaDevices.getUserMedia({
 audio: {
 echoCancellation: false,
 noiseSuppression: false,
 autoGainControl: false
 }
 });

 audioContext = new (window.AudioContext || window.webkitAudioContext)();
 const source = audioContext.createMediaStreamSource(stream);

 analyser = audioContext.createAnalyser();
 analyser.fftSize = 4096;
 analyser.smoothingTimeConstant = 0.72;

 source.connect(analyser);

 isRunning = true;
 btn.textContent = 'Остановить';
 btn.classList.add('active');
 setStatus('Работает. Выбирай тон и смотри его энергию.', 'ok');

 spectrumHistory = [];
 soloHistory = [];
 animate();
 } catch (err) {
 console.error(err);
 setStatus(`Ошибка: ${err.message || 'Доступ запрещен'}`, 'error');
 }
}

function stopMic() {
 if (stream) stream.getTracks().forEach(track => track.stop());
 if (audioContext) audioContext.close();
 if (animationFrame) cancelAnimationFrame(animationFrame);

 stream = null;
 audioContext = null;
 analyser = null;
 isRunning = false;
 btn.textContent = 'Запустить микрофон';
 btn.classList.remove('active');
 setStatus('Остановлено');
 drawIdle();
}

function animate() {
 if (!isRunning) return;

 const bufferLength = analyser.frequencyBinCount;
 const dataArray = new Uint8Array(bufferLength);
 analyser.getByteFrequencyData(dataArray);

 const levels = toneBands.map(band => getBandLevel(dataArray, band));
 const currentLevel = levels[selectedTone];
 const peak = Math.max(...levels, 0.01);
 const normalized = currentLevel / 255;

 spectrumHistory.push(levels);
 if (spectrumHistory.length > MAX_HISTORY) spectrumHistory.shift();

 soloHistory.push(currentLevel);
 if (soloHistory.length > MAX_HISTORY) soloHistory.shift();

 drawSpectrum(levels, peak);
 drawHistory(levels);
 updateLevel(normalized);

 animationFrame = requestAnimationFrame(animate);
}

function createToneBands() {
 const ratio = Math.pow(MAX_FREQ / MIN_FREQ, 1 / TONE_COUNT);

 return Array.from({ length: TONE_COUNT }, (_, index) => {
 const low = MIN_FREQ * Math.pow(ratio, index);
 const high = MIN_FREQ * Math.pow(ratio, index + 1);
 const center = Math.sqrt(low * high);

 return {
 index,
 low,
 high,
 center,
 note: getNearestNote(center)
 };
 });
}

function getBandLevel(dataArray, band) {
 const binWidth = audioContext.sampleRate / analyser.fftSize;
 const start = Math.max(1, Math.floor(band.low / binWidth));
 const end = Math.min(dataArray.length - 1, Math.ceil(band.high / binWidth));
 let sum = 0;
 let peak = 0;
 let count = 0;

 for (let i = start; i <= end; i++) {
 const value = dataArray[i];
 sum += value;
 peak = Math.max(peak, value);
 count++;
 }

 const average = count ? sum / count : 0;
 return average * 0.65 + peak * 0.35;
}

function drawSpectrum(levels, peak) {
 const { width, height } = spectrumCanvas;
 const padding = 30;
 const graphHeight = height - padding * 2;
 const barGap = 7;
 const barWidth = (width - padding * 2 - barGap * (TONE_COUNT - 1)) / TONE_COUNT;

 paintCanvasBackground(specCtx, width, height);
 drawGrid(specCtx, width, height, padding);

 if (displayMode === 'solo') {
 drawSoloSpectrum(levels[selectedTone], peak);
 return;
 }

 levels.forEach((level, index) => {
 const isSelected = index === selectedTone;
 const normalized = Math.min(1, level / Math.max(peak, 60));
 const x = padding + index * (barWidth + barGap);
 const barHeight = Math.max(3, normalized * graphHeight);
 const y = height - padding - barHeight;
 const band = toneBands[index];
 const hue = 142 + index * 3.2;

 specCtx.globalAlpha = displayMode === 'solo' && !isSelected ? 0.16 : 1;
 specCtx.fillStyle = isSelected
 ? createVerticalGradient(specCtx, y, height - padding, '#ff5c8a', '#ffd166')
 : createVerticalGradient(specCtx, y, height - padding, `hsl(${hue}, 92%, 58%)`, '#38d9ff');
 roundRect(specCtx, x, y, barWidth, barHeight, 5);
 specCtx.fill();

 if (isSelected) {
 specCtx.globalAlpha = 1;
 specCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
 specCtx.lineWidth = 2;
 roundRect(specCtx, x - 4, y - 6, barWidth + 8, barHeight + 10, 7);
 specCtx.stroke();
 drawToneCallout(specCtx, band, level, x, y, barWidth);
 }
 });

 specCtx.globalAlpha = 1;
}

function drawSoloSpectrum(level, peak) {
 const { width, height } = spectrumCanvas;
 const padding = 42;
 const graphHeight = height - padding * 2;
 const meterWidth = Math.min(210, width * 0.22);
 const x = width / 2 - meterWidth / 2;
 const normalized = Math.min(1, level / Math.max(peak, 80));
 const barHeight = Math.max(8, normalized * graphHeight);
 const y = height - padding - barHeight;
 const band = toneBands[selectedTone];

 specCtx.fillStyle = 'rgba(255, 255, 255, 0.04)';
 roundRect(specCtx, padding, padding, width - padding * 2, graphHeight, 8);
 specCtx.fill();

 specCtx.fillStyle = createVerticalGradient(specCtx, y, height - padding, '#ff5c8a', '#ffd166');
 roundRect(specCtx, x, y, meterWidth, barHeight, 8);
 specCtx.fill();

 specCtx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
 specCtx.lineWidth = 2;
 roundRect(specCtx, x - 7, y - 7, meterWidth + 14, barHeight + 14, 10);
 specCtx.stroke();

 specCtx.font = '800 30px Segoe UI, Arial, sans-serif';
 specCtx.fillStyle = '#f4f7fb';
 specCtx.textAlign = 'center';
 specCtx.fillText(band.note, width / 2, padding + 38);

 specCtx.font = '700 17px Segoe UI, Arial, sans-serif';
 specCtx.fillStyle = 'rgba(244, 247, 251, 0.72)';
 specCtx.fillText(`${Math.round(band.low)}-${Math.round(band.high)} Hz · ${Math.round(level / 255 * 100)}%`, width / 2, padding + 66);
 specCtx.textAlign = 'left';
}

function drawHistory(levels) {
 const { width, height } = spectrogramCanvas;
 paintCanvasBackground(spectroCtx, width, height);

 if (displayMode === 'solo') {
 drawSoloHistory(width, height);
 return;
 }

 const cellWidth = width / TONE_COUNT;
 const rowHeight = height / MAX_HISTORY;
 const startY = height - spectrumHistory.length * rowHeight;

 spectrumHistory.forEach((row, rowIndex) => {
 row.forEach((level, toneIndex) => {
 const intensity = Math.min(1, level / 230);
 const selectedBoost = toneIndex === selectedTone ? 0.26 : 0;
 spectroCtx.fillStyle = `hsla(${150 + toneIndex * 3}, 95%, ${18 + intensity * 58}%, ${0.28 + intensity * 0.72 + selectedBoost})`;
 spectroCtx.fillRect(toneIndex * cellWidth, startY + rowIndex * rowHeight, cellWidth + 0.5, rowHeight + 0.5);
 });
 });
}

function drawSoloHistory(width, height) {
 const padding = 34;
 const usableWidth = width - padding * 2;
 const usableHeight = height - padding * 2;

 drawGrid(spectroCtx, width, height, padding);

 if (soloHistory.length < 2) return;

 spectroCtx.lineWidth = 4;
 spectroCtx.strokeStyle = '#35f29a';
 spectroCtx.shadowColor = 'rgba(53, 242, 154, 0.6)';
 spectroCtx.shadowBlur = 12;
 spectroCtx.beginPath();

 soloHistory.forEach((level, index) => {
 const x = padding + index * (usableWidth / (MAX_HISTORY - 1));
 const y = height - padding - Math.min(1, level / 255) * usableHeight;
 if (index === 0) spectroCtx.moveTo(x, y);
 else spectroCtx.lineTo(x, y);
 });

 spectroCtx.stroke();
 spectroCtx.shadowBlur = 0;
}

function drawIdle() {
 const idleLevels = toneBands.map((_, index) => {
 const wave = Math.sin(index * 0.7) * 0.5 + 0.5;
 return 20 + wave * 34;
 });

 drawSpectrum(idleLevels, 100);
 spectrumHistory = Array.from({ length: 38 }, (_, y) => {
 return toneBands.map((_, x) => 12 + Math.max(0, Math.sin(x * 0.45 + y * 0.2)) * 38);
 });
 soloHistory = Array.from({ length: 38 }, (_, index) => 26 + Math.sin(index * 0.32) * 14);
 drawHistory(idleLevels);
 updateLevel(0);
}

function buildToneGrid() {
 toneBands.forEach((band, index) => {
 const chip = document.createElement('button');
 chip.className = 'tone-chip';
 chip.type = 'button';
 chip.textContent = index + 1;
 chip.title = `${band.note} · ${Math.round(band.center)} Hz`;
 chip.addEventListener('click', () => selectTone(index));
 toneGrid.appendChild(chip);
 });
}

function selectTone(index) {
 selectedTone = Math.max(0, Math.min(TONE_COUNT - 1, index));
 toneSlider.value = selectedTone + 1;
 updateToneUI();

 if (!isRunning) drawIdle();
}

function setMode(mode) {
 displayMode = mode === 'solo' ? 'solo' : 'all';
 modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === displayMode));
 spectrumLabel.textContent = displayMode === 'solo' ? 'фокус на выбранной полосе' : '50 тонов';
 historyLabel.textContent = displayMode === 'solo' ? 'история выбранного тона' : 'энергия по частотам';

 if (!isRunning) drawIdle();
}

function updateToneUI() {
 const band = toneBands[selectedTone];
 toneNumber.textContent = `Тон ${selectedTone + 1}`;
 toneNote.textContent = band.note;
 toneRange.textContent = `${Math.round(band.low)}-${Math.round(band.high)} Hz`;

 [...toneGrid.children].forEach((chip, index) => {
 chip.classList.toggle('active', index === selectedTone);
 });
}

function updateLevel(value) {
 const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
 toneLevel.style.width = `${percent}%`;
 tonePercent.textContent = `${percent}%`;
}

function setStatus(message, type = '') {
 statusEl.textContent = message;
 statusEl.className = `status ${type}`.trim();
}

function getNearestNote(frequency) {
 const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
 const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
 const octave = Math.floor(midi / 12) - 1;
 const note = noteNames[((midi % 12) + 12) % 12];

 return `${note}${octave}`;
}

function paintCanvasBackground(ctx, width, height) {
 const background = ctx.createLinearGradient(0, 0, 0, height);
 background.addColorStop(0, '#05070c');
 background.addColorStop(1, '#020304');
 ctx.fillStyle = background;
 ctx.fillRect(0, 0, width, height);
}

function drawGrid(ctx, width, height, padding) {
 ctx.save();
 ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
 ctx.lineWidth = 1;

 for (let i = 0; i <= 5; i++) {
 const y = padding + (height - padding * 2) * (i / 5);
 ctx.beginPath();
 ctx.moveTo(padding, y);
 ctx.lineTo(width - padding, y);
 ctx.stroke();
 }

 ctx.restore();
}

function drawToneCallout(ctx, band, level, x, y, barWidth) {
 const label = `${band.note} · ${Math.round(band.center)} Hz · ${Math.round(level / 255 * 100)}%`;
 ctx.font = '700 15px Segoe UI, Arial, sans-serif';
 const labelWidth = Math.min(260, Math.max(154, ctx.measureText(label).width + 26));
 const labelX = Math.max(12, Math.min(spectrumCanvas.width - labelWidth - 12, x + barWidth / 2 - labelWidth / 2));
 const labelY = Math.max(12, y - 44);

 ctx.fillStyle = 'rgba(8, 9, 12, 0.84)';
 roundRect(ctx, labelX, labelY, labelWidth, 32, 6);
 ctx.fill();
 ctx.fillStyle = '#f4f7fb';
 ctx.fillText(label, labelX + 13, labelY + 21);
}

function createVerticalGradient(ctx, y1, y2, colorA, colorB) {
 const gradient = ctx.createLinearGradient(0, y1, 0, y2);
 gradient.addColorStop(0, colorA);
 gradient.addColorStop(1, colorB);

 return gradient;
}

function roundRect(ctx, x, y, width, height, radius) {
 const safeRadius = Math.min(radius, width / 2, height / 2);
 ctx.beginPath();
 ctx.moveTo(x + safeRadius, y);
 ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
 ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
 ctx.arcTo(x, y + height, x, y, safeRadius);
 ctx.arcTo(x, y, x + width, y, safeRadius);
 ctx.closePath();
}
