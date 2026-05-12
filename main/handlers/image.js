const https = require('https');

function isImageModel(modelName) {
  const imageKeywords = [
    'flux', 'stable-diffusion', 'sdxl', 'dall-e',
    'black-forest-labs', 'stabilityai', 'deep-floyd',
    'pixart', 'latent-consistency', 'playground',
    'kandinsky', 'würstchen', 'cogview', 'glm', 'wanx',
    'taiyi', 'midjourney', 'qwen',
  ];
  const lower = modelName.toLowerCase();
  return imageKeywords.some(keyword => lower.includes(keyword));
}

function rawHttps(urlStr, body, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${apiKey}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

module.exports = { isImageModel, rawHttps };
