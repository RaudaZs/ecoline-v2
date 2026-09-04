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
              <input id="text-seg-input" type="text" placeholder="roof, basement, window..." style="flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:7px;padding:7px 10px;color:#fff;font-size:13px;outline:none">
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

    // Auto-segment
    els.btnAutoSegment.addEventListener('click', runAutoSegment);

    // Text-prompt segment
    els.btnTextSegment.addEventListener('click', () => {
      const v = els.textSegInput.value.trim();
      if (v) runTextSegment(v, v);
    });
    els.textSegInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = els.textSegInput.value.trim();
        if (v) runTextSegment(v, v);
      }
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
    renderLayers();
    updateApplyButton();

    // Show auto-segment bar (only online)
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    els.autoSegBar.classList.toggle('hidden', isLocal);
    els.autoSegBar.style.display = isLocal ? 'none' : 'flex';
    els.autoSegStatus.textContent = '';

    els.textSegBar.classList.toggle('hidden', isLocal);
    els.textSegBar.style.display = isLocal ? 'none' : 'flex';
    els.textSegStatus.textContent = '';
    renderTextSegChips();
  }

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
      state.isShaping = false;
      state.shapeStart = null;
      updateApplyButton();
      renderMaskOverlay();
      return;
    }

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
    // Exterior — ADE20K has no separate roof or socle class,
    // so the model returns the house as one piece. Refine with SAM.
    building: { label: 'Үй',      btnColor: '#0ea5e9' },
    house:    { label: 'Ғимарат', btnColor: '#14b8a6' },
    skyscraper: { label: 'Ғимарат', btnColor: '#14b8a6' },
    hovel:    { label: 'Құрылыс', btnColor: '#84cc16' },
    fence:    { label: 'Қоршау',  btnColor: '#a855f7' },
    door:     { label: 'Есік',    btnColor: '#f43f5e' },
    windowpane: { label: 'Терезе', btnColor: '#06b6d4' },
    stairs:   { label: 'Баспалдақ', btnColor: '#eab308' },
  };
  let autoSegMasks = {};

  async function runAutoSegment() {
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

      if (isFacade) {
        els.autoSegStatus.textContent = 'ℹ️ Шатыр мен цоколь үшін SAM нүктелерін қолданыңыз';
      } else {
        els.autoSegStatus.textContent = '✅ Дайын!';
      }
      els.btnAutoSegment.textContent = '🔮 Қайта сегмент';

    } catch (err) {
      console.error('[AutoSeg] Error:', err);
      alert('Авто-сегменттеу қатесі: ' + err.message);
      els.autoSegStatus.textContent = '❌ Қате';
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
    }
    els.autoSegBar.appendChild(picker);
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
      sCtx.drawImage(maskImg, 0, 0, w, h);
      if (blobUrl) URL.revokeObjectURL(blobUrl);

      // Threshold + write (bright pixels = segmented area)
      const sData = sCtx.getImageData(0, 0, w, h);
      const mData = mCtx.createImageData(w, h);

      for (let i = 0; i < sData.data.length; i += 4) {
        const bright = sData.data[i] > 128 || sData.data[i + 1] > 128 || sData.data[i + 2] > 128;
        const v = bright ? 255 : 0;
        mData.data[i] = v;
        mData.data[i + 1] = v;
        mData.data[i + 2] = v;
        mData.data[i + 3] = bright ? 255 : 0;
      }
      mCtx.putImageData(mData, 0, 0);

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
    { prompt: 'roof',            label: 'Шатыр',   color: '#f97316' },
    { prompt: 'basement, socle', label: 'Цоколь',  color: '#78716c' },
    { prompt: 'facade wall',     label: 'Фасад',   color: '#0ea5e9' },
    { prompt: 'window',          label: 'Терезе',  color: '#06b6d4' },
    { prompt: 'door',            label: 'Есік',    color: '#f43f5e' },
    { prompt: 'skirting board',  label: 'Плинтус', color: '#ec4899' },
  ];

  function renderTextSegChips() {
    els.textSegChips.innerHTML = '';
    TEXT_SEG_CHIPS.forEach(c => {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.style.cssText = `background:${c.color}22;border:1px solid ${c.color}66;color:${c.color};padding:4px 10px;border-radius:12px;cursor:pointer;font-size:11px;font-weight:500;`;
      b.addEventListener('click', () => runTextSegment(c.prompt, c.label));
      els.textSegChips.appendChild(b);
    });
  }

  async function runTextSegment(prompt, label) {
    if (!state.uploadedImage) { alert('Алдымен фото жүктеңіз!'); return; }

    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) { alert('Тек онлайн нұсқада жұмыс істейді (Vercel).'); return; }

    els.btnTextSegment.disabled = true;
    els.textSegStatus.textContent = `⏳ "${prompt}" ізделуде...`;

    try {
      // Resize to keep the upload small
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
        body: JSON.stringify({ image: base64, prompt })
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'API error');
      const predId = createData.id;
      if (!predId) throw new Error('No prediction ID');
      console.log('[TextSeg] prediction:', predId, '| prompt:', prompt);

      // Poll — reuse the auto-segment poller, it only needs an id
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

      // The model returns several images; the first is the mask
      const maskUrl = Array.isArray(output) ? output[0] : output;
      if (!maskUrl) throw new Error('Маска қайтарылмады');

      await applyTextMask(maskUrl, label);

    } catch (err) {
      console.error('[TextSeg] Error:', err);
      els.textSegStatus.textContent = '❌ ' + err.message;
    } finally {
      els.btnTextSegment.disabled = false;
    }
  }

  async function applyTextMask(maskUrl, label) {
    const maskImg = await loadMaskImage(maskUrl);
    const w = els.canvasBase.width, h = els.canvasBase.height;

    // Find or create a layer named after the prompt
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
      const bright = sData.data[i] > 128 || sData.data[i + 1] > 128 || sData.data[i + 2] > 128;
      const v = bright ? 255 : 0;
      mData.data[i] = v; mData.data[i + 1] = v; mData.data[i + 2] = v;
      mData.data[i + 3] = bright ? 255 : 0;
      if (bright) on++;
    }
    mCtx.putImageData(mData, 0, 0);

    renderLayers();
    renderMaskOverlay();
    updateApplyButton();

    const pct = (on / (w * h) * 100).toFixed(1);
    els.textSegStatus.textContent = `✅ ${label} → ${pct}%`;
    console.log(`[TextSeg] Applied "${label}" to layer #${idx} — ${pct}% of image`);

    // A near-total mask usually means the model returned an inverted image
    if (on / (w * h) > 0.92) {
      els.textSegStatus.textContent = `⚠ ${label}: маска терістелген болуы мүмкін`;
    }
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


