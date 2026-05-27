const fs = require('fs');
const path = require('path');
const prisma = require('../db');

function resolveImagePath(imagePath) {
  // Handle app-img:// protocol URLs
  if (imagePath.startsWith('app-img:///')) {
    const decoded = decodeURIComponent(imagePath.slice('app-img:///'.length));
    return decoded.replace(/\//g, path.sep);
  }
  return imagePath;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] || 'image/png';
}

async function analyzeImage(args, context = {}) {
  const { path: imagePath, prompt } = args;
  const brainId = context.visionBrainId;

  if (!imagePath) {
    return '错误：需要提供图片路径 (path) 参数';
  }
  if (!brainId) {
    return '错误：未配置视觉能力。请在 Agent 侧边栏「小帮手」中配置视觉大脑。';
  }

  const brain = await prisma.brain.findUnique({ where: { id: brainId } });
  if (!brain) {
    return '错误：视觉大脑未找到，请重新配置。';
  }

  // Resolve and read the image file
  const resolvedPath = resolveImagePath(imagePath);
  if (!fs.existsSync(resolvedPath)) {
    return `错误：找不到图片文件: ${resolvedPath}`;
  }

  const imageBuffer = fs.readFileSync(resolvedPath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = getMimeType(resolvedPath);

  // Build vision API request (OpenAI-compatible format)
  const body = {
    model: brain.modelName,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt || '请描述这张图片的内容' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ],
    max_tokens: 2048,
  };

  const response = await fetch(`${brain.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${brain.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return `视觉 API 错误 (${response.status}): ${errorText}`;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return '视觉 API 返回了空结果';
  }

  return content;
}

module.exports = analyzeImage;
