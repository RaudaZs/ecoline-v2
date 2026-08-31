// api/inpaint.js — AI Inpainting with NOVA 2024 colors via SDXL (Replicate)
// Фотореалистік бояу визуализация: SAM маскасы + NOVA түс → AI қайта сурет салады

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body;

  // Валидация
  if (!body.image) return res.status(400).json({ error: 'image required (base64)' });
  if (!body.mask) return res.status(400).json({ error: 'mask required (base64 or URL)' });
  if (!body.color) return res.status(400).json({ error: 'color required (hex like #A0522D)' });

  var TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });

  try {
    // Түс атауын prompt-ке қосу
    var colorName = body.colorName || 'paint';
    var hex = body.color; // #A0522D

    // Image форматтау
    var imageData = body.image;
    if (!imageData.startsWith('data:')) {
      imageData = 'data:image/jpeg;base64,' + imageData;
    }

    // Mask форматтау (SAM-нан келген mask URL немесе base64)
    var maskData = body.mask;
    if (!maskData.startsWith('data:') && !maskData.startsWith('http')) {
      maskData = 'data:image/png;base64,' + maskData;
    }

    // Prompt — нақты түсті сипаттау
    var prompt = [
      `A wall freshly painted in ${colorName} color (${hex}),`,
      'smooth matte paint finish,',
      'professional interior wall painting,',
      'same room layout and lighting,',
      'photorealistic, high quality'
    ].join(' ');

    var negativePrompt = [
      'furniture moved, different furniture, new objects,',
      'changed layout, different room, cartoon, drawing,',
      'blurry, distorted, low quality, watermark'
    ].join(' ');

    console.log('[Inpaint] Color:', hex, colorName);
    console.log('[Inpaint] Prompt:', prompt);

    // SDXL Inpainting — Replicate API
    var r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // SDXL Inpainting model
        version: 'c11bac58203367db93a3c552bd49a25a5c840b21fead3e23a4e4b5e08e05e583',
        input: {
          image: imageData,
          mask: maskData,
          prompt: prompt,
          negative_prompt: negativePrompt,
          num_inference_steps: 25,
          guidance_scale: 7.5,
          prompt_strength: 0.85,  // 0.85 = қабырғаны бояу + жарық сақтау
          num_outputs: 1,
          scheduler: 'K_EULER'
        }
      })
    });

    var data = await r.json();

    if (!r.ok || data.error) {
      console.error('[Inpaint] Replicate error:', data);
      return res.status(500).json({
        error: 'Replicate error',
        details: JSON.stringify(data.error || data)
      });
    }

    // Async — prediction ID қайтару
    return res.status(200).json({
      id: data.id,
      status: data.status,
      message: 'AI бояу басталды...'
    });

  } catch (e) {
    console.error('[Inpaint] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
