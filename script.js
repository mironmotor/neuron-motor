let audioContext, analyser, stream, animationFrame;
let isRunning = false;
let spectrumHistory = [];
let soloHistory = [];
let harmonicHistory = [];
let stateHistory = [];
let pitchHistory = [];
let previousLevels = null;
let latestVoiceState = null;
let selectedTone = 24;
let displayMode = 'all';

const TONE_COUNT = 50;
const MIN_FREQ = 80;
const MAX_FREQ = 4200;
const MAX_HISTORY = 144;
const PEAK_LIMIT = 12;
const HARMONIC_LIMIT = 8;
const STATE_HISTORY_LIMIT = 120;
const toneBands = createToneBands();
const stateMetrics = [
 { key: 'energy', label: 'energy', color: '#35f29a' },
 { key: 'focus', label: 'focus', color: '#38d9ff' },
 { key: 'confidence', label: 'confidence', color: '#ffd166' },
 { key: 'warmth', label: 'warmth', color: '#ffb86b' },
 { key: 'excited', label: 'excited', color: '#ff5c8a' },
 { key: 'tension', label: 'tension', color: '#a78bfa' },
 { key: 'fatigue', label: 'fatigue', color: '#8ea0b8' }
];

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
const levelTitle = document.getElementById('levelTitle');
const levelHint = document.getElementById('levelHint');
const spectrumLabel = document.getElementById('spectrumLabel');
const historyLabel = document.getElementById('historyLabel');
const voiceStatePayload = document.getElementById('voiceStatePayload');
const modeTabs = [...document.querySelectorAll('.mode-tab')];

