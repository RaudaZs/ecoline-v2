export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body;
  if (!body.image) return res.status(400).json({ error: 'image required' });

  var TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'no token' });

  try {
    var pts = body.points || [[500, 375]];
    var lbls = body.labels || pts.map(function() { return 1; });

    // Validate: at least one positive point (label=1)
    if (!lbls.includes(1)) {
      return res.status(400).json({ error: 'At least one positive point (label=1) required' });
    }

    console.log('SAM request: points=' + pts.length + ', labels=' + lbls.join(';'));

    var input = {
      image: 'data:image/jpeg;base64,' + body.image,
      point_coords: pts.map(function(p) { return p[0] + ',' + p[1]; }).join(';'),
      point_labels: lbls.join(','),
      multimask_output: false
    };

    var r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83',
        input: input
      })
    });

    var data = await r.json();

    if (!r.ok || data.error) {
      return res.status(500).json({ error: 'Replicate: ' + JSON.stringify(data) });
    }

    if (data.status === 'succeeded') {
      return res.status(200).json({
        status: 'succeeded',
        mask: data.output && data.output.combined_mask ? data.output.combined_mask : data.output,
        id: data.id
      });
    }

    return res.status(200).json({ id: data.id, status: data.status });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
