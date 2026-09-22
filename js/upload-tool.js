/**
 * Ecoline Visualizer v2 — Upload + Brush + SAM Integration
 * 
 * Функционал:
 * 1. 📷 Клиент өз фотосын жүктейді
 * 2. 🖌️ Brush tool — қабырғаны қолмен белгілеу
 * 3. 🤖 SAM — клик арқылы AI автоматты сегменттейді
 * 4. 🎨 Белгіленген аймаққа бояу қолдану
 */

const UploadTool = (() => {
  // ===== STATE =====
  let state = {
    mode: null,           // 'brush' | 'sam' | 'eraser' | 'line' | 'lineErase' | 'rectErase'
    isDrawing: false,
    brushSize: 30,
    uploadedImage: null,   // HTMLImageElement
    masks: [],             // [{ name, canvas, color }]
    activeMaskIndex: 0,
    samLoading: false,
    undoStack: [],
    maxUndo: 20,
    // SAM multi-point support
    samPoints: [],         // [{x, y, label}] — label: 1=positive, 0=negative
    samPointMode: 1,       // 1=positive (қабырға), 0=negative (еден/төбе)
    samMarkers: [],        // DOM elements for visual markers
    // Shape tools (line, rectErase)
    isShaping: false,
    shapeStart: null,      // {x, y} — shape start point
  };

  // ===== DOM REFS =====
  let els = {};

  // ===== INIT =====
  function init() {
    createUI();
    bindEvents();
    console.log('[UploadTool] Initialized');
  }

  // ===== UI CREATION =====
  function createUI() {
    // Modal overlay
    const modal = document.createElement('div');
    modal.id = 'upload-modal';
    modal.className = 'upload-modal';
    modal.innerHTML = `
      <div class="upload-modal-content">
        <div class="upload-header">
          <h3>📷 Өз фотоңызды жүктеу</h3>
          <button class="upload-close" id="upload-close">&times;</button>
        </div>

        <!-- Step 1: Upload -->
        <div class="upload-step" id="step-upload">
          <div class="upload-dropzone" id="upload-dropzone">
            <input type="file" id="upload-input" accept="image/*" hidden>
            <div class="dropzone-content">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p>Фотоны сүйреңіз немесе басыңыз</p>
              <span class="dropzone-hint">JPG, PNG · макс 5MB</span>
            </div>
          </div>
        </div>

        <!-- Step 2: Edit -->
        <div class="upload-step hidden" id="step-edit">
          <div class="edit-toolbar">
            <div class="toolbar-group">
              <button class="tool-btn active" id="btn-brush" title="Қолмен белгілеу">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                </svg>
                <span>Қылқалам</span>
              </button>
              <button class="tool-btn" id="btn-sam" title="AI сегменттеу">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                </svg>
                <span>AI сегмент</span>
              </button>
              <button class="tool-btn" id="btn-eraser" title="Өшіргіш">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.4 1.8c.8-.8 2-.8 2.8 0L21 5.6"/>
                </svg>
                <span>Өшіргіш</span>
              </button>
            </div>

            <div class="toolbar-group">
              <button class="tool-btn" id="btn-line" title="Сызық бояғыш">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="4" y1="20" x2="20" y2="4"/>
                </svg>
                <span>╱Сызық</span>
              </button>
              <button class="tool-btn" id="btn-lineErase" title="Сызық өшіргіш">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="4" y1="20" x2="20" y2="4"/>
                  <line x1="4" y1="4" x2="20" y2="20" stroke-opacity="0.4"/>
                </svg>
                <span>╲СӨш</span>
              </button>
              <button class="tool-btn" id="btn-rectErase" title="Төртбұрыш өшіргіш">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="4 2"/>
                </svg>
                <span>▭Өшір</span>
              </button>
            </div>

            <div class="toolbar-group">
              <label class="brush-size-label">
                <span id="brush-size-value">30</span>px
                <input type="range" id="brush-size" min="5" max="80" value="30">
              </label>
            </div>

            <div class="toolbar-group toolbar-actions">
              <button class="action-btn" id="btn-undo" title="Артқа қайтару" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
              </button>
              <button class="action-btn" id="btn-clear" title="Тазалау">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Mask layers -->
          <div class="mask-layers" id="mask-layers">
            <div class="mask-layer active" data-index="0">
              <span class="layer-color" style="background:#FF6B6B"></span>
              <span class="layer-name">Қабырға 1</span>
            </div>
            <button class="add-layer-btn" id="btn-add-layer">+ Қосу</button>
          </div>

          <!-- Canvas area -->
          <div class="canvas-container" id="canvas-container">
            <canvas id="canvas-base"></canvas>
            <canvas id="canvas-mask"></canvas>
            <canvas id="canvas-cursor"></canvas>
            <div class="sam-loading hidden" id="sam-loading">
              <div class="sam-spinner"></div>
              <span>AI сегменттеуде...</span>
            </div>
          </div>

          <!-- SAM control panel -->
          <div class="sam-panel hidden" id="sam-panel">
            <div class="sam-panel-row">
              <span class="sam-panel-label">Нүкте режимі:</span>
              <button class="sam-mode-btn sam-mode-positive active" id="sam-btn-positive">
                <span class="sam-mode-dot positive"></span> Қабырға
              </button>
              <button class="sam-mode-btn sam-mode-negative" id="sam-btn-negative">
                <span class="sam-mode-dot negative"></span> Еден / Төбе
              </button>
            </div>
            <div class="sam-panel-row">
              <button class="sam-action-btn" id="sam-btn-undo-point" title="Соңғы нүктені алу">↩</button>
              <button class="sam-action-btn sam-clear" id="sam-btn-clear-points" title="Барлық нүктелерді тазалау">🗑</button>
              <span class="sam-point-counter" id="sam-point-counter">—</span>
              <button class="sam-run-btn" id="sam-btn-run" disabled>▶ Сегменттеу</button>
            </div>
            <p class="sam-hint-text">🎯 Алдымен қабырғаға басыңыз (жасыл), содан кейін еден/төбеге (қызыл) — тек қабырға қалады</p>
          </div>


          <!-- Auto-segment button -->
          <div class="auto-seg-bar hidden" id="auto-seg-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(124,58,237,0.1);border-radius:10px;margin-bottom:8px;flex-wrap:wrap">
            <button class="sam-run-btn" id="btn-auto-segment" style="background:#7c3aed;padding:7px 16px;font-size:13px;border-radius:7px;border:none;color:#fff;font-weight:600;cursor:pointer">🔮 Авто сегмент</button>
            <span id="auto-seg-status" style="color:#a78bfa;font-size:12px"></span>
          </div>

          <!-- Text-prompt segmentation -->
          <div class="text-seg-bar hidden" id="text-seg-bar" style="display:none;flex-direction:column;gap:8px;padding:8px 12px;background:rgba(14,165,233,0.1);border-radius:10px;margin-bottom:8px">
            <div style="display:flex;gap:6px;align-items:center">
              <input id="text-seg-input" type="text" placeholder="roof -sky, window -wall..." style="flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:7px;padding:7px 10px;color:#fff;font-size:13px;outline:none">
              <button id="btn-text-segment" style="background:#0ea5e9;padding:7px 14px;font-size:13px;border-radius:7px;border:none;color:#fff;font-weight:600;cursor:pointer;white-space:nowrap">🔍 Табу</button>
            </div>
            <div id="text-seg-chips" style="display:flex;gap:5px;flex-wrap:wrap"></div>
            <span id="text-seg-status" style="color:#7dd3fc;font-size:12px"></span>
          </div>

          <div class="edit-footer">
            <button class="btn-secondary" id="btn-back">← Артқа</button>
            <button class="btn-primary" id="btn-apply" disabled>Қолдану ✓</button>
          </div>
        </div>
      </div>
    `;
    // Inject SAM panel styles
    if (!document.getElementById('sam-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'sam-panel-styles';
      style.textContent = `
        .sam-panel {
          background: rgba(0,0,0,0.85);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sam-panel.hidden { display: none; }
        .sam-panel-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .sam-panel-label {
          color: #ccc;
          font-size: 12px;
          font-weight: 500;
          margin-right: 4px;
        }
        .sam-mode-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          border-radius: 6px;
          border: 2px solid transparent;
          background: transparent;
          color: #aaa;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sam-mode-btn.sam-mode-positive { border-color: #4CAF50; }
        .sam-mode-btn.sam-mode-negative { border-color: #f44336; }
        .sam-mode-btn.sam-mode-positive.active {
          background: #4CAF50;
          color: #fff;
        }
        .sam-mode-btn.sam-mode-negative.active {
          background: #f44336;
          color: #fff;
        }
        .sam-mode-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .sam-mode-dot.positive { background: #4CAF50; }
        .sam-mode-dot.negative { background: #f44336; }
        .sam-mode-btn.active .sam-mode-dot { background: #fff; }
        .sam-action-btn {
          padding: 4px 10px;
          border-radius: 5px;
          border: 1.5px solid #555;
          background: transparent;
          color: #ccc;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .sam-action-btn:hover { background: rgba(255,255,255,0.1); }
        .sam-point-counter {
          color: #aaa;
          font-size: 11px;
          margin-left: auto;
          min-width: 60px;
          text-align: right;
        }
        .sam-run-btn {
          padding: 6px 16px;
          border-radius: 6px;
          border: none;
          background: #2196F3;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .sam-run-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .sam-run-btn:not(:disabled):hover {
          background: #1976D2;
        }
        .sam-hint-text {
          color: #999;
          font-size: 11px;
          margin: 0;
          line-height: 1.4;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(modal);

    // Cache refs
    els = {
      modal,
      stepUpload: modal.querySelector('#step-upload'),
      stepEdit: modal.querySelector('#step-edit'),
      dropzone: modal.querySelector('#upload-dropzone'),
      fileInput: modal.querySelector('#upload-input'),
      closeBtn: modal.querySelector('#upload-close'),
      canvasContainer: modal.querySelector('#canvas-container'),
      canvasBase: modal.querySelector('#canvas-base'),
      canvasMask: modal.querySelector('#canvas-mask'),
      canvasCursor: modal.querySelector('#canvas-cursor'),
      btnBrush: modal.querySelector('#btn-brush'),
      btnSam: modal.querySelector('#btn-sam'),
      btnEraser: modal.querySelector('#btn-eraser'),
      btnLine: modal.querySelector('#btn-line'),
      btnLineErase: modal.querySelector('#btn-lineErase'),
      btnRectErase: modal.querySelector('#btn-rectErase'),
      btnUndo: modal.querySelector('#btn-undo'),
      btnClear: modal.querySelector('#btn-clear'),
      btnBack: modal.querySelector('#btn-back'),
      btnApply: modal.querySelector('#btn-apply'),
      btnAddLayer: modal.querySelector('#btn-add-layer'),
      brushSize: modal.querySelector('#brush-size'),
      brushSizeValue: modal.querySelector('#brush-size-value'),
      maskLayers: modal.querySelector('#mask-layers'),
      samLoading: modal.querySelector('#sam-loading'),
      samPanel: modal.querySelector('#sam-panel'),
      samBtnPositive: modal.querySelector('#sam-btn-positive'),
      samBtnNegative: modal.querySelector('#sam-btn-negative'),
      samBtnUndoPoint: modal.querySelector('#sam-btn-undo-point'),
      samBtnClearPoints: modal.querySelector('#sam-btn-clear-points'),
      samBtnRun: modal.querySelector('#sam-btn-run'),
      samPointCounter: modal.querySelector('#sam-point-counter'),
      // Auto-segment
      autoSegBar: modal.querySelector('#auto-seg-bar'),
      btnAutoSegment: modal.querySelector('#btn-auto-segment'),
      // One-tap mode
      autoSegStatus: modal.querySelector('#auto-seg-status'),
      // Text-prompt segmentation
      textSegBar: modal.querySelector('#text-seg-bar'),
      textSegInput: modal.querySelector('#text-seg-input'),
      btnTextSegment: modal.querySelector('#btn-text-segment'),
      textSegChips: modal.querySelector('#text-seg-chips'),
      textSegStatus: modal.querySelector('#text-seg-status'),
    };
  }

  // ===== EVENTS =====
  function bindEvents() {
    // Open trigger (call UploadTool.open() from main app)
    els.closeBtn.addEventListener('click', close);
    els.modal.addEventListener('click', e => { if (e.target === els.modal) close(); });

    // File upload
    els.dropzone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', handleFileSelect);
    els.dropzone.addEventListener('dragover', e => { e.preventDefault(); els.dropzone.classList.add('dragover'); });
    els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('dragover'));
    els.dropzone.addEventListener('drop', handleDrop);

    // Tools
    els.btnBrush.addEventListener('click', () => setMode('brush'));
    els.btnSam.addEventListener('click', () => setMode('sam'));
    els.btnEraser.addEventListener('click', () => setMode('eraser'));
    els.btnLine.addEventListener('click', () => setMode('line'));
    els.btnLineErase.addEventListener('click', () => setMode('lineErase'));
    els.btnRectErase.addEventListener('click', () => setMode('rectErase'));

    // Brush size
    els.brushSize.addEventListener('input', e => {
      state.brushSize = parseInt(e.target.value);
      els.brushSizeValue.textContent = state.brushSize;
    });

    // Canvas drawing
    els.canvasCursor.addEventListener('mousedown', onPointerDown);
    els.canvasCursor.addEventListener('mousemove', onPointerMove);
    els.canvasCursor.addEventListener('mouseup', onPointerUp);
    els.canvasCursor.addEventListener('mouseleave', onPointerUp);
    // Touch support
    els.canvasCursor.addEventListener('touchstart', onTouchStart, { passive: false });
    els.canvasCursor.addEventListener('touchmove', onTouchMove, { passive: false });
    els.canvasCursor.addEventListener('touchend', onPointerUp);

    // SAM panel controls
    els.samBtnPositive.addEventListener('click', () => setSamPointMode(1));
    els.samBtnNegative.addEventListener('click', () => setSamPointMode(0));
    els.samBtnUndoPoint.addEventListener('click', undoSamPoint);
    els.samBtnClearPoints.addEventListener('click', clearSamPoints);
    els.samBtnRun.addEventListener('click', runSamSegmentation);

    // One-tap analysis

    // Auto-segment
    els.btnAutoSegment.addEventListener('click', runAutoSegment);

    // Text-prompt segment. "roof -sky" → prompt "roof", negative "sky"
    const runFromInput = () => {
      const raw = els.textSegInput.value.trim();
      if (!raw) return;
      const parts = raw.split('-');
      const pos = parts[0].trim();
      const neg = parts.slice(1).join(',').trim();
      if (pos) runTextSegment(pos, pos, neg, null);
    };
    els.btnTextSegment.addEventListener('click', runFromInput);
    els.textSegInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runFromInput();
    });

    // Actions
    els.btnUndo.addEventListener('click', undo);
    els.btnClear.addEventListener('click', clearMask);
    els.btnBack.addEventListener('click', goBackToUpload);
    els.btnApply.addEventListener('click', applyMasks);
    els.btnAddLayer.addEventListener('click', addMaskLayer);

    // Keyboard
    document.addEventListener('keydown', e => {
      if (!els.modal.classList.contains('active')) return;
      if (e.key === 'Escape') close();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === '[') { state.brushSize = Math.max(5, state.brushSize - 5); updateBrushUI(); }
      if (e.key === ']') { state.brushSize = Math.min(80, state.brushSize + 5); updateBrushUI(); }
    });
  }

  // ===== FILE HANDLING =====
  function handleDrop(e) {
    e.preventDefault();
    els.dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
  }

  function processFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Тек сурет файлдарын жүктеңіз (JPG, PNG)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл тым үлкен. Макс: 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        state.uploadedImage = img;
        showStep('edit');
        // Small delay so container is visible and has layout dimensions
        requestAnimationFrame(() => {
          initCanvases(img);
          setMode('brush');
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ===== CANVAS SETUP =====
  function initCanvases(img) {
    // Use original image dimensions for canvas pixel buffer
    const w = img.width;
    const h = img.height;

    [els.canvasBase, els.canvasMask, els.canvasCursor].forEach(c => {
      c.width = w;
      c.height = h;
    });

    // Draw base image at full resolution
    const ctx = els.canvasBase.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // CSS handles visual scaling (width:100%, height:auto on #canvas-base)
    // Overlay canvases are position:absolute and match via CSS width/height:100%

    // Init first mask layer
    state.masks = [{
      name: 'Қабырға 1',
      canvas: createMaskCanvas(w, h),
      color: '#FF6B6B',
    }];
    state.activeMaskIndex = 0;
    state.undoStack = [];
    // A new photo: nothing measured on the old one applies any more
    pristineByKey = {};
    roofEdge = null;
    if (window.track) track('photo_uploaded', {});
    renderLayers();
    updateApplyButton();

    // Auto-segment is always on screen (online only — it needs the API).
    // The text-search bar stays hidden; flip SHOW_TEXT_SEG to bring it back.
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    els.autoSegBar.classList.toggle('hidden', isLocal);
    els.autoSegBar.style.display = isLocal ? 'none' : 'flex';
    const showText = SHOW_TEXT_SEG && !isLocal;
    els.textSegBar.classList.toggle('hidden', !showText);
    els.textSegBar.style.display = showText ? 'flex' : 'none';

    els.autoSegStatus.textContent = '';
    els.textSegStatus.textContent = '';
    renderTextSegChips();
  }

  const SHOW_TEXT_SEG = false;

  function createMaskCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ===== DRAWING =====
  const SHAPE_MODES = ['line', 'lineErase', 'rectErase'];
  const ERASE_SHAPE_MODES = ['lineErase', 'rectErase'];

  function onPointerDown(e) {
    if (state.mode === 'sam') {
      handleSamClick(e);
      return;
    }

    // Shape modes: start drag
    if (SHAPE_MODES.includes(state.mode)) {
      const pos = getCanvasPos(e);
      state.isShaping = true;
      state.shapeStart = { x: pos.x, y: pos.y };
      saveUndoState();
      return;
    }

    if (state.mode !== 'brush' && state.mode !== 'eraser') return;

    state.isDrawing = true;
    saveUndoState();
    draw(e);
  }

  function onPointerMove(e) {
    updateCursor(e);

    // Shape preview
    if (state.isShaping && state.shapeStart) {
      drawShapePreview(e);
      return;
    }

    if (!state.isDrawing) return;
    draw(e);
  }

  function onPointerUp(e) {
    // Shape commit
    if (state.isShaping && state.shapeStart) {
      commitShape(e);
      syncPristine(state.activeMaskIndex);
      state.isShaping = false;
      state.shapeStart = null;
      updateApplyButton();
      renderMaskOverlay();
      return;
    }

    if (state.isDrawing) syncPristine(state.activeMaskIndex);
    state.isDrawing = false;
    updateApplyButton();
  }

  function onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    onPointerDown(mouseEvent);
  }

  function onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    onPointerMove(mouseEvent);
  }

  function getCanvasPos(e) {
    const rect = els.canvasCursor.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (els.canvasCursor.width / rect.width),
      y: (e.clientY - rect.top) * (els.canvasCursor.height / rect.height),
    };
  }

  function draw(e) {
    const pos = getCanvasPos(e);
    const mask = state.masks[state.activeMaskIndex];
    if (!mask) return;

    const ctx = mask.canvas.getContext('2d');
    ctx.globalCompositeOperation = state.mode === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'white';

    if (state.mode === 'eraser') {
      // Төртбұрышты өшіргіш
      const size = state.brushSize;
      ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
    } else {
      // Дөңгелек қылқалам
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, state.brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    renderMaskOverlay();
  }

  // ===== SHAPE PREVIEW (on cursor canvas while dragging) =====
  function drawShapePreview(e) {
    const pos = getCanvasPos(e);
    const ctx = els.canvasCursor.getContext('2d');
    ctx.clearRect(0, 0, els.canvasCursor.width, els.canvasCursor.height);

    const s = state.shapeStart;
    const isErase = ERASE_SHAPE_MODES.includes(state.mode);

    ctx.strokeStyle = isErase ? 'rgba(255,80,80,0.7)' : 'rgba(255,255,255,0.7)';
    ctx.fillStyle = isErase ? 'rgba(255,0,0,0.12)' : 'rgba(255,255,255,0.15)';
    ctx.setLineDash([6, 4]);

    if (state.mode === 'line' || state.mode === 'lineErase') {
      // Line preview — with brush width
      ctx.lineWidth = state.brushSize;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Start/end dots
      ctx.fillStyle = isErase ? '#f44' : '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();

    } else if (state.mode === 'rectErase') {
      // Rectangle preview — drag to resize
      const x = Math.min(s.x, pos.x);
      const y = Math.min(s.y, pos.y);
      const w = Math.abs(pos.x - s.x);
      const h = Math.abs(pos.y - s.y);

      ctx.lineWidth = 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      // Size label
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(w)}×${Math.round(h)}`, (s.x + pos.x) / 2, Math.min(s.y, pos.y) - 8);
    }

    ctx.setLineDash([]);
  }

  // ===== COMMIT SHAPE (on mouseup) =====
  function commitShape(e) {
    const pos = getCanvasPos(e);
    const mask = state.masks[state.activeMaskIndex];
    if (!mask) return;

    const ctx = mask.canvas.getContext('2d');
    const s = state.shapeStart;
    const isErase = ERASE_SHAPE_MODES.includes(state.mode);

    ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
    ctx.fillStyle = isErase ? 'rgba(0,0,0,1)' : '#ffffff';
    ctx.strokeStyle = isErase ? 'rgba(0,0,0,1)' : '#ffffff';

    if (state.mode === 'line' || state.mode === 'lineErase') {
      // Commit line with brush width
      ctx.lineWidth = state.brushSize;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

    } else if (state.mode === 'rectErase') {
      // Commit filled rectangle erase
      const x = Math.min(s.x, pos.x);
      const y = Math.min(s.y, pos.y);
      const w = Math.abs(pos.x - s.x);
      const h = Math.abs(pos.y - s.y);
      if (w > 2 && h > 2) {
        ctx.fillRect(x, y, w, h);
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    // Clear preview
    const cursorCtx = els.canvasCursor.getContext('2d');
    cursorCtx.clearRect(0, 0, els.canvasCursor.width, els.canvasCursor.height);
  }

  function updateCursor(e) {
    const pos = getCanvasPos(e);
    const ctx = els.canvasCursor.getContext('2d');
    ctx.clearRect(0, 0, els.canvasCursor.width, els.canvasCursor.height);

    if (state.mode === 'sam') {
      // Redraw existing markers first (since we clearRect above)
      redrawSamMarkers();
      // Crosshair cursor colored by current mode
      const isPos = state.samPointMode === 1;
      ctx.strokeStyle = isPos ? 'rgba(76,175,80,0.9)' : 'rgba(244,67,54,0.9)';
      ctx.lineWidth = 2;
      const size = 14;
      ctx.beginPath();
      ctx.moveTo(pos.x - size, pos.y); ctx.lineTo(pos.x + size, pos.y);
      ctx.moveTo(pos.x, pos.y - size); ctx.lineTo(pos.x, pos.y + size);
      ctx.stroke();
      // Shadow outline
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pos.x - size, pos.y); ctx.lineTo(pos.x + size, pos.y);
      ctx.moveTo(pos.x, pos.y - size); ctx.lineTo(pos.x, pos.y + size);
      ctx.stroke();
    } else if (state.mode === 'eraser') {
      // Төртбұрышты өшіргіш курсоры
      const size = state.brushSize;
      ctx.strokeStyle = 'rgba(255,100,100,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);
      // Ішіне × белгісі
      ctx.strokeStyle = 'rgba(255,100,100,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pos.x - size / 4, pos.y - size / 4);
      ctx.lineTo(pos.x + size / 4, pos.y + size / 4);
      ctx.moveTo(pos.x + size / 4, pos.y - size / 4);
      ctx.lineTo(pos.x - size / 4, pos.y + size / 4);
      ctx.stroke();
    } else if (state.mode === 'line' || state.mode === 'lineErase') {
      // Line tool — brush width preview + crosshair
      const isErase = state.mode === 'lineErase';
      ctx.strokeStyle = isErase ? 'rgba(255,80,80,0.3)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = state.brushSize;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x - 15, pos.y);
      ctx.lineTo(pos.x + 15, pos.y);
      ctx.stroke();
      // Crosshair
      ctx.strokeStyle = isErase ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x - 14, pos.y); ctx.lineTo(pos.x + 14, pos.y);
      ctx.moveTo(pos.x, pos.y - 14); ctx.lineTo(pos.x, pos.y + 14);
      ctx.stroke();
    } else if (state.mode === 'rectErase') {
      // RectErase — crosshair + dashed rect hint
      ctx.strokeStyle = 'rgba(255,80,80,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x - 14, pos.y); ctx.lineTo(pos.x + 14, pos.y);
      ctx.moveTo(pos.x, pos.y - 14); ctx.lineTo(pos.x, pos.y + 14);
      ctx.stroke();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(255,80,80,0.4)';
      ctx.strokeRect(pos.x - 20, pos.y - 15, 40, 30);
      ctx.setLineDash([]);
    } else {
      // Дөңгелек қылқалам курсоры
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, state.brushSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function renderMaskOverlay() {
    const ctx = els.canvasMask.getContext('2d');
    ctx.clearRect(0, 0, els.canvasMask.width, els.canvasMask.height);

    state.masks.forEach((mask, i) => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = els.canvasMask.width;
      tempCanvas.height = els.canvasMask.height;
      const tempCtx = tempCanvas.getContext('2d');

      // Draw mask shape
      tempCtx.drawImage(mask.canvas, 0, 0);

      // Color it
      tempCtx.globalCompositeOperation = 'source-in';
      const alpha = i === state.activeMaskIndex ? 0.45 : 0.3;
      tempCtx.fillStyle = hexToRgba(mask.color, alpha);
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      ctx.drawImage(tempCanvas, 0, 0);
    });
  }

  // ===== SAM INTEGRATION (Multi-Point with Negative) =====

  // -- Point mode toggle --
  function setSamPointMode(mode) {
    state.samPointMode = mode;
    els.samBtnPositive.classList.toggle('active', mode === 1);
    els.samBtnNegative.classList.toggle('active', mode === 0);
  }

  // -- Collect point on click (no API call yet) --
  function handleSamClick(e) {
    if (state.samLoading) return;

    const pos = getCanvasPos(e);

    // Store point with its label
    state.samPoints.push({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      label: state.samPointMode,
    });

    // Draw visual marker on cursor canvas
    addSamMarker(pos.x, pos.y, state.samPointMode);
    updateSamPointCounter();

    console.log('[SAM] Point added:', pos.x, pos.y, 'label:', state.samPointMode,
      '| Total:', state.samPoints.length);
  }

  // -- Draw marker dot on the cursor canvas --
  function addSamMarker(x, y, label) {
    const ctx = els.canvasCursor.getContext('2d');
    const isPos = label === 1;

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = isPos ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Symbol: + or −
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isPos ? '+' : '−', x, y);

    // Store marker info for redraw
    state.samMarkers.push({ x, y, label });
  }

  // -- Redraw all markers (after undo or clear) --
  function redrawSamMarkers() {
    // Only redraw markers; cursor canvas is shared, so don't clearRect the whole thing
    // We redraw all markers after a clear
    const ctx = els.canvasCursor.getContext('2d');
    ctx.clearRect(0, 0, els.canvasCursor.width, els.canvasCursor.height);
    state.samMarkers.forEach(m => {
      const isPos = m.label === 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = isPos ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isPos ? '+' : '−', m.x, m.y);
    });
  }

  // -- Update counter display --
  function updateSamPointCounter() {
    const pos = state.samPoints.filter(p => p.label === 1).length;
    const neg = state.samPoints.filter(p => p.label === 0).length;
    els.samPointCounter.textContent = pos > 0 || neg > 0
      ? `${pos} ✓  ${neg} ✕`
      : '—';
    els.samBtnRun.disabled = pos === 0; // Need at least 1 positive
  }

  // -- Undo last point --
  function undoSamPoint() {
    if (state.samPoints.length === 0) return;
    state.samPoints.pop();
    state.samMarkers.pop();
    redrawSamMarkers();
    updateSamPointCounter();
  }

  // -- Clear all points --
  function clearSamPoints() {
    state.samPoints = [];
    state.samMarkers = [];
    const ctx = els.canvasCursor.getContext('2d');
    ctx.clearRect(0, 0, els.canvasCursor.width, els.canvasCursor.height);
    updateSamPointCounter();
  }

  // -- Run segmentation with all collected points --
  async function runSamSegmentation() {
    if (state.samLoading || state.samPoints.length === 0) return;

    const hasPositive = state.samPoints.some(p => p.label === 1);
    if (!hasPositive) {
      alert('Кем дегенде 1 positive (жасыл) нүкте қойыңыз!');
      return;
    }

    // Check if running locally
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) {
      alert('AI сегменттеу тек онлайн нұсқада жұмыс істейді (Vercel).\n\nҚылқалам режимін қолданыңыз.');
      return;
    }

    state.samLoading = true;
    els.samLoading.classList.remove('hidden');
    els.samBtnRun.disabled = true;
    els.samBtnRun.textContent = '⏳ Күтіңіз...';

    try {
      // Resize image to max 1024px for speed
      const maxDim = 1024;
      const imgCanvas = document.createElement('canvas');
      let w = state.uploadedImage.width, h = state.uploadedImage.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      imgCanvas.width = w;
      imgCanvas.height = h;
      imgCanvas.getContext('2d').drawImage(state.uploadedImage, 0, 0, w, h);
      const base64 = imgCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

      // Scale all points to resized image coordinates
      const scaleToResized = w / state.uploadedImage.width;
      const apiPoints = state.samPoints.map(p => [
        Math.round(p.x * scaleToResized),
        Math.round(p.y * scaleToResized),
      ]);
      const apiLabels = state.samPoints.map(p => p.label);

      console.log('[SAM] Sending', apiPoints.length, 'points:', JSON.stringify(apiPoints), 'labels:', JSON.stringify(apiLabels), 'imgSize:', w, 'x', h);

      // Step 1: Create prediction
      const createRes = await fetch('/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, points: apiPoints, labels: apiLabels }),
      });

      const createData = await createRes.json();
      
      if (!createRes.ok || createData.error) {
        throw new Error(createData.details || createData.error || 'API error');
      }

      // If completed immediately
      if (createData.status === 'succeeded' && createData.mask) {
        saveUndoState();
        await applySamMask(createData.mask);
        clearSamPoints();
        updateApplyButton();
        return;
      }

      const predId = createData.id;
      if (!predId) throw new Error('No prediction ID returned');

      // Step 2: Poll for result (every 2 sec, max 30 tries)
      let result = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`/api/segment-poll?id=${predId}`);
        const data = await pollRes.json();
          console.log('[SAM] Poll:', data.status, data.mask || '');

        if (data.status === 'succeeded') { result = data; break; }
        if (data.status === 'failed') throw new Error(data.error || 'Сегменттеу сәтсіз');
      }

      if (!result) throw new Error('Timeout — тым ұзақ уақыт алды');

      // Apply mask and clear points
      if (result.mask) {
        saveUndoState();
        await applySamMask(result.mask);
        clearSamPoints();
        updateApplyButton();
      }
    } catch (err) {
      console.error('[SAM] Error:', err);
      alert('AI сегменттеу қатесі: ' + err.message + '\n\nҚылқалам режимін қолданыңыз.');
    } finally {
      state.samLoading = false;
      els.samLoading.classList.add('hidden');
      els.samBtnRun.textContent = '▶ Сегменттеу';
      updateSamPointCounter(); // Re-enable run btn if points remain
    }
  }

  async function applySamMask(maskData) {
    // maskData can be a URL string or an object with combined_mask
    var maskUrl = maskData;
    if (typeof maskData === 'object') {
      maskUrl = maskData.combined_mask || maskData[0] || maskData;
    }

    try {
      // Fetch mask as blob to avoid CORS issues
          console.log('[SAM] Loading mask via proxy:', maskUrl); var response = await fetch('/api/proxy-image?url=' + encodeURIComponent(maskUrl));
      var blob = await response.blob();
      var blobUrl = URL.createObjectURL(blob);

      return new Promise(function(resolve, reject) {
        var img = new Image();
        img.onload = function() {
          var mask = state.masks[state.activeMaskIndex];
          var ctx = mask.canvas.getContext('2d');

          var tempCanvas = document.createElement('canvas');
          tempCanvas.width = mask.canvas.width;
          tempCanvas.height = mask.canvas.height;
          var tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

          URL.revokeObjectURL(blobUrl);

          var imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          var maskPixels = ctx.getImageData(0, 0, mask.canvas.width, mask.canvas.height);

          for (var i = 0; i < imgData.data.length; i += 4) {
            // SAM mask: bright pixels = segmented area
            if (imgData.data[i] > 128 || imgData.data[i + 1] > 128 || imgData.data[i + 2] > 128) {
              maskPixels.data[i] = 255;
              maskPixels.data[i + 1] = 255;
              maskPixels.data[i + 2] = 255;
              maskPixels.data[i + 3] = 255;
            }
          }
          ctx.putImageData(maskPixels, 0, 0);
          syncPristine(state.activeMaskIndex);
          renderMaskOverlay();
          resolve();
        };
        img.onerror = function() {
          URL.revokeObjectURL(blobUrl);
          reject(new Error('Mask image load failed'));
        };
        img.src = blobUrl;
      });
    } catch (err) {
      console.error('[SAM] Mask load error:', err);
      throw err;
    }
  }

  // ===== MASK LAYERS =====
  function addMaskLayer() {
    if (state.masks.length >= 5) {
      alert('Макс 5 қабат');
      return;
    }
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
    const idx = state.masks.length;
    state.masks.push({
      name: `Қабырға ${idx + 1}`,
      canvas: createMaskCanvas(els.canvasBase.width, els.canvasBase.height),
      color: colors[idx % colors.length],
    });
    state.activeMaskIndex = idx;
    renderLayers();
  }

  function renderLayers() {
    const container = els.maskLayers;
    container.innerHTML = '';

    state.masks.forEach((mask, i) => {
      const div = document.createElement('div');
      div.className = `mask-layer${i === state.activeMaskIndex ? ' active' : ''}`;
      div.dataset.index = i;
      div.innerHTML = `
        <span class="layer-color" style="background:${mask.color}"></span>
        <span class="layer-name" contenteditable="true">${mask.name}</span>
        ${state.masks.length > 1 ? '<button class="layer-delete" title="Жою">&times;</button>' : ''}
      `;

      div.addEventListener('click', e => {
        if (e.target.classList.contains('layer-delete')) {
          state.masks.splice(i, 1);
          state.activeMaskIndex = Math.min(state.activeMaskIndex, state.masks.length - 1);
          renderLayers();
          renderMaskOverlay();
          return;
        }
        if (e.target.classList.contains('layer-name')) return;
        state.activeMaskIndex = i;
        renderLayers();
        renderMaskOverlay();
      });

      const nameEl = div.querySelector('.layer-name');
      nameEl.addEventListener('blur', () => { mask.name = nameEl.textContent.trim() || `Қабырға ${i + 1}`; });

      container.appendChild(div);
    });

    // Add layer button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-layer-btn';
    addBtn.textContent = '+ Қосу';
    addBtn.addEventListener('click', addMaskLayer);
    container.appendChild(addBtn);
  }

  // ===== UNDO =====
  function saveUndoState() {
    const mask = state.masks[state.activeMaskIndex];
    if (!mask) return;

    const snapshot = document.createElement('canvas');
    snapshot.width = mask.canvas.width;
    snapshot.height = mask.canvas.height;
    snapshot.getContext('2d').drawImage(mask.canvas, 0, 0);

    state.undoStack.push({ index: state.activeMaskIndex, canvas: snapshot });
    if (state.undoStack.length > state.maxUndo) state.undoStack.shift();
    els.btnUndo.disabled = false;
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    const last = state.undoStack.pop();
    const mask = state.masks[last.index];
    if (mask) {
      const ctx = mask.canvas.getContext('2d');
      ctx.clearRect(0, 0, mask.canvas.width, mask.canvas.height);
      ctx.drawImage(last.canvas, 0, 0);
      syncPristine(last.index);
      renderMaskOverlay();
    }
    els.btnUndo.disabled = state.undoStack.length === 0;
    updateApplyButton();
  }

  function clearMask() {
    const mask = state.masks[state.activeMaskIndex];
    if (!mask) return;
    saveUndoState();
    const ctx = mask.canvas.getContext('2d');
    ctx.clearRect(0, 0, mask.canvas.width, mask.canvas.height);
    syncPristine(state.activeMaskIndex);
    renderMaskOverlay();
    updateApplyButton();
  }

  // ===== MODE =====
  function setMode(mode) {
    // Clear SAM points when leaving SAM mode
    if (state.mode === 'sam' && mode !== 'sam') {
      clearSamPoints();
    }

    state.mode = mode;
    const allBtns = [els.btnBrush, els.btnSam, els.btnEraser, els.btnLine, els.btnLineErase, els.btnRectErase];
    allBtns.forEach(b => b.classList.remove('active'));

    if (mode === 'brush') els.btnBrush.classList.add('active');
    else if (mode === 'sam') els.btnSam.classList.add('active');
    else if (mode === 'eraser') els.btnEraser.classList.add('active');
    else if (mode === 'line') els.btnLine.classList.add('active');
    else if (mode === 'lineErase') els.btnLineErase.classList.add('active');
    else if (mode === 'rectErase') els.btnRectErase.classList.add('active');

    els.samPanel.classList.toggle('hidden', mode !== 'sam');

    // Cursor style
    const shapeModes = ['line', 'lineErase', 'rectErase'];
    if (mode === 'sam' || shapeModes.includes(mode)) {
      els.canvasCursor.style.cursor = 'crosshair';
    } else {
      els.canvasCursor.style.cursor = 'none';
    }

    // Reset SAM point mode to positive when entering SAM
    if (mode === 'sam') {
      setSamPointMode(1);
    }
  }

  // ===== APPLY MASKS → MAIN VISUALIZER =====
  function applyMasks() {
    // Generate mask data for main visualizer
    const masks = state.masks.map((mask, i) => {
      // Create a proper mask PNG (white on transparent)
      const c = document.createElement('canvas');
      c.width = state.uploadedImage.width;
      c.height = state.uploadedImage.height;
      const ctx = c.getContext('2d');

      // Scale mask to original image size
      ctx.drawImage(mask.canvas, 0, 0, c.width, c.height);

      return {
        name: mask.name,
        dataUrl: c.toDataURL('image/png'),
        surface: `custom_${i}`,
      };
    });

    // Get base image as data URL
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = state.uploadedImage.width;
    baseCanvas.height = state.uploadedImage.height;
    baseCanvas.getContext('2d').drawImage(state.uploadedImage, 0, 0);
    const baseDataUrl = baseCanvas.toDataURL('image/jpeg', 0.9);

    // Dispatch custom event for main visualizer to pick up
    const event = new CustomEvent('ecoline:custom-room', {
      detail: {
        baseImage: baseDataUrl,
        masks: masks,
        imageWidth: state.uploadedImage.width,
        imageHeight: state.uploadedImage.height,
      },
    });
    window.dispatchEvent(event);

    close();
  }

  // ===== NAVIGATION =====
  function showStep(step) {
    els.stepUpload.classList.toggle('hidden', step !== 'upload');
    els.stepEdit.classList.toggle('hidden', step !== 'edit');
  }

  function goBackToUpload() {
    state.uploadedImage = null;
    state.masks = [];
    state.undoStack = [];
    state.samPoints = [];
    state.samMarkers = [];
    els.fileInput.value = '';
    showStep('upload');
  }

  function open() {
    els.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    showStep('upload');
  }

  function close() {
    els.modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // ===== HELPERS =====
  function updateBrushUI() {
    els.brushSize.value = state.brushSize;
    els.brushSizeValue.textContent = state.brushSize;
  }

  function updateApplyButton() {
    const hasMask = state.masks.some(m => {
      const ctx = m.canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, m.canvas.width, m.canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return true;
      }
      return false;
    });
    els.btnApply.disabled = !hasMask;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ===== AUTO-SEGMENTATION (SegFormer ADE20K) =====
  // Output: [{label: "wall", mask: "https://...", score: 0.95}, ...]
  const SEG_LABELS = {
    // Interior
    wall:    { label: 'Қабырға', btnColor: '#6366f1' },
    ceiling: { label: 'Төбе',    btnColor: '#f59e0b' },
    floor:   { label: 'Еден',    btnColor: '#10b981' },
    rug:     { label: 'Кілем',   btnColor: '#8b5cf6' },
    // Exterior — ADE20K has no separate roof or socle class,
    // so the model returns the house as one piece. Refine with SAM.
    building: { label: 'Фасад',   btnColor: '#0ea5e9' },
    house:    { label: 'Фасад',   btnColor: '#0ea5e9' },
    skyscraper: { label: 'Фасад', btnColor: '#0ea5e9' },
    hovel:    { label: 'Құрылыс', btnColor: '#84cc16' },
    fence:    { label: 'Қоршау',  btnColor: '#a855f7' },
    door:     { label: 'Есік',    btnColor: '#f43f5e' },
    windowpane: { label: 'Терезе', btnColor: '#06b6d4' },
    stairs:   { label: 'Баспалдақ', btnColor: '#eab308' },
  };
  let autoSegMasks = {};
  /* Untouched copy of each broad layer (wall, facade) as the model gave it,
     before any other layer was carved out of it. Geometric layers — roof,
     skirting — re-cut the broad layer from this copy on every slider move. */
  let pristineByKey = {};

  async function runAutoSegment(opts) {
    const quiet = opts && opts.silent;
    if (!state.uploadedImage) { alert('Алдымен фото жүктеңіз!'); return; }

    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) { alert('Авто-сегменттеу тек онлайн нұсқада жұмыс істейді (Vercel).'); return; }

    els.btnAutoSegment.disabled = true;
    els.btnAutoSegment.textContent = '⏳ Күтіңіз...';
    els.autoSegStatus.textContent = 'Сегменттеуде...';

    try {
      // 1) Resize image (model is native 640×640 — smaller = faster)
      const maxDim = 768;
      const imgCanvas = document.createElement('canvas');
      let w = state.uploadedImage.width, h = state.uploadedImage.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      imgCanvas.width = w;
      imgCanvas.height = h;
      imgCanvas.getContext('2d').drawImage(state.uploadedImage, 0, 0, w, h);
      const base64 = imgCanvas.toDataURL('image/jpeg', 0.85);

      // 2) Create prediction
      const createRes = await fetch('/api/auto-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 })
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'API error');
      const predId = createData.id;
      if (!predId) throw new Error('No prediction ID');
      console.log('[AutoSeg] prediction:', predId);

      // 3) Poll for result (max 5 min — b5 model cold start can be slow)
      let segments = null;
      const MAX_POLLS = 100; // 100 × 3s = 5 min
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch('/api/auto-segment-poll?id=' + predId);
        const data = await pollRes.json();

        console.log(`[AutoSeg] Poll ${i + 1}: ${data.status}`);

        // Show human-readable status
        const statusText = data.status === 'starting' ? 'Модель іске қосылуда'
          : data.status === 'processing' ? 'Өңделуде'
          : data.status || '...';
        const elapsed = Math.round((i + 1) * 3);
        els.autoSegStatus.textContent = `⏳ ${statusText} (${elapsed}с)`;

        if (data.status === 'succeeded') {
          segments = data.output; // [{label, mask, score}, ...]
          console.log('[AutoSeg] Raw output:', segments);
          break;
        }
        if (data.status === 'failed' || data.status === 'canceled') {
          throw new Error(data.error || 'Prediction ' + data.status);
        }
      }
      if (!segments) throw new Error('Timeout — 5 минут өтті. Модель баяу іске қосылуда, қайта көріңіз.');

      // 4) Filter wall/ceiling/floor from output
      autoSegMasks = {};
      pristineByKey = {};
      roofEdge = null;
      const oldRoofCtl = document.getElementById('roofCtl');
      if (oldRoofCtl) oldRoofCtl.remove();
      if (Array.isArray(segments)) {
        for (const seg of segments) {
          const key = seg.label?.toLowerCase();
          if (SEG_LABELS[key] && seg.mask) {
            const maskVal = seg.mask;
            autoSegMasks[key] = {
              maskUrl: maskVal,
              score: (typeof seg.score === 'number') ? (seg.score * 100).toFixed(0) : null
            };
            console.log(`[AutoSeg] Found: ${key} | mask type: ${typeof maskVal} | starts: ${String(maskVal).slice(0, 40)}`);
          }
        }
      }

      console.log('[AutoSeg] Total segments:', segments?.length, '| Matched:', Object.keys(autoSegMasks));

      // 5) Show picker UI
      showAutoSegPicker();

      // Exterior shots need SAM for roof and socle — the model can't split them
      const isFacade = ['building', 'house', 'skyscraper', 'hovel']
        .some(k => autoSegMasks[k]);

      if (!quiet) {
        els.autoSegStatus.textContent = isFacade
          ? 'ℹ️ Шатыр мен цоколь үшін SAM нүктелерін қолданыңыз'
          : '✅ Дайын!';
      }
      els.btnAutoSegment.textContent = '🔮 Қайта сегмент';

    } catch (err) {
      console.error('[AutoSeg] Error:', err);
      if (!quiet) {
        alert('Авто-сегменттеу қатесі: ' + err.message);
        els.autoSegStatus.textContent = '❌ Қате';
      } else {
        throw err;
      }
    } finally {
      els.btnAutoSegment.disabled = false;
    }
  }

  function showAutoSegPicker() {
    const old = document.getElementById('autoSegPicker');
    if (old) old.remove();

    const picker = document.createElement('div');
    picker.id = 'autoSegPicker';
    picker.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';

    const found = Object.keys(autoSegMasks).length > 0;
    if (!found) {
      picker.innerHTML = '<span style="color:#f87171;font-size:12px">Беткей табылмады</span>';
    } else {
      for (const [key, info] of Object.entries(autoSegMasks)) {
        const meta = SEG_LABELS[key];
        if (!meta) continue;
        const btn = document.createElement('button');
        btn.textContent = info.score && info.score !== '?'
          ? `${meta.label} (${info.score}%)`
          : meta.label;
        btn.style.cssText = `background:${meta.btnColor};color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;`;
        btn.addEventListener('click', () => applyAutoSegMask(key));
        picker.appendChild(btn);
      }
      /* Skirting isn't a class any model knows — it's derived from the
         bottom edge of the surface mask, where the board always sits.
         Outdoors the same geometry gives the socle at the base of a house. */
      const baseKey = ['wall', 'building', 'house', 'skyscraper', 'hovel']
        .find(k => autoSegMasks[k]);
      if (baseKey) {
        const outdoor = baseKey !== 'wall';
        const sk = document.createElement('button');
        sk.textContent = outdoor ? 'Цоколь' : 'Плинтус';
        sk.style.cssText = 'background:#ec4899;color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;';
        sk.addEventListener('click', () => buildSkirting(baseKey, outdoor));
        picker.appendChild(sk);
      }
      /* No model here knows "roof" either — it is the part of the building
         above the eaves line, which the photo shows as a long straight edge */
      const roofBaseKey = ['building', 'house', 'skyscraper', 'hovel'].find(k => autoSegMasks[k]);
      if (roofBaseKey) {
        const rb = document.createElement('button');
        rb.textContent = 'Шатыр (карниз)';
        rb.style.cssText = 'background:#f97316;color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;';
        rb.addEventListener('click', () => buildRoofFromEaves(roofBaseKey));
        picker.appendChild(rb);
      }
    }
    els.autoSegBar.appendChild(picker);
  }

  /* The model's boundary is approximate: it lands within a few pixels of
     where the wall really meets the ceiling. The photo knows better — there
     is a real brightness step at that line. For each column we look a short
     distance above and below the mask edge, find the strongest step, and
     move the edge there. Closer candidates are favoured so a distant, even
     stronger edge (a picture frame, say) doesn't drag the line away. */
  function snapMaskToPhotoEdges(mData, photo, w, h) {
    const R = Math.max(4, Math.round(h * 0.02));

    const lum = (x, y) => {
      const p = (y * w + x) * 4;
      return (photo[p] * 299 + photo[p + 1] * 587 + photo[p + 2] * 114) / 1000;
    };

    const findEdge = (fromTop) => {
      const raw = new Int32Array(w).fill(-1);
      for (let x = 0; x < w; x++) {
        if (fromTop) {
          for (let y = 0; y < h; y++) if (mData[(y * w + x) * 4 + 3] > 0) { raw[x] = y; break; }
        } else {
          for (let y = h - 1; y >= 0; y--) if (mData[(y * w + x) * 4 + 3] > 0) { raw[x] = y; break; }
        }
      }

      const snapped = new Int32Array(w).fill(-1);
      for (let x = 0; x < w; x++) {
        const e = raw[x];
        if (e <= R || e >= h - R - 1) { snapped[x] = e; continue; }
        let best = e, bestScore = 0;
        for (let d = -R; d <= R; d++) {
          const y = e + d;
          const step = Math.abs(lum(x, y + 1) - lum(x, y - 1));
          const near = 1 - Math.abs(d) / (R + 1) * 0.45;
          const score = step * near;
          if (score > bestScore) { bestScore = score; best = y; }
        }
        // Ignore a flat area — no real edge to snap to
        snapped[x] = bestScore > 6 ? best : e;
      }

      // Median smoothing keeps the line straight across noisy columns
      const out = Int32Array.from(snapped);
      const RS = Math.max(3, Math.round(w * 0.02));
      const buf = [];
      for (let x = 0; x < w; x++) {
        if (snapped[x] < 0) continue;
        buf.length = 0;
        for (let k = -RS; k <= RS; k++) {
          const v = snapped[x + k];
          if (v !== undefined && v >= 0) buf.push(v);
        }
        if (buf.length < 3) continue;
        buf.sort((a, b) => a - b);
        out[x] = buf[buf.length >> 1];
      }

      /* Where a wall meets a ceiling or a floor the real boundary is a
         straight line — perspective tilts it, but never bends it. Fit a
         line and pull the edge onto it, harder the wavier it started. */
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let x = 0; x < w; x++) {
        if (out[x] < 0) continue;
        n++; sx += x; sy += out[x]; sxx += x * x; sxy += x * out[x];
      }
      if (n > w * 0.4) {
        const den = n * sxx - sx * sx;
        if (Math.abs(den) > 1e-6) {
          const slope = (n * sxy - sx * sy) / den;
          const icpt = (sy - slope * sx) / n;
          let dev = 0, dn = 0;
          for (let x = 0; x < w; x++) {
            if (out[x] < 0) continue;
            dev += Math.abs(out[x] - (slope * x + icpt)); dn++;
          }
          const mad = dev / Math.max(1, dn);
          // A corner between two walls is genuinely bent — don't flatten it
          if (mad < h * 0.06) {
            const pull = Math.min(0.9, mad / (h * 0.015));
            for (let x = 0; x < w; x++) {
              if (out[x] < 0) continue;
              out[x] = Math.round(out[x] * (1 - pull) + (slope * x + icpt) * pull);
            }
          }
        }
      }
      return { raw, out };
    };

    const top = findEdge(true);
    const bot = findEdge(false);

    // Redraw each column between its corrected top and bottom
    for (let x = 0; x < w; x++) {
      if (top.raw[x] < 0) continue;
      const t = top.out[x], b = bot.out[x];
      if (t < 0 || b < 0 || b <= t) continue;
      for (let y = 0; y < h; y++) {
        const p = (y * w + x) * 4;
        const inside = y >= t && y <= b;
        const wasInside = mData[p + 3] > 0;
        // Only fill gaps the original mask also covered somewhere in between,
        // so holes (a door inside the wall) stay holes
        if (inside && !wasInside) {
          const nearEdge = y < top.raw[x] || y > bot.raw[x];
          if (!nearEdge) continue;
        }
        const v = inside ? 255 : 0;
        mData[p] = v; mData[p + 1] = v; mData[p + 2] = v;
        mData[p + 3] = inside ? 255 : 0;
      }
    }
  }

  // ===== SHARED: RE-CUT A BROAD LAYER =====
  /* A broad layer (wall, facade) is rebuilt from its untouched copy minus
     every other layer, each time a geometric layer (skirting, roof) moves.
     Rebuilding from the copy keeps a slider drag from eating further into
     the wall on every move; subtracting all layers — not only the one that
     moved — keeps the roof and the skirting from undoing each other's cut. */
  function recutBaseLayer(baseKey) {
    const meta = SEG_LABELS[baseKey];
    const baseName = meta ? meta.label : 'Қабырға';
    const bi = state.masks.findIndex(mk => mk.name === baseName);
    if (bi === -1) return;
    const c = state.masks[bi].canvas, w = c.width, h = c.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const pr = pristineByKey[baseKey];
    if (!pr || pr.width !== w || pr.height !== h) pristineByKey[baseKey] = ctx.getImageData(0, 0, w, h);
    const out = new ImageData(new Uint8ClampedArray(pristineByKey[baseKey].data), w, h);
    for (let li = 0; li < state.masks.length; li++) {
      if (li === bi || !state.masks[li].name) continue;
      const o = state.masks[li].canvas.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, w, h).data;
      for (let i = 3; i < o.length; i += 4) {
        if (o[i] > 0) {
          out.data[i - 3] = 0; out.data[i - 2] = 0;
          out.data[i - 1] = 0; out.data[i] = 0;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  /* A layer is about to be dropped after carving (the facade windows).
     Take its pixels out of the pristine copies too, otherwise the next
     re-cut would hand them back to the facade. */
  function bakeIntoPristine(idx) {
    const m = state.masks[idx];
    if (!m) return;
    const d = m.canvas.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, m.canvas.width, m.canvas.height).data;
    for (const key of Object.keys(pristineByKey)) {
      const p = pristineByKey[key].data;
      if (p.length !== d.length) continue;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 0) { p[i - 3] = 0; p[i - 2] = 0; p[i - 1] = 0; p[i] = 0; }
      }
    }
  }

  /* The person just edited a layer by hand (or undid a step). If it is a
     broad layer with a pristine copy, that copy is now stale — rebuild it as what they see
     plus whatever the roof and the skirting currently cover, so the next
     slider move keeps their brush strokes instead of reverting them. */
  function syncPristine(idx) {
    const m = state.masks[idx];
    if (!m || !m.name) return;
    /* Edited the roof or the skirting itself (or undid it): what they
       gave up goes back to the facade, what they took leaves it */
    if (m.name === ROOF_NAME && roofKey) { recutBaseLayer(roofKey); return; }
    if (m.name === skirtName && skirtEdge) { recutBaseLayer(skirtBaseKey); return; }
    const key = Object.keys(pristineByKey)
      .find(k => SEG_LABELS[k] && SEG_LABELS[k].label === m.name);
    if (!key) return;
    const w = m.canvas.width, h = m.canvas.height;
    const cur = m.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    const old = pristineByKey[key].data;
    for (const name of [ROOF_NAME, skirtName]) {
      const gi = state.masks.findIndex(mk => mk.name === name);
      if (gi === -1 || gi === idx) continue;
      const g = state.masks[gi].canvas.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, w, h).data;
      for (let i = 3; i < g.length; i += 4) {
        if (g[i] > 0 && old[i] > 0) {
          cur.data[i - 3] = 255; cur.data[i - 2] = 255;
          cur.data[i - 1] = 255; cur.data[i] = 255;
        }
      }
    }
    pristineByKey[key] = cur;
  }

  // ===== ROOF FROM THE EAVES LINE (geometric, no model call) =====
  /* ADE20K has no roof class — its "building" is the whole house, roof
     included. The roof is the part of that mask above the eaves, and the
     eaves are a long straight edge in the photo: a shadow under the
     overhang and a change of material. Find that edge, take everything
     above it. One slider moves the line if it landed on the wrong side
     of the shadow. */
  const ROOF_NAME = 'Шатыр';
  const ROOF_COLOR = '#f97316';
  let roofEdge = null, roofKey = null, roofShift = 0;
  let roofBase = null, roofBlocked = null, roofBaseCount = 0;

  /* Finds the line where the roof meets the wall — the eaves.
     Column by column inside the building mask, look in the upper part for
     the row with the strongest change between the band of pixels above it
     and the band below it. The eaves throw a shadow onto the wall and the
     roof is a different material from the render, so that step is usually
     the strongest one. Bands are ~1% of the height, which averages away
     the rows of tiles. Then fit either one straight line (eaves seen from
     the long side) or a ∧ of two lines (a gable end facing the camera)
     with RANSAC, so window heads, gutters and tile rows that don't line up
     across the house are simply outvoted.
     photo: RGBA pixels; base, blocked: one byte per pixel (1 = inside).
     Pure function, no DOM. Returns { edge, kind, coverage } or null. */
  function findEavesLine(photo, base, blocked, w, h) {
    const k = Math.max(3, Math.round(h * 0.012));
    const stepX = Math.max(1, Math.round(w / 400));
    const L = new Float64Array(h + 1), A = new Float64Array(h + 1), B = new Float64Array(h + 1);
    const runUp = new Int32Array(h), runDn = new Int32Array(h);
    const cands = [];
    let cols = 0, minX = w, maxX = -1;

    for (let x = 1; x < w - 1; x += stepX) {
      let top = -1, bot = -1;
      for (let y = 0; y < h; y++) if (base[y * w + x]) { top = y; break; }
      if (top < 0) continue;
      for (let y = h - 1; y > top; y--) if (base[y * w + x]) { bot = y; break; }
      const H = bot - top;
      if (H < h * 0.1) continue;
      cols++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;

      // Running sums down the column (three columns wide, to calm noise):
      // brightness plus two colour-opponent channels
      for (let y = 0; y < h; y++) {
        let l = 0, a = 0, b = 0;
        for (let dx = -1; dx <= 1; dx++) {
          const p = (y * w + x + dx) * 4;
          const r = photo[p], g = photo[p + 1], bl = photo[p + 2];
          l += 0.299 * r + 0.587 * g + 0.114 * bl;
          a += r - g;
          b += (r + g) / 2 - bl;
        }
        L[y + 1] = L[y] + l / 3; A[y + 1] = A[y] + a / 3; B[y + 1] = B[y] + b / 3;
      }

      /* How many clean facade rows run up / down from each row before a
         window, a door or a hole — the averaging bands must stop there, or
         dark glass just below a painted belt makes the belt look like a
         change of material */
      for (let y = 0; y < h; y++) {
        const ok = base[y * w + x] && !blocked[y * w + x];
        runUp[y] = ok ? (y > 0 ? runUp[y - 1] + 1 : 1) : 0;
      }
      for (let y = h - 1; y >= 0; y--) {
        const ok = base[y * w + x] && !blocked[y * w + x];
        runDn[y] = ok ? (y < h - 1 ? runDn[y + 1] + 1 : 1) : 0;
      }

      // The eaves are never right at the ridge and never near the ground
      const y0 = top + Math.max(k, Math.round(H * 0.04));
      const y1 = Math.min(bot - k, top + Math.round(H * 0.75));
      if (y1 <= y0) continue;
      const sc = new Float32Array(y1 - y0 + 1);
      for (let y = y0; y <= y1; y++) {
        if (!base[y * w + x]) continue;
        // A window head or a door top is a strong edge too — not the eaves.
        // Holes already cut out of the facade count the same way
        if (runUp[y - 1] < k || runDn[y + 1] < k) continue;
        // Mean of rows [y-n, y) minus mean of rows (y, y+n], per channel
        const step = (n) => {
          const u = Math.min(n, runUp[y - 1]), d = Math.min(n, runDn[y + 1]);
          const dl = (L[y] - L[y - u]) / u - (L[y + d + 1] - L[y + 1]) / d;
          const da = (A[y] - A[y - u]) / u - (A[y + d + 1] - A[y + 1]) / d;
          const db = (B[y] - B[y - u]) / u - (B[y + d + 1] - B[y + 1]) / d;
          return Math.abs(dl) + 0.6 * (Math.abs(da) + Math.abs(db));
        };
        /* Two scales. The short one places the line precisely; the long one
           asks whether the material really changes here. A painted belt or
           a floor band is the same render above and below, so over a wide
           band it averages out, while roof-above-wall does not. */
        const s = Math.min(step(k), step(k * 5));
        // The eaves are the highest long line on a house — prefer higher rows
        sc[y - y0] = s * (1 - 0.4 * (y - top) / H);
      }

      // Local maxima, the four strongest per column
      const peaks = [];
      for (let j = 0; j < sc.length; j++) {
        const s = sc[j];
        if (s < 8) continue;
        let isMax = true;
        for (let d = -k; d <= k; d++) {
          if (d && sc[j + d] > s) { isMax = false; break; }
        }
        if (isMax) peaks.push({ x, y: y0 + j, s });
      }
      peaks.sort((p, q) => q.s - p.s);
      for (let j = 0; j < Math.min(4, peaks.length); j++) cands.push(peaks[j]);
    }

    if (cands.length < 15 || cols < 10) return null;

    const tol = Math.max(3, h * 0.012);
    let seed = 1234567;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    const any = () => cands[Math.floor(rnd() * cands.length)];
    /* Votes are capped: a line every column agrees on beats a very
       contrasty one (a row of dark windows) that only half the columns see */
    for (const c of cands) c.v = Math.min(1, c.s / 30);
    const support = (f) => {
      let s = 0;
      for (const c of cands) if (Math.abs(c.y - f(c.x)) < tol) s += c.v;
      return s;
    };
    const through = (p, q) => {
      const m = (q.y - p.y) / (q.x - p.x);
      return { m, c: p.y - m * p.x };
    };
    const span = maxX - minX;

    // One straight line — perspective may tilt it, but not much
    let line = null, lineS = 0;
    for (let it = 0; it < 500; it++) {
      const p = any(), q = any();
      if (Math.abs(q.x - p.x) < span * 0.1) continue;
      const l = through(p, q);
      if (Math.abs(l.m) > 0.5) continue;
      const s = support(x => l.m * x + l.c);
      if (s > lineS) { lineS = s; line = l; }
    }

    // A ∧: left side climbs to the apex, right side falls away from it
    let gable = null, gableS = 0;
    for (let it = 0; it < 1500; it++) {
      const pts = [any(), any(), any(), any()].sort((a, b) => a.x - b.x);
      if (pts[1].x - pts[0].x < span * 0.05 || pts[3].x - pts[2].x < span * 0.05) continue;
      const lf = through(pts[0], pts[1]), rt = through(pts[2], pts[3]);
      if (lf.m > -0.08 || rt.m < 0.08 || lf.m < -2.5 || rt.m > 2.5) continue;
      const xa = (rt.c - lf.c) / (lf.m - rt.m);
      if (xa < pts[1].x || xa > pts[2].x) continue;
      const s = support(x => Math.max(lf.m * x + lf.c, rt.m * x + rt.c));
      if (s > gableS) { gableS = s; gable = { lf, rt, xa }; }
    }

    // The ∧ has more freedom, so it has to win clearly
    const isGable = gable && gableS > lineS * 1.2;
    if (!isGable && !line) return null;
    const rough = isGable
      ? x => Math.max(gable.lf.m * x + gable.lf.c, gable.rt.m * x + gable.rt.c)
      : x => line.m * x + line.c;

    const inl = cands.filter(c => Math.abs(c.y - rough(c.x)) < tol);
    const coverage = new Set(inl.map(c => c.x)).size / cols;
    // Fewer than half the columns agree — no clear eaves line (a flat roof, a
    // parapet); better to say so than to cut the facade along a window row
    if (coverage < 0.5) return null;

    // Least-squares on the inliers for the final position
    const fit = (pts) => {
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const c of pts) { n++; sx += c.x; sy += c.y; sxx += c.x * c.x; sxy += c.x * c.y; }
      const den = n * sxx - sx * sx;
      if (n < 3 || Math.abs(den) < 1e-6) return null;
      const m = (n * sxy - sx * sy) / den;
      return { m, c: (sy - m * sx) / n };
    };
    let edgeAt;
    if (isGable) {
      const lf = fit(inl.filter(c => c.x < gable.xa)) || gable.lf;
      const rt = fit(inl.filter(c => c.x >= gable.xa)) || gable.rt;
      edgeAt = x => Math.max(lf.m * x + lf.c, rt.m * x + rt.c);
    } else {
      const l = fit(inl) || line;
      edgeAt = x => l.m * x + l.c;
    }

    const edge = new Int32Array(w);
    for (let x = 0; x < w; x++) edge[x] = Math.max(0, Math.min(h - 1, Math.round(edgeAt(x))));
    return { edge, kind: isGable ? 'gable' : 'line', coverage };
  }

  // Rebuild the building pixels the roof is taken from (after a re-segment)
  function refreshRoofBase() {
    const pr = roofKey && pristineByKey[roofKey];
    if (!pr) return;
    const d = pr.data, n = d.length >> 2;
    if (!roofBase || roofBase.length !== n) roofBase = new Uint8Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const on = d[i * 4 + 3] > 0 ? 1 : 0;
      roofBase[i] = on; count += on;
    }
    roofBaseCount = count;
  }

  async function buildRoofFromEaves(baseKey, opts) {
    const quiet = opts && opts.silent;
    const say = (t) => { els.autoSegStatus.textContent = t; };
    if (!['building', 'house', 'skyscraper', 'hovel'].includes(baseKey) || !autoSegMasks[baseKey]) {
      return false;
    }
    say('⏳ Карниз сызығы ізделуде...');

    try {
      const baseName = SEG_LABELS[baseKey].label;
      if (state.masks.findIndex(mk => mk.name === baseName) === -1) await applyAutoSegMask(baseKey);
      const bi = state.masks.findIndex(mk => mk.name === baseName);
      if (bi === -1) return false;

      const w = els.canvasBase.width, h = els.canvasBase.height;
      if (!pristineByKey[baseKey]) {
        pristineByKey[baseKey] = state.masks[bi].canvas
          .getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
      }
      roofKey = baseKey;
      refreshRoofBase();

      // Windows, doors, socle — anything already on its own layer
      const blocked = new Uint8Array(w * h);
      for (let li = 0; li < state.masks.length; li++) {
        const m = state.masks[li];
        if (li === bi || !m.name || m.name === ROOF_NAME) continue;
        const d = m.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        for (let i = 0; i < blocked.length; i++) if (d[i * 4 + 3] > 0) blocked[i] = 1;
      }
      roofBlocked = blocked;

      const photo = els.canvasBase.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, w, h).data;
      const t0 = performance.now();
      const res = findEavesLine(photo, roofBase, blocked, w, h);
      if (!res) {
        roofEdge = null;
        say('⚠ Карниз сызығы табылмады — шатырды қолмен белгілеңіз');
        return false;
      }

      roofEdge = res.edge;
      const share = drawRoof(0, true);
      if (!share) {
        roofEdge = null;
        say('⚠ Карниз сызығы сенімсіз — шатырды қолмен белгілеңіз');
        return false;
      }
      console.log(`[Roof] eaves: ${res.kind}, ${(res.coverage * 100).toFixed(0)}% of columns agree, ` +
        `roof = ${(share * 100).toFixed(0)}% of building, ${Math.round(performance.now() - t0)}ms`);
      showRoofSlider(h);
      if (!quiet) say('✅ Шатыр — карниз сызығын слайдермен реттеңіз');
      return true;

    } catch (err) {
      console.error('[Roof]', err);
      roofEdge = null;
      say('❌ Шатыр қатесі');
      return false;
    }
  }

  /* shift moves the eaves line down (+) or up (−). On the first draw
     (validate) a roof that is a sliver or most of the house means the line
     is wrong — better no layer than one the person then has to undo. */
  function drawRoof(shift, validate) {
    if (!roofEdge || !roofBase) return 0;
    roofShift = shift;
    const w = els.canvasBase.width, h = els.canvasBase.height;
    if (roofBase.length !== w * h) return 0;
    const out = new Uint8ClampedArray(w * h * 4);
    let n = 0;
    for (let x = 0; x < w; x++) {
      const lim = Math.min(h, roofEdge[x] + shift);
      for (let y = 0; y < lim; y++) {
        const i = y * w + x;
        if (!roofBase[i] || (roofBlocked && roofBlocked[i])) continue;
        const p = i * 4;
        out[p] = 255; out[p + 1] = 255; out[p + 2] = 255; out[p + 3] = 255;
        n++;
      }
    }
    const share = n / Math.max(1, roofBaseCount);
    if (validate && (share < 0.04 || share > 0.65)) {
      console.log(`[Roof] rejected — roof would be ${(share * 100).toFixed(0)}% of the building`);
      return 0;
    }

    let idx = state.masks.findIndex(mk => mk.name === ROOF_NAME);
    if (idx === -1) {
      const empty = findEmptyLayerIndex();
      if (empty !== -1) {
        state.masks[empty].name = ROOF_NAME;
        state.masks[empty].color = ROOF_COLOR;
        idx = empty;
      } else {
        if (state.masks.length >= 5) {
          alert('Макс 5 қабат. Бұрынғы қабатты өшіріңіз.');
          return 0;
        }
        state.masks.push({ name: ROOF_NAME, canvas: createMaskCanvas(w, h), color: ROOF_COLOR });
        idx = state.masks.length - 1;
      }
    }
    state.activeMaskIndex = idx;
    if (validate) saveUndoState();

    const ctx = state.masks[idx].canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(new ImageData(out, w, h), 0, 0);

    // The facade gives the roof its pixels back or takes them, as the line moves
    recutBaseLayer(roofKey);

    renderLayers();
    renderMaskOverlay();
    updateApplyButton();
    return Math.max(share, 1e-6);
  }

  function showRoofSlider(h) {
    const old = document.getElementById('roofCtl');
    if (old) old.remove();

    const lim = Math.round(h * 0.15);
    const box = document.createElement('div');
    box.id = 'roofCtl';
    box.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;padding:8px 10px;background:rgba(249,115,22,0.08);border-radius:8px;';

    const lb = document.createElement('span');
    lb.textContent = 'Карниз';
    lb.style.cssText = 'color:#fdba74;font-size:11px;min-width:62px;';
    const sl = document.createElement('input');
    sl.type = 'range'; sl.min = -lim; sl.max = lim; sl.value = 0;
    sl.style.cssText = 'flex:1;accent-color:#f97316;';
    const num = document.createElement('span');
    num.textContent = '0px';
    num.style.cssText = 'color:#fed7aa;font-size:11px;min-width:38px;text-align:right;';
    sl.addEventListener('input', () => {
      num.textContent = sl.value + 'px';
      drawRoof(parseInt(sl.value, 10), false);
    });

    box.append(lb, sl, num);
    els.autoSegBar.appendChild(box);
  }

  // ===== SKIRTING (geometric, no model call) =====
  let skirtEdge = null, skirtW = 0, skirtH = 0;
  let skirtDoor = null;   // door mask, so the strip skips door frames
  let skirtWall = null;   // wall mask, so the strip stays behind furniture
  let skirtBand = 0, skirtShift = 0;  // current slider values, for re-cutting
  let skirtName = 'Плинтус', skirtBaseKey = 'wall';

  async function buildSkirting(baseKey, outdoor) {
    skirtBaseKey = baseKey || 'wall';
    skirtName = outdoor ? 'Цоколь' : 'Плинтус';
    if (!autoSegMasks[skirtBaseKey]) return;
    els.autoSegStatus.textContent = `⏳ ${skirtName} есептелуде...`;

    try {
      const w = els.canvasBase.width, h = els.canvasBase.height;
      skirtW = w; skirtH = h;

      const wallImg = await loadMaskImage(autoSegMasks[skirtBaseKey].maskUrl);
      const wc = document.createElement('canvas');
      wc.width = w; wc.height = h;
      const wCtx = wc.getContext('2d', { willReadFrequently: true });
      wCtx.drawImage(wallImg, 0, 0, w, h);
      const wData = wCtx.getImageData(0, 0, w, h).data;
      skirtWall = wData;

      /* A door frame reaches the floor too, so without this the strip would
         run straight across the bottom of the door. */
      skirtDoor = null;
      if (autoSegMasks.door) {
        const dImg = await loadMaskImage(autoSegMasks.door.maskUrl);
        const dc = document.createElement('canvas');
        dc.width = w; dc.height = h;
        const dCtx = dc.getContext('2d', { willReadFrequently: true });
        dCtx.drawImage(dImg, 0, 0, w, h);
        skirtDoor = dCtx.getImageData(0, 0, w, h).data;
      }

      // Bottom-most wall pixel per column, ignoring single-pixel noise
      const bottoms = new Int32Array(w).fill(-1);
      for (let x = 0; x < w; x++) {
        for (let y = h - 1; y >= 2; y--) {
          if (wData[(y * w + x) * 4] > 128 &&
              wData[((y - 1) * w + x) * 4] > 128 &&
              wData[((y - 2) * w + x) * 4] > 128) { bottoms[x] = y; break; }
        }
      }

      /* A skirting board meets the floor, so the edge should sit low in the
         frame and run roughly level. Columns above a doorway report the top
         of the door frame as their "bottom" — drop those. */
      const valid = Array.from(bottoms).filter(v => v > 0).sort((a, b) => a - b);
      if (!valid.length) { els.autoSegStatus.textContent = '⚠ Шекара табылмады'; return; }
      const floorLine = valid[Math.floor(valid.length * 0.75)];
      const tolerance = h * 0.15;
      for (let x = 0; x < w; x++) {
        if (bottoms[x] > 0 && bottoms[x] < floorLine - tolerance) bottoms[x] = -1;
      }

      // Median smoothing — the mask edge is jagged at this scale
      const R = Math.max(3, Math.round(w * 0.035));
      const sm = new Int32Array(w).fill(-1);
      const buf = [];
      for (let x = 0; x < w; x++) {
        buf.length = 0;
        for (let k = -R; k <= R; k++) {
          const v = bottoms[x + k];
          if (v !== undefined && v > 0) buf.push(v);
        }
        if (buf.length < 3) continue;
        buf.sort((a, b) => a - b);
        sm[x] = buf[buf.length >> 1];
      }

      /* Grass, shadows and paving stones nibble at the mask's lower edge,
         leaving a wavy line where the real base of the wall is straight.
         Fit a line through the smoothed points and pull outliers onto it. */
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let x = 0; x < w; x++) {
        if (sm[x] <= 0) continue;
        n++; sx += x; sy += sm[x]; sxx += x * x; sxy += x * sm[x];
      }
      if (n > w * 0.3) {
        const denom = n * sxx - sx * sx;
        if (Math.abs(denom) > 1e-6) {
          const slope = (n * sxy - sx * sy) / denom;
          const icpt = (sy - slope * sx) / n;
          // Average distance from the fitted line tells us how wavy it is
          let dev = 0, dn = 0;
          for (let x = 0; x < w; x++) {
            if (sm[x] <= 0) continue;
            dev += Math.abs(sm[x] - (slope * x + icpt)); dn++;
          }
          const mad = dev / Math.max(1, dn);
          const pull = Math.min(0.85, mad / (h * 0.02));
          for (let x = 0; x < w; x++) {
            if (sm[x] <= 0) continue;
            const fit = slope * x + icpt;
            sm[x] = Math.round(sm[x] * (1 - pull) + fit * pull);
          }
        }
      }

      // Bridge gaps left by furniture or doorways
      const edge = Int32Array.from(sm);
      let prev = -1;
      for (let x = 0; x < w; x++) {
        if (edge[x] > 0) { prev = x; continue; }
        let next = -1;
        for (let k = x + 1; k < w; k++) if (edge[k] > 0) { next = k; break; }
        if (prev !== -1 && next !== -1) {
          const t = (x - prev) / (next - prev);
          edge[x] = Math.round(edge[prev] + t * (edge[next] - edge[prev]));
        } else if (prev !== -1) edge[x] = edge[prev];
        else if (next !== -1) edge[x] = edge[next];
      }
      skirtEdge = edge;

      const band = Math.max(3, Math.round(h * 0.014));
      drawSkirting(band, 0);
      showSkirtingSliders(band, 2, Math.round(h * 0.12));

    } catch (err) {
      console.error('[Skirting]', err);
      els.autoSegStatus.textContent = '❌ Плинтус қатесі';
    }
  }

  /* band = thickness in px, shift = move the strip up (−) or down (+) */
  function drawSkirting(band, shift) {
    if (!skirtEdge) return;
    skirtBand = band; skirtShift = shift;
    const w = skirtW, h = skirtH;
    const out = new Uint8ClampedArray(w * h * 4);
    let painted = 0;

    for (let x = 0; x < w; x++) {
      const bot = skirtEdge[x] + shift;
      if (bot <= 0 || bot >= h) continue;
      const from = Math.max(0, bot - band);
      for (let y = from; y < bot; y++) {
        const p = (y * w + x) * 4;
        if (skirtDoor && skirtDoor[p] > 128) continue;   // door frame
        /* Anything standing in front of the wall — a chair, a plant pot —
           isn't part of the wall mask, and the skirting runs behind it. */
        if (skirtWall && skirtWall[p] <= 128) continue;
        out[p] = 255; out[p + 1] = 255; out[p + 2] = 255; out[p + 3] = 255;
        painted++;
      }
    }
    if (painted < 50) return;

    let idx = state.masks.findIndex(mk => mk.name === skirtName);
    if (idx === -1) {
      const empty = findEmptyLayerIndex();
      if (empty !== -1) {
        state.masks[empty].name = skirtName;
        state.masks[empty].color = '#ec4899';
        idx = empty;
      } else {
        if (state.masks.length >= 5) {
          alert('Макс 5 қабат. Бұрынғы қабатты өшіріңіз.');
          return;
        }
        state.masks.push({ name: skirtName, canvas: createMaskCanvas(w, h), color: '#ec4899' });
        idx = state.masks.length - 1;
      }
      saveUndoState();
    }

    state.activeMaskIndex = idx;
    const mCtx = state.masks[idx].canvas.getContext('2d');
    mCtx.clearRect(0, 0, w, h);
    mCtx.putImageData(new ImageData(out, w, h), 0, 0);

    // Cut the strip out of the wall layer, so the two never share pixels
    recutBaseLayer(skirtBaseKey);

    renderLayers();
    renderMaskOverlay();
    updateApplyButton();
  }

  function showSkirtingSliders(band, minB, maxB) {
    const old = document.getElementById('skirtCtl');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'skirtCtl';
    box.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;margin-top:8px;padding:8px 10px;background:rgba(236,72,153,0.08);border-radius:8px;';

    let curBand = band, curShift = 0;
    const row = (label, min, max, val, onInput) => {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const lb = document.createElement('span');
      lb.textContent = label;
      lb.style.cssText = 'color:#f9a8d4;font-size:11px;min-width:62px;';
      const sl = document.createElement('input');
      sl.type = 'range'; sl.min = min; sl.max = max; sl.value = val;
      sl.style.cssText = 'flex:1;accent-color:#ec4899;';
      const num = document.createElement('span');
      num.textContent = val + 'px';
      num.style.cssText = 'color:#fbcfe8;font-size:11px;min-width:38px;text-align:right;';
      sl.addEventListener('input', () => {
        num.textContent = sl.value + 'px';
        onInput(parseInt(sl.value, 10));
      });
      r.append(lb, sl, num);
      return r;
    };

    box.appendChild(row('Қалыңдық', minB, maxB, band, v => { curBand = v; drawSkirting(curBand, curShift); }));
    box.appendChild(row('Жылжыту', -80, 80, 0, v => { curShift = v; drawSkirting(curBand, curShift); }));

    els.autoSegBar.appendChild(box);
    els.autoSegStatus.textContent = `✅ ${skirtName} — слайдермен реттеңіз`;
  }


  // Shared mask loader — handles data URI, raw base64 and remote URLs
  async function loadMaskImage(m) {
    let src;
    if (m.startsWith('data:')) {
      src = m;
    } else if (m.startsWith('http://') || m.startsWith('https://')) {
      const resp = await fetch('/api/proxy-image?url=' + encodeURIComponent(m));
      if (!resp.ok) throw new Error('Proxy failed: ' + resp.status);
      src = URL.createObjectURL(await resp.blob());
    } else {
      src = 'data:image/png;base64,' + m;
    }
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Mask load failed'));
      img.src = src;
    });
  }

  async function applyAutoSegMask(key) {
    const info = autoSegMasks[key];
    if (!info) return;

    const meta = SEG_LABELS[key];
    els.autoSegStatus.textContent = `⏳ ${meta.label} жүктелуде...`;

    try {
      // Mask can be: data URI, raw base64, or https URL
      let imgSrc, blobUrl = null;
      const m = info.maskUrl;

      if (m.startsWith('data:')) {
        imgSrc = m;
        console.log('[AutoSeg] Mask: data URI');
      } else if (m.startsWith('http://') || m.startsWith('https://')) {
        const proxyUrl = '/api/proxy-image?url=' + encodeURIComponent(m);
        const resp = await fetch(proxyUrl);
        if (!resp.ok) throw new Error('Proxy failed: ' + resp.status);
        const blob = await resp.blob();
        blobUrl = URL.createObjectURL(blob);
        imgSrc = blobUrl;
        console.log('[AutoSeg] Mask: remote URL via proxy');
      } else {
        imgSrc = 'data:image/png;base64,' + m;
        console.log('[AutoSeg] Mask: raw base64, prefix added');
      }

      const maskImg = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('Mask load failed'));
        img.src = imgSrc;
      });

      // === Find or create a dedicated layer for this surface ===
      let targetIndex = state.masks.findIndex(mk => mk.name === meta.label);

      if (targetIndex === -1) {
        // No layer with this name yet
        const emptyIndex = findEmptyLayerIndex();

        if (emptyIndex !== -1) {
          // Reuse an empty layer (e.g. the default "Қабырға 1")
          state.masks[emptyIndex].name = meta.label;
          state.masks[emptyIndex].color = meta.btnColor;
          targetIndex = emptyIndex;
          console.log(`[AutoSeg] Reused empty layer #${emptyIndex} → "${meta.label}"`);
        } else {
          // Create a new layer
          if (state.masks.length >= 5) {
            alert('Макс 5 қабат. Бұрынғы қабатты өшіріңіз.');
            els.autoSegStatus.textContent = '⚠ Қабат лимиті';
            return;
          }
          state.masks.push({
            name: meta.label,
            canvas: createMaskCanvas(els.canvasBase.width, els.canvasBase.height),
            color: meta.btnColor,
          });
          targetIndex = state.masks.length - 1;
          console.log(`[AutoSeg] Created new layer "${meta.label}"`);
        }
      } else {
        console.log(`[AutoSeg] Found existing layer "${meta.label}" at #${targetIndex}`);
      }

      // Switch to that layer
      state.activeMaskIndex = targetIndex;
      const mask = state.masks[targetIndex];

      saveUndoState();

      const mCtx = mask.canvas.getContext('2d');
      const w = mask.canvas.width, h = mask.canvas.height;

      // Clear the layer first — replace, don't merge
      mCtx.clearRect(0, 0, w, h);

      // Scale mask to canvas size
      const scaled = document.createElement('canvas');
      scaled.width = w; scaled.height = h;
      const sCtx = scaled.getContext('2d', { willReadFrequently: true });

      /* The mask comes back at 640px, so blowing it up to the photo's size
         leaves a staircase along every edge. Blurring by roughly the scale
         factor turns those steps back into a straight line before the
         threshold below snaps it to hard pixels. */
      const scaleUp = w / (maskImg.naturalWidth || w);
      const blurPx = Math.min(6, Math.max(0, (scaleUp - 1) * 1.2));
      if (blurPx > 0.3) sCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
      sCtx.drawImage(maskImg, 0, 0, w, h);
      sCtx.filter = 'none';
      if (blobUrl) URL.revokeObjectURL(blobUrl);

      // Threshold + write (bright pixels = segmented area)
      const sData = sCtx.getImageData(0, 0, w, h);
      const mData = mCtx.createImageData(w, h);

      /* After the blur the edge is a soft ramp; 150 sits just inside the
         object, which keeps the wall from creeping onto the door frame. */
      const EDGE = 150;

      for (let i = 0; i < sData.data.length; i += 4) {
        const bright = sData.data[i] > EDGE || sData.data[i + 1] > EDGE || sData.data[i + 2] > EDGE;
        const v = bright ? 255 : 0;
        mData.data[i] = v;
        mData.data[i + 1] = v;
        mData.data[i + 2] = v;
        mData.data[i + 3] = bright ? 255 : 0;
      }

      /* Where two stretched masks overlap, the pixel belongs to the smaller
         object — a door edge is a door, not the wall behind it. Floor and
         ceiling also take precedence over the wall, so a rug or a cornice
         doesn't end up carrying the wall colour. */
      const neighbours = key === 'wall'
        ? ['door', 'windowpane', 'ceiling', 'floor', 'rug']
        : key === 'ceiling' ? ['door', 'windowpane', 'floor']
        : key === 'floor' ? ['door', 'windowpane', 'rug']
        : [];

      for (const nk of neighbours) {
        if (!autoSegMasks[nk]) continue;
        try {
          const nImg = await loadMaskImage(autoSegMasks[nk].maskUrl);
          const nc = document.createElement('canvas');
          nc.width = w; nc.height = h;
          const nCtx = nc.getContext('2d', { willReadFrequently: true });
          nCtx.drawImage(nImg, 0, 0, w, h);
          const nData = nCtx.getImageData(0, 0, w, h).data;
          for (let i = 0; i < mData.data.length; i += 4) {
            if (mData.data[i + 3] > 0 && nData[i] > 128) {
              mData.data[i] = 0; mData.data[i + 1] = 0;
              mData.data[i + 2] = 0; mData.data[i + 3] = 0;
            }
          }
        } catch (e) {
          console.warn('[AutoSeg] neighbour mask skipped:', nk, e.message);
        }
      }

      /* Snap the boundary to the real edge in the photo. Only for the big
         flat surfaces — a door or window has its own frame and the model
         already tracks those tightly. */
      if (key === 'wall' || key === 'ceiling' || key === 'floor') {
        const photo = els.canvasBase.getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, w, h).data;
        snapMaskToPhotoEdges(mData.data, photo, w, h);
      }

      /* A facade mask covers the whole house — roof, windows and all. Any
         surface already split into its own layer keeps its pixels, so the
         order of work doesn't matter: split the roof first or last, the
         facade never swallows it. */
      const BROAD = ['wall', 'building', 'house', 'skyscraper', 'ceiling', 'floor'];
      // Keep the uncarved mask — roof and skirting re-cut from this copy
      if (BROAD.includes(key) || key === 'hovel') {
        pristineByKey[key] = new ImageData(new Uint8ClampedArray(mData.data), w, h);
      }
      if (BROAD.includes(key)) {
        for (let li = 0; li < state.masks.length; li++) {
          if (li === targetIndex) continue;
          const other = state.masks[li].canvas.getContext('2d', { willReadFrequently: true })
            .getImageData(0, 0, w, h).data;
          for (let i = 3; i < mData.data.length; i += 4) {
            if (mData.data[i] > 0 && other[i] > 0) {
              mData.data[i - 3] = 0; mData.data[i - 2] = 0;
              mData.data[i - 1] = 0; mData.data[i] = 0;
            }
          }
        }
      }

      mCtx.putImageData(mData, 0, 0);

      /* A fresh wall mask covers the skirting area again, so re-apply the
         cut with the slider values the user already settled on. */
      if (key === skirtBaseKey && skirtEdge && skirtBand > 0) {
        drawSkirting(skirtBand, skirtShift);
        state.activeMaskIndex = targetIndex;
      }
      // Same for the roof: keep the eaves line, take the new outline
      if (key === roofKey && roofEdge) {
        refreshRoofBase();
        drawRoof(roofShift, false);
        state.activeMaskIndex = targetIndex;
      }

      renderLayers();
      renderMaskOverlay();
      updateApplyButton();

      els.autoSegStatus.textContent = `✅ ${meta.label} қабаты дайын`;
      console.log(`[AutoSeg] Applied ${key} → layer "${mask.name}" (#${targetIndex})`);

    } catch (err) {
      console.error('[AutoSeg] Mask apply error:', err);
      els.autoSegStatus.textContent = '❌ Маска қатесі';
    }
  }

  // Find a layer that has no painted pixels (so we can reuse it)
  function findEmptyLayerIndex() {
    for (let i = 0; i < state.masks.length; i++) {
      const c = state.masks[i].canvas;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let hasPixels = false;
      // Sample every 40th pixel — fast enough, accurate enough
      for (let p = 3; p < d.length; p += 160) {
        if (d[p] > 0) { hasPixels = true; break; }
      }
      if (!hasPixels) return i;
    }
    return -1;
  }

  // ===== TEXT-PROMPT SEGMENTATION (Grounded SAM) =====
  /* Grounding DINO finds the object from a text label, SAM turns the box
     into a pixel mask. Works on anything the model can name, so it covers
     roofs, socles and other things ADE20K has no class for. */
  const TEXT_SEG_CHIPS = [
    { prompt: 'roof of the house, rooftop',  neg: 'sky, tree, grass, ground, wall, window', label: 'Шатыр',   color: '#f97316', max: 0.40 },
    { prompt: 'basement, socle, foundation', neg: 'wall, window, ground', label: 'Цоколь',  color: '#78716c', max: 0.35 },
    { prompt: 'facade wall',                 neg: 'sky, roof, window',    label: 'Фасад',   color: '#0ea5e9', max: 0.85 },
    { prompt: 'windows of the building',     neg: 'wall, roof, sky, door',  label: 'Терезе',  color: '#06b6d4', max: 0.30 },
    { prompt: 'door',                        neg: 'wall',                 label: 'Есік',    color: '#f43f5e', max: 0.40 },
    { prompt: 'skirting board, baseboard',   neg: 'wall, floor',          label: 'Плинтус', color: '#ec4899', max: 0.12 },
  ];

  function renderTextSegChips() {
    els.textSegChips.innerHTML = '';
    TEXT_SEG_CHIPS.forEach(c => {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.style.cssText = `background:${c.color}22;border:1px solid ${c.color}66;color:${c.color};padding:4px 10px;border-radius:12px;cursor:pointer;font-size:11px;font-weight:500;`;
      b.addEventListener('click', () => runTextSegment(c.prompt, c.label, c.neg, c.max));
      els.textSegChips.appendChild(b);
    });
  }

  async function runTextSegment(prompt, label, negPrompt, maxShare, opts) {
    const quiet = opts && opts.silent;
    if (!state.uploadedImage) { alert('Алдымен фото жүктеңіз!'); return; }

    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) { alert('Тек онлайн нұсқада жұмыс істейді (Vercel).'); return; }

    els.btnTextSegment.disabled = true;
    els.textSegStatus.textContent = `⏳ "${prompt}" ізделуде...`;

    try {
      const maxDim = 1024;
      const ic = document.createElement('canvas');
      let w = state.uploadedImage.width, h = state.uploadedImage.height;
      if (w > maxDim || h > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      ic.width = w; ic.height = h;
      ic.getContext('2d').drawImage(state.uploadedImage, 0, 0, w, h);
      const base64 = ic.toDataURL('image/jpeg', 0.85);

      const createRes = await fetch('/api/text-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, prompt, negative_prompt: negPrompt || '' })
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'API error');
      const predId = createData.id;
      if (!predId) throw new Error('No prediction ID');
      console.log('[TextSeg] prediction:', predId, '| prompt:', prompt, '| negative:', negPrompt || '—');

      let output = null;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch('/api/auto-segment-poll?id=' + predId);
        const d = await pollRes.json();
        els.textSegStatus.textContent = `⏳ ${d.status} (${(i + 1) * 2}с)`;

        if (d.status === 'succeeded') { output = d.output; break; }
        if (d.status === 'failed' || d.status === 'canceled') {
          throw new Error(d.error || 'Prediction ' + d.status);
        }
      }
      if (!output) throw new Error('Timeout');

      console.log('[TextSeg] output:', output);

      const maskUrl = Array.isArray(output) ? output[0] : output;
      if (!maskUrl) throw new Error('Маска қайтарылмады');

      // This model returns an INVERTED mask (object is black, rest is white),
      // so flip it by default. The button lets you switch back if needed.
      return await applyTextMask(maskUrl, label, maxShare, true);

    } catch (err) {
      console.error('[TextSeg] Error:', err);
      if (quiet) throw err;
      els.textSegStatus.textContent = '❌ ' + err.message;
    } finally {
      els.btnTextSegment.disabled = false;
    }
  }

  // Remembers the last mask so it can be inverted without another API call
  let lastTextMask = null;

  async function applyTextMask(maskUrl, label, maxShare, forceInvert) {
    const maskImg = typeof maskUrl === 'string' ? await loadMaskImage(maskUrl) : maskUrl;
    const w = els.canvasBase.width, h = els.canvasBase.height;

    let idx = state.masks.findIndex(mk => mk.name === label);
    if (idx === -1) {
      const empty = findEmptyLayerIndex();
      const chip = TEXT_SEG_CHIPS.find(c => c.label === label);
      const color = chip ? chip.color : '#0ea5e9';
      if (empty !== -1) {
        state.masks[empty].name = label;
        state.masks[empty].color = color;
        idx = empty;
      } else {
        if (state.masks.length >= 5) {
          alert('Макс 5 қабат. Бұрынғы қабатты өшіріңіз.');
          els.textSegStatus.textContent = '⚠ Қабат лимиті';
          return;
        }
        state.masks.push({ name: label, canvas: createMaskCanvas(w, h), color });
        idx = state.masks.length - 1;
      }
    }

    state.activeMaskIndex = idx;
    saveUndoState();

    const scaled = document.createElement('canvas');
    scaled.width = w; scaled.height = h;
    const sCtx = scaled.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(maskImg, 0, 0, w, h);
    const sData = sCtx.getImageData(0, 0, w, h);

    const mCtx = state.masks[idx].canvas.getContext('2d');
    mCtx.clearRect(0, 0, w, h);
    const mData = mCtx.createImageData(w, h);

    let on = 0;
    for (let i = 0; i < sData.data.length; i += 4) {
      let bright = sData.data[i] > 128 || sData.data[i + 1] > 128 || sData.data[i + 2] > 128;
      if (forceInvert) bright = !bright;
      const v = bright ? 255 : 0;
      mData.data[i] = v; mData.data[i + 1] = v; mData.data[i + 2] = v;
      mData.data[i + 3] = bright ? 255 : 0;
      if (bright) on++;
    }
    const share = on / (w * h);

    /* The model usually returns an inverted mask, so we flip by default —
       but not always. If the result swallows almost the whole frame it was
       the other way round; flip back rather than make the user notice. */
    if (share > 0.85 && forceInvert) {
      console.log(`[TextSeg] "${label}" covered ${(share * 100).toFixed(0)}% — flipping back`);
      return applyTextMask(maskUrl, label, maxShare, false);
    }

    mCtx.putImageData(mData, 0, 0);

    /* Carve this surface out of any broad layer underneath — a facade mask
       covers the whole building, so a roof split out afterwards would
       otherwise sit on pixels that layer still claims. A mask well past the
       size this kind of object should be is a miss, and carving with it
       would punch a hole in a layer that was correct. */
    const trustworthy = !maxShare || share <= maxShare;
    const BROAD_NAMES = ['Фасад', 'Қабырға', 'Құрылыс', 'Төбе', 'Еден'];
    for (let li = 0; trustworthy && li < state.masks.length; li++) {
      if (li === idx || !BROAD_NAMES.includes(state.masks[li].name)) continue;
      const bCtx = state.masks[li].canvas.getContext('2d', { willReadFrequently: true });
      const bImg = bCtx.getImageData(0, 0, w, h);
      let changed = false;
      for (let i = 3; i < mData.data.length; i += 4) {
        if (mData.data[i] > 0 && bImg.data[i] > 0) {
          bImg.data[i - 3] = 0; bImg.data[i - 2] = 0;
          bImg.data[i - 1] = 0; bImg.data[i] = 0;
          changed = true;
        }
      }
      if (changed) bCtx.putImageData(bImg, 0, 0);
    }

    renderLayers();
    renderMaskOverlay();
    updateApplyButton();

    lastTextMask = { img: maskImg, label, maxShare, inverted: !!forceInvert };

    const pct = (share * 100).toFixed(1);
    console.log(`[TextSeg] Applied "${label}" to layer #${idx} — ${pct}% of image`);

    // Warn when the mask is far bigger than this kind of object should be
    if (maxShare && share > maxShare) {
      els.textSegStatus.textContent = `⚠ ${label}: ${pct}% — тым үлкен, дұрыс емес болуы мүмкін`;
      showInvertButton(label);
    } else {
      els.textSegStatus.textContent = `✅ ${label} → ${pct}%`;
      showInvertButton(label);
    }
    return { share, idx };
  }

  function showInvertButton(label) {
    const old = document.getElementById('textSegInvert');
    if (old) old.remove();
    if (!lastTextMask) return;

    const b = document.createElement('button');
    b.id = 'textSegInvert';
    b.textContent = lastTextMask.inverted ? '↺ Кері қайтару' : '↺ Терістеу';
    b.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#e5e7eb;padding:4px 10px;border-radius:12px;cursor:pointer;font-size:11px;';
    b.addEventListener('click', () => {
      if (!lastTextMask) return;
      applyTextMask(lastTextMask.img, lastTextMask.label, lastTextMask.maxShare, !lastTextMask.inverted);
    });
    els.textSegChips.appendChild(b);
  }

  // ===== PUBLIC API =====
  return { init, open, close };
})();

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => UploadTool.init());
} else {
  UploadTool.init();
}


