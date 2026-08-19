/**
 * cgi-bridge.js — мост Voice Decomposer (Max17) -> CGI-Core.
 *
 * Шлёт кадры активного режима декодирования в ядро по WebSocket
 * (по умолчанию ws://127.0.0.1:8081) и принимает обратно состояние фокуса.
 * Работает без сборки: подключается тегом <script> до script.js.
 */

const CGI_DEFAULT_URL = 'ws://127.0.0.1:8081';

class CgiBridge {
 constructor({ url = CGI_DEFAULT_URL, minInterval = 250, onStatus = null, onMessage = null } = {}) {
 this.url = url;
 this.minInterval = minInterval;
 this.onStatus = onStatus;
 this.onMessage = onMessage;
 this.socket = null;
 this.manualClose = false;
 this.reconnectDelay = 1000;
 this.reconnectTimer = null;
 this.lastSentAt = 0;
 this.sent = 0;
 }

 get connected() {
 return this.socket && this.socket.readyState === WebSocket.OPEN;
 }

 connect(url = this.url) {
 this.url = url || CGI_DEFAULT_URL;
 this.manualClose = false;
 clearTimeout(this.reconnectTimer);

 if (this.socket && this.socket.readyState <= WebSocket.OPEN) return this;

 this._status('connecting', `подключаюсь к ${this.url}`);

 try {
 this.socket = new WebSocket(this.url);
 } catch (error) {
 this._status('error', `неверный адрес: ${error.message}`);
 return this;
 }

 this.socket.addEventListener('open', () => {
 this.reconnectDelay = 1000;
 this._status('open', `CGI на связи (${this.url})`);
 });

 this.socket.addEventListener('message', event => {
 if (!this.onMessage) return;
 try {
 this.onMessage(JSON.parse(event.data));
 } catch {
 // ядро прислало не-JSON — игнорируем
 }
 });

 this.socket.addEventListener('error', () => {
 this._status('error', 'нет связи с ядром');
 });

 this.socket.addEventListener('close', () => {
 this.socket = null;
 if (this.manualClose) {
 this._status('closed', 'мост выключен');
 return;
 }
 this._status('error', `ядро недоступно, повтор через ${Math.round(this.reconnectDelay / 1000)}с`);
 this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
 this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
 });

 return this;
 }

 disconnect() {
 this.manualClose = true;
 clearTimeout(this.reconnectTimer);
 if (this.socket) this.socket.close();
 else this._status('closed', 'мост выключен');
 return this;
 }

 toggle(url) {
 return this.connected || this.socket ? this.disconnect() : this.connect(url);
 }

 /** Кадр уходит не чаще minInterval — 60 fps ядру не нужны. */
 push(payload) {
 if (!this.connected || !payload) return false;

 const now = Date.now();
 if (now - this.lastSentAt < this.minInterval) return false;
 this.lastSentAt = now;

 this.socket.send(JSON.stringify(payload));
 this.sent++;
 return true;
 }

 _status(state, message) {
 this.state = state;
 if (this.onStatus) this.onStatus(state, message);
 }
}

/**
 * Собирает payload ровно того режима, который сейчас показан на экране —
 * ядро разбирает эти же пять форм в max17_decoder.js.
 */
function buildCgiPayload(mode, { levels, analysis, voiceState, musicState, tone, toneLevel }) {
 const timestamp = Date.now();

 switch (mode) {
 case 'all':
 return { mode, levels, timestamp };
 case 'solo':
 return { mode, tone, level: toneLevel, timestamp };
 case 'harmonics':
 return {
 mode,
 fundamental: analysis.fundamental,
 harmonics: analysis.harmonics,
 peaks: analysis.peaks,
 timestamp,
 };
 case 'state':
 return { ...voiceState, mode, timestamp };
 case 'music':
 return { ...musicState, notes: undefined, mode, timestamp };
 default:
 return null;
 }
}

window.CgiBridge = CgiBridge;
window.buildCgiPayload = buildCgiPayload;
window.CGI_DEFAULT_URL = CGI_DEFAULT_URL;
