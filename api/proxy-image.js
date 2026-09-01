export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var url = req.query.url;
  if (!url) return res.status(400).json({error:'url required'});
  try {
    var r = await fetch(url);
    if (!r.ok) return res.status(500).json({error:'fetch failed ' + r.status});
    var buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png');
    res.send(buf);
  } catch(e) { res.status(500).json({error:e.message}); }
}