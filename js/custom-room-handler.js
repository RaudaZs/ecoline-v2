/**
 * Custom Room Handler — Ecoline Visualizer v2
 * 
 * Upload tool-дан келген маскаларды негізгі визуализаторға қосады.
 * Paint алгоритмі: Tikkurila формуласы (intensity=0.82, factor=0.3+lum*0.85)
 */

(function () {
  'use strict';

  // Listen for custom room event from UploadTool
  window.addEventListener('ecoline:custom-room', (e) => {
    const { baseImage, masks, imageWidth, imageHeight } = e.detail;
    console.log('[CustomRoom] Received:', masks.length, 'masks');

    activateCustomRoom(baseImage, masks, imageWidth, imageHeight);
  });

  function activateCustomRoom(baseImageUrl, masks, width, height) {
    // Load base image
    const baseImg = new Image();
    baseImg.onload = () => {
      // Create custom room config
      const customRoom = {
        id: 'custom_' + Date.now(),
        name: 'Менің фотом',
        baseImage: baseImg,
        baseDataUrl: baseImageUrl,
        surfaces: [],
      };

      // Process each mask
      const maskPromises = masks.map((maskData, i) => {
        return new Promise((resolve) => {
          const maskImg = new Image();
          maskImg.onload = () => {
            // Create proper mask canvas (white = painted area)
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const ctx = maskCanvas.getContext('2d');
            ctx.drawImage(maskImg, 0, 0, width, height);

            customRoom.surfaces.push({
              id: maskData.surface,
              name: maskData.name,
              maskCanvas: maskCanvas,
              color: null, // Will be set by user
            });
            resolve();
          };
          maskImg.src = maskData.dataUrl;
        });
      });

      Promise.all(maskPromises).then(() => {
        // Inject into main visualizer
        injectCustomRoom(customRoom);
      });
    };
    baseImg.src = baseImageUrl;
  }

  function injectCustomRoom(room) {
    // Get main canvas from visualizer
    const mainCanvas = document.getElementById('visualizer-canvas') 
      || document.getElementById('main-canvas')
      || document.querySelector('.visualizer canvas');

    if (!mainCanvas) {
      console.warn('[CustomRoom] Main canvas not found, using fallback render');
      renderStandalone(room);
      return;
    }

    // Resize canvas to match image
    mainCanvas.width = room.baseImage.width;
    mainCanvas.height = room.baseImage.height;
    const ctx = mainCanvas.getContext('2d');

    // Draw base image
    ctx.drawImage(room.baseImage, 0, 0);

    // Store room data for paint application
    window._customRoom = room;

    // Create surface controls
    createSurfaceControls(room);

    // Notify main app
    window.dispatchEvent(new CustomEvent('ecoline:room-ready', {
      detail: { room },
    }));
  }

  function createSurfaceControls(room) {
    // Find or create surface panel
    let panel = document.getElementById('custom-surfaces');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'custom-surfaces';
      panel.className = 'custom-surfaces-panel';

      // Insert into visualizer sidebar or after canvas
      const sidebar = document.querySelector('.sidebar') || document.querySelector('.controls');
      if (sidebar) {
        sidebar.prepend(panel);
      } else {
        const canvas = document.querySelector('canvas');
        if (canvas) canvas.parentNode.insertBefore(panel, canvas.nextSibling);
      }
    }

    panel.innerHTML = `
      <h4 style="margin:0 0 8px;font-size:14px;color:#999;">📷 Менің фотом</h4>
      ${room.surfaces.map((s, i) => `
        <div class="custom-surface" data-index="${i}" style="
          display:flex;align-items:center;gap:8px;padding:8px 12px;
          margin-bottom:4px;border-radius:8px;cursor:pointer;
          background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
          transition:all 0.2s;
        ">
          <span class="surface-swatch" style="
            width:20px;height:20px;border-radius:4px;
            background:${s.color || '#ccc'};border:1px solid rgba(0,0,0,0.2);
          "></span>
          <span style="font-size:13px;color:#ddd;">${s.name}</span>
        </div>
      `).join('')}
    `;

    // Click to select surface for painting
    panel.querySelectorAll('.custom-surface').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        window._customActiveSurface = idx;

        // Visual feedback
        panel.querySelectorAll('.custom-surface').forEach(s =>
          s.style.borderColor = 'rgba(255,255,255,0.08)');
        el.style.borderColor = '#4ECDC4';
      });
    });
  }

  /**
   * Apply paint to custom room surface
   * Uses Tikkurila formula: intensity=0.82, factor=0.3+lum*0.85
   */
  window.applyCustomPaint = function (surfaceIndex, hexColor) {
    const room = window._customRoom;
    if (!room || !room.surfaces[surfaceIndex]) return;

    const surface = room.surfaces[surfaceIndex];
    surface.color = hexColor;

    renderCustomRoom(room);
  };

  function renderCustomRoom(room) {
    const mainCanvas = document.getElementById('visualizer-canvas')
      || document.getElementById('main-canvas')
      || document.querySelector('.visualizer canvas');

    if (!mainCanvas) return;

    const ctx = mainCanvas.getContext('2d');
    const w = room.baseImage.width;
    const h = room.baseImage.height;

    mainCanvas.width = w;
    mainCanvas.height = h;

    // Draw original image
    ctx.drawImage(room.baseImage, 0, 0);

    // Get base pixel data
    const baseData = ctx.getImageData(0, 0, w, h);

    // Apply each painted surface
    room.surfaces.forEach(surface => {
      if (!surface.color) return;

      const maskCtx = surface.maskCanvas.getContext('2d');
      const maskData = maskCtx.getImageData(0, 0, w, h);

      const rgb = hexToRGB(surface.color);

      // Tikkurila paint formula
      const intensity = 0.82;

      for (let i = 0; i < baseData.data.length; i += 4) {
        const maskAlpha = maskData.data[i + 3]; // Mask alpha
        if (maskAlpha < 128) continue; // Skip non-masked pixels

        const r = baseData.data[i];
        const g = baseData.data[i + 1];
        const b = baseData.data[i + 2];

        // Luminance of original pixel
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const factor = 0.3 + lum * 0.85;

        // Blend paint with light/shadow preservation
        baseData.data[i] = clamp(rgb.r * factor * intensity + r * (1 - intensity));
        baseData.data[i + 1] = clamp(rgb.g * factor * intensity + g * (1 - intensity));
        baseData.data[i + 2] = clamp(rgb.b * factor * intensity + b * (1 - intensity));
      }
    });

    ctx.putImageData(baseData, 0, 0);

    // Update swatches
    const panel = document.getElementById('custom-surfaces');
    if (panel) {
      room.surfaces.forEach((s, i) => {
        const swatch = panel.querySelectorAll('.surface-swatch')[i];
        if (swatch && s.color) swatch.style.background = s.color;
      });
    }
  }

  function hexToRGB(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  function clamp(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }
})();
