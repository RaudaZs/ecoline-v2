// api/inpaint-poll.js — AI Inpaint нәтижесін тексеру (polling)
// GET /api/inpaint-poll?id=xxx

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  var TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });

  try {
    var r = await fetch('https://api.replicate.com/v1/predictions/' + id, {
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    });

    if (!r.ok) return res.status(500).json({ error: 'Poll failed' });

    var prediction = await r.json();

    if (prediction.status === 'succeeded') {
      // SDXL Inpainting output: [url1, url2, ...]
      var output = prediction.output;
      var resultUrl = Array.isArray(output) ? output[0] : output;

      return res.status(200).json({
        status: 'succeeded',
        result: resultUrl
      });
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return res.status(200).json({
        status: 'failed',
        error: prediction.error || 'Inpainting failed'
      });
    }

    // Still processing
    return res.status(200).json({ status: prediction.status });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
