# Voice Decomposer

Разложение голоса на частоты, тоны и обертоны в реальном времени.

![Voice Decomposer Demo](https://via.placeholder.com/800x400/0a0a0a/00ff88?text=Voice+Decomposer)

**🔗 Живой сайт:** <https://mironmotor.github.io/neuron-motor/>

## Функции

- 🎙 Два режима: **Голос** и **Пространство** (окружающий звук)
- 🎵 Определение **основного тона** (pitch detection, автокорреляция) + нота и центы
- ✅ Оценка **чёткости** (clarity) тона
- 📈 Регистр (низ ↔ верх), энергия низа (80–400 Гц) и верха (2–8 кГц), яркость
- 🌈 Визуализация **обертонов** — гармонический ряд 1×…12×
- 📊 Частотный спектр в реальном времени
- 🎨 Спектрограмма с историей (140 кадров)
- 🎤 Работает в браузере — никаких серверов

## Как запустить локально

```bash
# Через Python
python -m http.server 8000

# Или через Node.js (если установлен)
npx serve .
```

Открой <http://localhost:8000>

## Деплой на GitHub Pages

Деплой автоматизирован через GitHub Actions (`.github/workflows/pages.yml`):
при каждом пуше в ветку `voice-mode` сайт пересобирается и публикуется.

Разовая настройка:

1. **Settings → Pages → Build and deployment → Source**: выбери **`GitHub Actions`**
2. Сделай пуш в ветку `voice-mode` (или запусти workflow вручную через вкладку **Actions**)
3. Через 1–2 минуты сайт доступен по адресу: <https://mironmotor.github.io/neuron-motor/>

**Важно:** на GitHub Pages всё работает через HTTPS — микрофон запрашивается автоматически.

## Планируемые улучшения

- [ ] Фильтры (вырезать низкие/высокие тона)
- [ ] Запись аудио
- [ ] Экспорт спектрограммы

## Технологии

- Web Audio API
- Canvas 2D
- Vanilla JavaScript (без фреймворков)
- GitHub Actions + GitHub Pages

## Лицензия

MIT
