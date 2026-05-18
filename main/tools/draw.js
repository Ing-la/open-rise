const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const prisma = require('../db');
const { rawHttps } = require('../handlers/image');

const CAPABILITIES_PATH = path.join(__dirname, '..', 'agent-capabilities.json');

function loadCapabilities() {
  try {
    return JSON.parse(fs.readFileSync(CAPABILITIES_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

async function generateImage(args) {
  const { prompt, size } = args;
  if (!prompt || typeof prompt !== 'string') {
    return '错误：需要提供 prompt 参数';
  }

  const caps = loadCapabilities();
  const imageCfg = caps.image;
  if (!imageCfg || !imageCfg.brainId) {
    return '错误：未配置画图能力。请在 Agent 侧边栏「小帮手」中配置。';
  }

  const brain = await prisma.brain.findUnique({ where: { id: imageCfg.brainId } });
  if (!brain) {
    return '错误：画图大脑未找到，请重新配置。';
  }

  // Call API based on vendor
  const isDashScope = brain.baseUrl.includes('dashscope');
  const imageSize = size || '1024x1024';
  const dashScopeSize = imageSize.replace('x', '*');

  let raw;
  if (isDashScope) {
    const bodyRaw = JSON.stringify({
      model: brain.modelName,
      input: {
        messages: [{ role: 'user', content: [{ text: prompt }] }],
      },
      parameters: { size: dashScopeSize, n: 1 },
    });
    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    raw = await rawHttps(url, bodyRaw, brain.apiKey);
  } else {
    const bodyRaw = JSON.stringify({
      model: brain.modelName,
      prompt,
      size: imageSize,
    });
    raw = await rawHttps(`${brain.baseUrl}/images/generations`, bodyRaw, brain.apiKey);
  }

  if (!(raw.statusCode >= 200 && raw.statusCode < 300)) {
    return `画图 API 错误 (${raw.statusCode}): ${raw.body}`;
  }

  const data = JSON.parse(raw.body);

  if (isDashScope && data.status_code && data.status_code !== 200) {
    return `DashScope 错误: ${data.code || data.status_code} ${data.message || ''}`;
  }

  let imageUrl, imageB64;
  if (isDashScope) {
    const content = data.output?.choices?.[0]?.message?.content;
    imageUrl = Array.isArray(content) ? content[0]?.image : null;
  } else {
    imageUrl = data.data?.[0]?.url;
    imageB64 = data.data?.[0]?.b64_json;
  }

  if (!imageUrl && !imageB64) return '画图 API 返回了空数据';

  // Save image to local storage
  const imageDir = !app.isPackaged
    ? path.join(__dirname, '..', '..', 'prisma', 'images', 'agent')
    : path.join(app.getPath('userData'), 'images', 'agent');
  fs.mkdirSync(imageDir, { recursive: true });

  const timestamp = Date.now();
  const imagePath = path.join(imageDir, `${timestamp}.png`);

  if (imageUrl) {
    const imgResponse = await fetch(imageUrl);
    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    fs.writeFileSync(imagePath, buffer);
  } else if (imageB64) {
    const buffer = Buffer.from(imageB64, 'base64');
    fs.writeFileSync(imagePath, buffer);
  }

  const localUrl = `app-img:///${imagePath.replace(/\\/g, '/')}`;
  return `![generated image](${localUrl})`;
}

module.exports = generateImage;
