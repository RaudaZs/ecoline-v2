export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, prompt, negative_prompt } = req.body;
  if (!image) return res.status(400).json({ error: 'image required' });
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'fa5925023ef966231d521342bce357e5a53a019bdf183cc33cfe47b9c409f93b',
        input: {
          image: image,
          mask_prompt: prompt,
          negative_mask_prompt: negative_prompt || ''
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || 'Replicate API error' });
    }
    res.status(200).json(data);
  } catch (err) {
    console.error('Text-segment error:', err);
    res.status(500).json({ error: err.message });
  }
}
