let audioContext, analyser, stream, animationFrame;
let isRunning = false;
let history = [];

const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const spectrumCanvas = document.getElementById('spectrum');
const spectrogramCanvas = document.getElementById('spectrogram');
const specCtx = spectrumCanvas.getContext('2d');
const spectroCtx = spectrogramCanvas.getContext('2d');

btn.addEventListener('click', toggleMic);

async function toggleMic() {
 if (isRunning) {
 stopMic();
 return;
 }

 statusEl.textContent = "Запрашиваем доступ к микрофону...";

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
 btn.textContent = "⏹ Остановить";
 btn.classList.add('active');
 statusEl.textContent = "✅ Работает! Говори в микрофон";

 animate();

 } catch (err) {
 console.error(err);
 statusEl.innerHTML = `<span style="color:#ff6666">Ошибка: ${err.message || 'Доступ запрещён'}</span>`;
 }
}

function stopMic() {
 if (stream) stream.getTracks().forEach(track => track.stop());
 if (animationFrame) cancelAnimationFrame(animationFrame);

 isRunning = false;
 btn.textContent = "▶ Запустить микрофон";
 btn.classList.remove('active');
 statusEl.textContent = "Остановлено";
}

function animate() {
 if (!isRunning) return;

 const bufferLength = analyser.frequencyBinCount;
 const dataArray = new Uint8Array(bufferLength);
 analyser.getByteFrequencyData(dataArray);

 // === Спектр ===
 specCtx.fillStyle = '#000';
 specCtx.fillRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);

 const barWidth = spectrumCanvas.width / (bufferLength / 2.5);
 for (let i = 0; i < bufferLength; i += 2) {
 const height = (dataArray[i] / 255) * spectrumCanvas.height * 0.92;
 const hue = i / bufferLength * 180;
 specCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
 specCtx.fillRect(i * barWidth, spectrumCanvas.height - height, barWidth * 0.85, height);
 }

 // === Спектрограмма ===
 history.push(new Uint8Array(dataArray));
 if (history.length > 140) history.shift();

 spectroCtx.fillStyle = '#000';
 spectroCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);

 for (let y = 0; y < history.length; y++) {
 const row = history[y];
 for (let x = 0; x < 320; x++) {
 const intensity = row[x] / 280;
 spectroCtx.fillStyle = `hsl(${intensity * 120}, 100%, 50%)`;
 spectroCtx.fillRect(x * 3.12, y * 2.15, 3.1, 2.15);
 }
 }

 animationFrame = requestAnimationFrame(animate);
}