// POST /api/segment — SAM 2 (Replicate)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { image, points, labels } = req.body;
  if (!image) return res.status(400).json({ error: 'image required' });

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_TOKEN) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });

  try {
    const input = {
      image: `data:image/jpeg;base64,${image}`,
      multimask_output: false,
    };

    if (points && points.length > 0) {
      input.point_coords = points.map(p => p[0] + ',' + p[1]).join(';');
      input.point_labels = (labels || points.map(function() { return 1; })).join(',');
    }

    var createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + REPLICATE_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'cbd95fb76192174268b6b303aeeb7a736e8dab0cbc38177f09db79b2299da30b',
        input: input,
      }),
    });

    var prediction = await createRes.json();

    if (!createRes.ok) {
      return res.status(500).json({
        error: 'Replicate error',
        details: prediction.detail || prediction.error || JSON.stringify(prediction),
      });
    }

    if (prediction.status === 'succeeded') {
      var mask = prediction.output && prediction.output.combined_mask ? prediction.output.combined_mask : prediction.output;
      return res.status(200).json({ status: 'succeeded', mask: mask, id: prediction.id });
    }

    return res.status(200).json({
      id: prediction.id,
      status: prediction.status,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