btn.addEventListener('click', toggleMic);
toneSlider.addEventListener('input', () => selectTone(Number(toneSlider.value) - 1));
modeTabs.forEach(tab => {
 tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

buildToneGrid();
updateToneUI();
document.body.dataset.mode = displayMode;
window.getVoiceStateSnapshot = () => latestVoiceState;
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
 harmonicHistory = [];
 stateHistory = [];
 pitchHistory = [];
 previousLevels = null;
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
 previousLevels = null;
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
 const analysis = analyzeHarmonics(dataArray);
 const voiceState = analyzeVoiceState(dataArray, levels, analysis);
 const currentLevel = levels[selectedTone];
 const peak = Math.max(...levels, 0.01);
 const focusedLevel = displayMode === 'state'
 ? voiceState.certainty
 : displayMode === 'harmonics'
 ? (analysis.fundamental ? analysis.fundamental.level / 255 : 0)
 : currentLevel / 255;

 if (displayMode === 'harmonics') updateHarmonicUI(analysis);
 if (displayMode === 'state') updateStateUI(voiceState);

 spectrumHistory.push(levels);
 if (spectrumHistory.length > MAX_HISTORY) spectrumHistory.shift();

 soloHistory.push(currentLevel);
 if (soloHistory.length > MAX_HISTORY) soloHistory.shift();

 harmonicHistory.push(analysis.harmonics.map(harmonic => harmonic.level));
 if (harmonicHistory.length > MAX_HISTORY) harmonicHistory.shift();

 stateHistory.push(voiceState.scores);
 if (stateHistory.length > STATE_HISTORY_LIMIT) stateHistory.shift();

 publishVoiceState(voiceState);

 drawSpectrum(levels, peak, analysis, voiceState);
 drawHistory(levels, analysis, voiceState);
 updateLevel(focusedLevel);

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

function analyzeHarmonics(dataArray) {
 const peaks = findSpectralPeaks(dataArray);
 const fundamental = estimateFundamental(peaks, dataArray);
 const harmonics = fundamental ? buildHarmonicSeries(dataArray, fundamental.frequency) : [];

 return { peaks, fundamental, harmonics };
}

function findSpectralPeaks(dataArray) {
 const binWidth = audioContext.sampleRate / analyser.fftSize;
 const start = Math.max(2, Math.floor(70 / binWidth));
 const end = Math.min(dataArray.length - 3, Math.ceil(5000 / binWidth));
 let maxValue = 0;

 for (let i = start; i <= end; i++) {
 maxValue = Math.max(maxValue, dataArray[i]);
 }

 const threshold = Math.max(18, maxValue * 0.18);
 const candidates = [];

 for (let i = start; i <= end; i++) {
 const value = dataArray[i];
 if (value < threshold) continue;
 if (value <= dataArray[i - 1] || value <= dataArray[i + 1]) continue;
 if (value < dataArray[i - 2] || value < dataArray[i + 2]) continue;

 const refinedBin = refinePeakBin(dataArray, i);
 candidates.push({
 bin: refinedBin,
 frequency: refinedBin * binWidth,
 level: value
 });
 }

 candidates.sort((a, b) => b.level - a.level);
 const peaks = [];

 candidates.forEach(candidate => {
 const isTooClose = peaks.some(peak => Math.abs(peak.frequency - candidate.frequency) < 36);
 if (!isTooClose) peaks.push(candidate);
 });

 return peaks
 .slice(0, PEAK_LIMIT)
 .sort((a, b) => a.frequency - b.frequency);
}

function refinePeakBin(dataArray, index) {
 const left = dataArray[index - 1];
 const center = dataArray[index];
 const right = dataArray[index + 1];
 const denominator = left - 2 * center + right;

 if (!denominator) return index;
 return index + 0.5 * (left - right) / denominator;
}

function estimateFundamental(peaks, dataArray) {
 const voiceCandidates = peaks.filter(peak => peak.frequency >= 70 && peak.frequency <= 360);
 if (!voiceCandidates.length) return null;

 let best = null;

 voiceCandidates.forEach(candidate => {
 let score = candidate.level * 1.15;

 for (let harmonic = 2; harmonic <= HARMONIC_LIMIT; harmonic++) {
 const target = candidate.frequency * harmonic;
 const match = findClosestPeak(peaks, target, Math.max(18, target * 0.035));
 if (match) {
 const distance = Math.abs(match.frequency - target);
 const closeness = 1 - distance / Math.max(18, target * 0.035);
 score += match.level * closeness / Math.sqrt(harmonic);
 } else {
 const localLevel = getFrequencyLevel(dataArray, target, Math.max(12, target * 0.018));
 score += localLevel / (harmonic * 1.8);
 }
 }

 if (!best || score > best.score) {
 best = {
 frequency: candidate.frequency,
 level: candidate.level,
 note: getNearestNote(candidate.frequency),
 score
 };
 }
 });

 return best;
}

function buildHarmonicSeries(dataArray, fundamentalFrequency) {
 return Array.from({ length: HARMONIC_LIMIT }, (_, index) => {
 const harmonic = index + 1;
 const frequency = fundamentalFrequency * harmonic;
 const level = frequency <= 5000
 ? getFrequencyLevel(dataArray, frequency, Math.max(10, frequency * 0.02))
 : 0;

 return {
 harmonic,
 frequency,
 level,
 note: getNearestNote(frequency)
 };
 });
}

function getFrequencyLevel(dataArray, frequency, windowHz) {
 const binWidth = audioContext.sampleRate / analyser.fftSize;
 const center = Math.round(frequency / binWidth);
 const radius = Math.max(1, Math.round(windowHz / binWidth));
 const start = Math.max(1, center - radius);
 const end = Math.min(dataArray.length - 1, center + radius);
 let peak = 0;

 for (let i = start; i <= end; i++) {
 peak = Math.max(peak, dataArray[i]);
 }

 return peak;
}

function findClosestPeak(peaks, target, tolerance) {
 let closest = null;

 peaks.forEach(peak => {
 const distance = Math.abs(peak.frequency - target);
 if (distance > tolerance) return;
 if (!closest || distance < closest.distance) {
 closest = { ...peak, distance };
 }
 });

 return closest;
}

function analyzeVoiceState(dataArray, levels, analysis) {
 const low = getAverageInRange(dataArray, 80, 250);
 const lowMid = getAverageInRange(dataArray, 250, 700);
 const mid = getAverageInRange(dataArray, 700, 1600);
 const high = getAverageInRange(dataArray, 1600, 4200);
 const total = low + lowMid + mid + high + 0.001;
 const energy = clamp01(total / 360);
 const brightness = clamp01((high / total) * 2.5 + (mid / total) * 0.5);
 const warmth = clamp01((lowMid / total) * 1.55 + (low / total) * 0.6);
 const harmonicEnergy = analysis.harmonics.reduce((sum, item) => sum + item.level, 0);
 const peakEnergy = analysis.peaks.reduce((sum, item) => sum + item.level, 0) || total;
 const harmonicClarity = clamp01(harmonicEnergy / (peakEnergy * 1.4));
 const pitch = analysis.fundamental ? analysis.fundamental.frequency : null;

 if (pitch) {
 pitchHistory.push(pitch);
 if (pitchHistory.length > 36) pitchHistory.shift();
 }

 const pitchMotion = pitchHistory.length > 4 ? clamp01(stdDev(pitchHistory) / 80) : 0.18;
 const spectralFlux = previousLevels ? getSpectralFlux(levels, previousLevels) : 0;
 previousLevels = [...levels];

 const stability = clamp01(1 - spectralFlux * 1.7 - pitchMotion * 0.65 - (1 - harmonicClarity) * 0.22);
 const tension = clamp01(brightness * 0.3 + spectralFlux * 0.34 + (1 - harmonicClarity) * 0.24 + pitchMotion * 0.2);
 const focus = clamp01(stability * 0.52 + harmonicClarity * 0.25 + (1 - Math.abs(energy - 0.56)) * 0.2 - tension * 0.12);
 const confidence = clamp01(energy * 0.32 + stability * 0.28 + harmonicClarity * 0.26 + warmth * 0.12 - tension * 0.14);
 const excited = clamp01(energy * 0.46 + brightness * 0.34 + pitchMotion * 0.18 - tension * 0.04);
 const fatigue = clamp01((1 - energy) * 0.5 + (1 - brightness) * 0.2 + (1 - stability) * 0.18 + (1 - harmonicClarity) * 0.12 - confidence * 0.12);
 const certainty = clamp01(energy * 0.28 + harmonicClarity * 0.28 + stability * 0.18 + (analysis.fundamental ? 0.18 : 0.04) + Math.min(analysis.peaks.length / 10, 1) * 0.08);

 const scores = {
 energy,
 focus,
 confidence,
 warmth,
 excited,
 tension,
 fatigue,
 brightness,
 stability
 };
 const labels = getStateLabels(scores);

 return {
 labels,
 primary: labels[0],
 certainty,
 scores,
 features: {
 pitch,
 low,
 lowMid,
 mid,
 high,
 brightness,
 harmonicClarity,
 pitchMotion,
 spectralFlux,
 stability
 },
 timestamp: Date.now()
 };
}

function getAverageInRange(dataArray, lowHz, highHz) {
 const binWidth = audioContext.sampleRate / analyser.fftSize;
 const start = Math.max(1, Math.floor(lowHz / binWidth));
 const end = Math.min(dataArray.length - 1, Math.ceil(highHz / binWidth));
 let sum = 0;
 let count = 0;

 for (let i = start; i <= end; i++) {
 sum += dataArray[i];
 count++;
 }

 return count ? sum / count : 0;
}

function getSpectralFlux(current, previous) {
 let sum = 0;

 current.forEach((level, index) => {
 const delta = Math.max(0, level - previous[index]) / 255;
 sum += delta;
 });

 return clamp01(sum / Math.max(1, current.length) * 4.2);
}

function stdDev(values) {
 const average = values.reduce((sum, value) => sum + value, 0) / values.length;
 const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / values.length;

 return Math.sqrt(variance);
}

function getStateLabels(scores) {
 const candidates = [
 { label: 'focused', value: scores.focus },
 { label: 'confident', value: scores.confidence },
 { label: 'excited', value: scores.excited },
 { label: 'warm', value: scores.warmth },
 { label: 'steady', value: scores.stability },
 { label: 'tense', value: scores.tension },
 { label: 'low energy', value: scores.fatigue }
 ];

 const labels = candidates
 .filter(item => item.value >= 0.52)
 .sort((a, b) => b.value - a.value)
 .slice(0, 3)
 .map(item => item.label);

 return labels.length ? labels : ['neutral'];
}

function drawSpectrum(levels, peak, analysis = getIdleAnalysis(), voiceState = getIdleState()) {
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

 if (displayMode === 'harmonics') {
 drawHarmonicSpectrum(analysis);
 return;
 }

 if (displayMode === 'state') {
 drawStateSpectrum(voiceState);
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

function drawHarmonicSpectrum(analysis) {
 const { width, height } = spectrumCanvas;
 const padding = 44;
 const usableWidth = width - padding * 2;
 const usableHeight = height - padding * 2;
 const maxLevel = Math.max(...analysis.peaks.map(peak => peak.level), 80);

 specCtx.fillStyle = 'rgba(255, 255, 255, 0.035)';
 roundRect(specCtx, padding, padding, usableWidth, usableHeight, 8);
 specCtx.fill();

 drawFrequencyAxis(specCtx, width, height, padding);

 analysis.peaks.forEach(peak => {
 const x = frequencyToX(peak.frequency, padding, usableWidth);
 const normalized = Math.min(1, peak.level / maxLevel);
 const peakHeight = normalized * usableHeight;
 const y = height - padding - peakHeight;

 specCtx.strokeStyle = 'rgba(56, 217, 255, 0.34)';
 specCtx.lineWidth = 2;
 specCtx.beginPath();
 specCtx.moveTo(x, height - padding);
 specCtx.lineTo(x, y);
 specCtx.stroke();

 specCtx.fillStyle = 'rgba(56, 217, 255, 0.88)';
 specCtx.beginPath();
 specCtx.arc(x, y, 4 + normalized * 5, 0, Math.PI * 2);
 specCtx.fill();
 });

 if (!analysis.fundamental) {
 drawCenteredCanvasText(specCtx, 'Скажи протяжное "ааа", чтобы поймать основу голоса', width, height);
 return;
 }

 analysis.harmonics.forEach(item => {
 if (item.frequency > 5000) return;

 const x = frequencyToX(item.frequency, padding, usableWidth);
 const normalized = Math.min(1, item.level / Math.max(maxLevel, analysis.fundamental.level, 80));
 const markerHeight = Math.max(18, normalized * usableHeight);
 const y = height - padding - markerHeight;
 const isRoot = item.harmonic === 1;

 specCtx.strokeStyle = isRoot ? '#ffd166' : 'rgba(53, 242, 154, 0.92)';
 specCtx.lineWidth = isRoot ? 5 : 3;
 specCtx.beginPath();
 specCtx.moveTo(x, height - padding);
 specCtx.lineTo(x, y);
 specCtx.stroke();

 specCtx.fillStyle = isRoot ? '#ffd166' : '#35f29a';
 specCtx.font = isRoot ? '900 18px Segoe UI, Arial, sans-serif' : '800 14px Segoe UI, Arial, sans-serif';
 specCtx.textAlign = 'center';
 specCtx.fillText(`H${item.harmonic}`, x, Math.max(20, y - 10));
 });

 specCtx.textAlign = 'left';
 specCtx.fillStyle = '#f4f7fb';
 specCtx.font = '900 28px Segoe UI, Arial, sans-serif';
 specCtx.fillText(`${analysis.fundamental.note} · ${Math.round(analysis.fundamental.frequency)} Hz`, padding + 8, padding + 34);
 specCtx.font = '700 15px Segoe UI, Arial, sans-serif';
 specCtx.fillStyle = 'rgba(244, 247, 251, 0.66)';
 specCtx.fillText('основа голоса и ближайшие обертоны', padding + 10, padding + 58);
}

function drawStateSpectrum(voiceState) {
 const { width, height } = spectrumCanvas;
 const padding = 42;
 const primary = voiceState.primary || 'neutral';
 const labels = voiceState.labels.join(' / ');
 const barStartY = padding + 134;
 const columnGap = 42;
 const columnWidth = (width - padding * 2 - columnGap) / 2;
 const rowHeight = 42;

 specCtx.fillStyle = 'rgba(255, 255, 255, 0.035)';
 roundRect(specCtx, padding, padding, width - padding * 2, height - padding * 2, 8);
 specCtx.fill();

 specCtx.font = '900 42px Segoe UI, Arial, sans-serif';
 specCtx.fillStyle = '#f4f7fb';
 specCtx.fillText(primary, padding + 10, padding + 52);

 specCtx.font = '800 16px Segoe UI, Arial, sans-serif';
 specCtx.fillStyle = 'rgba(244, 247, 251, 0.68)';
 specCtx.fillText(labels, padding + 12, padding + 82);
 specCtx.fillText(`certainty ${Math.round(voiceState.certainty * 100)}%`, padding + 12, padding + 108);

 const pitchText = voiceState.features.pitch ? `${Math.round(voiceState.features.pitch)} Hz` : 'no stable pitch';
 specCtx.textAlign = 'right';
 specCtx.font = '700 14px Segoe UI, Arial, sans-serif';
 specCtx.fillStyle = 'rgba(244, 247, 251, 0.58)';
 specCtx.fillText(`pitch ${pitchText}`, width - padding - 12, padding + 54);
 specCtx.fillText(`brightness ${Math.round(voiceState.features.brightness * 100)}% · clarity ${Math.round(voiceState.features.harmonicClarity * 100)}%`, width - padding - 12, padding + 80);
 specCtx.textAlign = 'left';

 stateMetrics.forEach((metric, index) => {
 const value = voiceState.scores[metric.key] || 0;
 const column = index < 4 ? 0 : 1;
 const row = column ? index - 4 : index;
 const x = padding + column * (columnWidth + columnGap);
 const y = barStartY + row * rowHeight;
 const fillWidth = Math.max(6, value * columnWidth);

 specCtx.fillStyle = 'rgba(255, 255, 255, 0.07)';
 roundRect(specCtx, x, y, columnWidth, 14, 7);
 specCtx.fill();

 specCtx.fillStyle = metric.color;
 roundRect(specCtx, x, y, fillWidth, 14, 7);
 specCtx.fill();

 specCtx.font = '800 13px Segoe UI, Arial, sans-serif';
 specCtx.fillStyle = 'rgba(244, 247, 251, 0.84)';
 specCtx.fillText(metric.label, x, y - 6);
 specCtx.textAlign = 'right';
 specCtx.fillText(`${Math.round(value * 100)}%`, x + columnWidth, y - 6);
 specCtx.textAlign = 'left';
 });

}

function drawHistory(levels, analysis = getIdleAnalysis(), voiceState = getIdleState()) {
 const { width, height } = spectrogramCanvas;
 paintCanvasBackground(spectroCtx, width, height);

 if (displayMode === 'solo') {
 drawSoloHistory(width, height);
 return;
 }

 if (displayMode === 'harmonics') {
 drawHarmonicHistory(width, height, analysis);
 return;
 }

 if (displayMode === 'state') {
 drawStateHistory(width, height, voiceState);
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

function drawHarmonicHistory(width, height, analysis) {
 const padding = 34;
 const usableWidth = width - padding * 2;
 const usableHeight = height - padding * 2;
 const rowHeight = usableHeight / HARMONIC_LIMIT;
 const columnWidth = usableWidth / MAX_HISTORY;
 const startX = padding + usableWidth - harmonicHistory.length * columnWidth;

 drawGrid(spectroCtx, width, height, padding);

 harmonicHistory.forEach((row, columnIndex) => {
 for (let harmonic = 0; harmonic < HARMONIC_LIMIT; harmonic++) {
 const level = row[harmonic] || 0;
 const intensity = Math.min(1, level / 230);
 const x = startX + columnIndex * columnWidth;
 const y = padding + harmonic * rowHeight;
 const hue = harmonic === 0 ? 42 : 145 + harmonic * 12;

 spectroCtx.fillStyle = `hsla(${hue}, 95%, ${16 + intensity * 60}%, ${0.18 + intensity * 0.82})`;
 spectroCtx.fillRect(x, y, columnWidth + 0.5, rowHeight - 2);
 }
 });

 const labelItems = analysis.harmonics.length ? analysis.harmonics : getIdleAnalysis().harmonics;
 labelItems.forEach(item => {
 const y = padding + (item.harmonic - 0.5) * rowHeight + 5;
 spectroCtx.fillStyle = item.harmonic === 1 ? '#ffd166' : 'rgba(244, 247, 251, 0.72)';
 spectroCtx.font = '800 13px Segoe UI, Arial, sans-serif';
 spectroCtx.fillText(`H${item.harmonic}`, 10, y);
 spectroCtx.fillText(`${Math.round(item.frequency)} Hz`, width - 82, y);
 });
}

function drawStateHistory(width, height, voiceState) {
 const padding = 34;
 const usableWidth = width - padding * 2;
 const usableHeight = height - padding * 2;
 const rowHeight = usableHeight / stateMetrics.length;
 const columnWidth = usableWidth / STATE_HISTORY_LIMIT;
 const startX = padding + usableWidth - stateHistory.length * columnWidth;

 drawGrid(spectroCtx, width, height, padding);

 stateHistory.forEach((row, columnIndex) => {
 stateMetrics.forEach((metric, metricIndex) => {
 const value = row[metric.key] || 0;
 const x = startX + columnIndex * columnWidth;
 const y = padding + metricIndex * rowHeight;
 const alpha = 0.18 + value * 0.82;

 spectroCtx.fillStyle = hexToRgba(metric.color, alpha);
 spectroCtx.fillRect(x, y, columnWidth + 0.5, rowHeight - 2);
 });
 });

 stateMetrics.forEach((metric, index) => {
 const y = padding + (index + 0.58) * rowHeight;
 const value = voiceState.scores[metric.key] || 0;
 spectroCtx.fillStyle = metric.color;
 spectroCtx.font = '800 13px Segoe UI, Arial, sans-serif';
 spectroCtx.fillText(metric.label, 10, y);
 spectroCtx.fillText(`${Math.round(value * 100)}%`, width - 54, y);
 });
}

function drawIdle() {
 const idleLevels = toneBands.map((_, index) => {
 const wave = Math.sin(index * 0.7) * 0.5 + 0.5;
 return 20 + wave * 34;
 });
 const idleAnalysis = getIdleAnalysis();
 const idleState = getIdleState();

 drawSpectrum(idleLevels, 100, idleAnalysis, idleState);
 spectrumHistory = Array.from({ length: 38 }, (_, y) => {
 return toneBands.map((_, x) => 12 + Math.max(0, Math.sin(x * 0.45 + y * 0.2)) * 38);
 });
 soloHistory = Array.from({ length: 38 }, (_, index) => 26 + Math.sin(index * 0.32) * 14);
 harmonicHistory = Array.from({ length: 38 }, (_, column) => {
 return Array.from({ length: HARMONIC_LIMIT }, (_, row) => 24 + Math.max(0, Math.sin(column * 0.22 + row * 0.9)) * 52);
 });
 stateHistory = Array.from({ length: 38 }, (_, column) => {
 return {
 energy: 0.52 + Math.sin(column * 0.18) * 0.05,
 focus: 0.68 + Math.sin(column * 0.12) * 0.04,
 confidence: 0.6 + Math.cos(column * 0.16) * 0.05,
 warmth: 0.62 + Math.sin(column * 0.14 + 1) * 0.04,
 excited: 0.34 + Math.sin(column * 0.22) * 0.05,
 tension: 0.2 + Math.cos(column * 0.2) * 0.04,
 fatigue: 0.18 + Math.sin(column * 0.11) * 0.03,
 brightness: 0.48,
 stability: 0.74
 };
 });
 publishVoiceState(idleState);
 drawHistory(idleLevels, idleAnalysis, idleState);
 updateLevel(displayMode === 'state' ? idleState.certainty : 0);
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
 displayMode = ['all', 'solo', 'harmonics', 'state'].includes(mode) ? mode : 'all';
 document.body.dataset.mode = displayMode;
 modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === displayMode));

 if (displayMode === 'solo') {
 spectrumLabel.textContent = 'фокус на выбранной полосе';
 historyLabel.textContent = 'история выбранного тона';
 levelTitle.textContent = 'Активность выбранного тона';
 levelHint.textContent = 'энергия текущей полосы';
 updateToneUI();
 } else if (displayMode === 'harmonics') {
 spectrumLabel.textContent = 'пики FFT и обертоны';
 historyLabel.textContent = 'история H1-H8';
 levelTitle.textContent = 'Сила основного тона';
 levelHint.textContent = 'оценка найденной основы голоса';
 updateHarmonicUI(getIdleAnalysis());
 } else if (displayMode === 'state') {
 spectrumLabel.textContent = 'voice state vector';
 historyLabel.textContent = 'история состояния';
 levelTitle.textContent = 'Надежность оценки';
 levelHint.textContent = 'акустическая подсказка для Max17';
 updateStateUI(latestVoiceState || getIdleState());
 } else {
 spectrumLabel.textContent = '50 тонов';
 historyLabel.textContent = 'энергия по частотам';
 levelTitle.textContent = 'Активность выбранного тона';
 levelHint.textContent = 'энергия текущей полосы';
 updateToneUI();
 }

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

function updateHarmonicUI(analysis) {
 if (!analysis.fundamental) {
 toneNumber.textContent = 'Основа';
 toneNote.textContent = '...';
 toneRange.textContent = 'нет устойчивого тона';
 return;
 }

 toneNumber.textContent = 'Основа';
 toneNote.textContent = analysis.fundamental.note;
 toneRange.textContent = `${Math.round(analysis.fundamental.frequency)} Hz`;
}

function updateStateUI(voiceState) {
 toneNumber.textContent = 'Состояние';
 toneNote.textContent = voiceState.primary || 'neutral';
 toneRange.textContent = `${Math.round(voiceState.certainty * 100)}% certainty`;
}

function publishVoiceState(voiceState) {
 latestVoiceState = voiceState;
 window.__voiceState = voiceState;
 voiceStatePayload.textContent = JSON.stringify(voiceState);
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

function drawFrequencyAxis(ctx, width, height, padding) {
 const labels = [80, 160, 320, 640, 1280, 2560, 4200];
 const usableWidth = width - padding * 2;

 ctx.save();
 ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
 ctx.fillStyle = 'rgba(244, 247, 251, 0.52)';
 ctx.font = '700 12px Segoe UI, Arial, sans-serif';

 labels.forEach(frequency => {
 const x = frequencyToX(frequency, padding, usableWidth);
 ctx.beginPath();
 ctx.moveTo(x, padding);
 ctx.lineTo(x, height - padding);
 ctx.stroke();
 ctx.fillText(`${frequency}`, x - 13, height - 12);
 });

 ctx.restore();
}

function frequencyToX(frequency, padding, usableWidth) {
 const min = Math.log2(MIN_FREQ);
 const max = Math.log2(MAX_FREQ);
 const value = Math.log2(Math.max(MIN_FREQ, Math.min(MAX_FREQ, frequency)));

 return padding + ((value - min) / (max - min)) * usableWidth;
}

function drawCenteredCanvasText(ctx, text, width, height) {
 ctx.save();
 ctx.fillStyle = 'rgba(244, 247, 251, 0.72)';
 ctx.font = '800 20px Segoe UI, Arial, sans-serif';
 ctx.textAlign = 'center';
 ctx.fillText(text, width / 2, height / 2);
 ctx.restore();
}

function getIdleAnalysis() {
 const base = 146.8;
 const harmonics = Array.from({ length: HARMONIC_LIMIT }, (_, index) => {
 const harmonic = index + 1;
 const frequency = base * harmonic;

 return {
 harmonic,
 frequency,
 level: 80 / Math.sqrt(harmonic),
 note: getNearestNote(frequency)
 };
 });

 return {
 peaks: harmonics.map(item => ({
 frequency: item.frequency,
 level: item.level,
 bin: 0
 })),
 fundamental: {
 frequency: base,
 level: 80,
 note: getNearestNote(base),
 score: 1
 },
 harmonics
 };
}

function getIdleState() {
 const scores = {
 energy: 0.52,
 focus: 0.68,
 confidence: 0.61,
 warmth: 0.62,
 excited: 0.34,
 tension: 0.2,
 fatigue: 0.18,
 brightness: 0.48,
 stability: 0.74
 };

 return {
 labels: ['focused', 'steady', 'warm'],
 primary: 'focused',
 certainty: 0.42,
 scores,
 features: {
 pitch: 146.8,
 low: 42,
 lowMid: 64,
 mid: 48,
 high: 32,
 brightness: scores.brightness,
 harmonicClarity: 0.62,
 pitchMotion: 0.12,
 spectralFlux: 0.08,
 stability: scores.stability
 },
 timestamp: Date.now()
 };
}

function clamp01(value) {
 return Math.max(0, Math.min(1, value));
}

function hexToRgba(hex, alpha) {
 const clean = hex.replace('#', '');
 const red = parseInt(clean.slice(0, 2), 16);
 const green = parseInt(clean.slice(2, 4), 16);
 const blue = parseInt(clean.slice(4, 6), 16);

 return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
