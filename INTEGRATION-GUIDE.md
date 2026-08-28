# Ecoline Visualizer v2 — Brush + SAM интеграциясы

## Файл құрылымы

```
ecoline-v2/
├── api/
│   └── segment.js          ← SAM serverless function (Vercel)
├── css/
│   └── upload-tool.css      ← Upload modal стильдері
├── js/
│   ├── upload-tool.js        ← Brush + SAM UI модулі
│   └── custom-room-handler.js ← Визуализатормен байланыс
└── index.html               ← Қосылатын код төменде
```

---

## 1-қадам: index.html-ге қосу

### `<head>` ішіне CSS қосу:
```html
<link rel="stylesheet" href="css/upload-tool.css">
```

### `</body>` алдына JS қосу:
```html
<script src="js/upload-tool.js"></script>
<script src="js/custom-room-handler.js"></script>
```

### Бөлме таңдау аймағына "Өз фотоңыз" батырмасын қосу:

Бөлме thumbnail-дерінің жанына (hallway, kitchen т.б.) мына батырманы қосыңыз:

```html
<button class="upload-trigger-btn" onclick="UploadTool.open()">
  📷 Өз фотоңызды жүктеу
</button>
```

---

## 2-қадам: Негізгі визуализатормен байланыс

`main.js` немесе визуализатордың негізгі JS файлында, NOVA палитрадан түс таңдалғанда custom room-ға бояу қолдану:

```javascript
// Палитрадан түс таңдалғанда
function onColorSelected(hexColor) {
  // Custom room бар ма?
  if (window._customRoom && window._customActiveSurface !== undefined) {
    window.applyCustomPaint(window._customActiveSurface, hexColor);
    return;
  }
  
  // Стандартты бөлме бояу (бұрынғы код)
  // ...
}
```

---

## 3-қадам: Vercel Environment Variable

Replicate API token Vercel-де сақталған:
- Variable: `REPLICATE_API_TOKEN`
- Vercel Dashboard → Settings → Environment Variables

---

## Қалай жұмыс істейді

### Brush Tool (қолмен белгілеу):
1. 📷 батырмасын басу → фото жүктеу
2. 🖌️ Қылқалам таңдау → қабырғаны белгілеу
3. Бірнеше қабат қосу мүмкін (Қабырға 1, Қабырға 2...)
4. ✓ Қолдану → палитрадан түс таңдау

### SAM AI сегменттеу:
1. 📷 батырмасын басу → фото жүктеу
2. 🤖 AI сегмент таңдау
3. Қабырғаға бір рет басу → AI автоматты сегменттейді
4. Нәтижені brush-пен түзетуге болады
5. ✓ Қолдану → палитрадан түс таңдау

### Keyboard shortcuts:
- `[` / `]` — қылқалам өлшемін кішірейту/үлкейту
- `Ctrl+Z` — артқа қайтару
- `Esc` — жабу

---

## Терминал командалары

```bash
# 1. Файлдарды көшіру
cd C:\Users\HP\Downloads\ecoline-v2\ecoline-v2

# 2. Локальды тест
python -m http.server 5500
# Браузерде: http://localhost:5500

# 3. GitHub Desktop-пен push
# Documents\GitHub\ecoline-v2 папкасына көшіру → push

# 4. Vercel auto-deploy болады
```
