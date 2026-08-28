// GET /api/test-api — Replicate API token тексеру
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

  if (!REPLICATE_TOKEN) {
    return res.status(200).json({ error: 'TOKEN YOQ', tokenLength: 0 });
  }

  try {
    // Test 1: Check account
    var accountRes = await fetch('https://api.replicate.com/v1/account', {
      headers: { 'Authorization': 'Bearer ' + REPLICATE_TOKEN },
    });
    var account = await accountRes.json();

    // Test 2: Check SAM 2 model
    var modelRes = await fetch('https://api.replicate.com/v1/models/meta/sam-2', {
      headers: { 'Authorization': 'Bearer ' + REPLICATE_TOKEN },
    });
    var model = await modelRes.json();

    return res.status(200).json({
      tokenLength: REPLICATE_TOKEN.length,
      tokenPrefix: REPLICATE_TOKEN.substring(0, 5) + '...',
      accountStatus: accountRes.status,
      accountName: account.username || account.detail || 'unknown',
      modelStatus: modelRes.status,
      modelName: model.name || model.detail || 'unknown',
      latestVersion: model.latest_version ? model.latest_version.id.substring(0, 12) : 'none',
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, tokenLength: REPLICATE_TOKEN.length });
  }
}
