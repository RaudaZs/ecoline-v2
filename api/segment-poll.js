// GET /api/segment-poll?id=xxx — Prediction статусын тексеру
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_TOKEN) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });

  try {
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
    });

    if (!pollRes.ok) return res.status(500).json({ error: 'Poll failed' });

    const prediction = await pollRes.json();

    console.log('Poll status:', prediction.status, 'output:', prediction.output ? 'yes' : 'no');

    if (prediction.status === 'succeeded') {
      // SAM 2 returns { combined_mask: url, individual_masks: [url, ...] }
            const masks = prediction.output?.individual_masks || [];
      const mask = masks[0] || prediction.output?.combined_mask || prediction.output;
      return res.status(200).json({ status: 'succeeded', mask });
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return res.status(200).json({ 
        status: 'failed', 
        error: prediction.error || 'Segmentation failed' 
      });
    }

    return res.status(200).json({ status: prediction.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
