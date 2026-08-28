export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { image, points } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_TOKEN) return res.status(500).json({ error: 'API token not configured' });

  try {
    // 1. Start prediction
    const startRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'fe97b453a6455861e3bec01b4e2e7735cb9a068e89e1c3527783417baa053ee1',
        input: {
          image: image,
          input_points: points || [[500, 375]],
          input_labels: (points || [[500, 375]]).map(() => 1),
        },
      }),
    });

    const prediction = await startRes.json();
    if (prediction.error) return res.status(500).json({ error: prediction.error });

    // 2. Poll for result (max 30 seconds)
    let result = prediction;
    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    for (let i = 0; i < 30; i++) {
      if (result.status === 'succeeded') break;
      if (result.status === 'failed') return res.status(500).json({ error: 'SAM failed' });
      await new Promise(r => setTimeout(r, 1000));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
      });
      result = await pollRes.json();
    }

    if (result.status !== 'succeeded') {
      return res.status(500).json({ error: 'Timeout' });
    }

    // 3. Return mask URL
    res.status(200).json({
      mask: result.output,
      status: 'ok',
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
