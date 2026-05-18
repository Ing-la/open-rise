// Load env vars to get TAVILY_API_KEY
try {
  require('dotenv').config();
} catch {
  // dotenv might not be loaded yet
}

const TAVILY_API_URL = 'https://api.tavily.com/search';

async function webSearch(args) {
  const { query, count = 5 } = args;

  if (!query || typeof query !== 'string') {
    return '错误：需要提供 query 参数';
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return '错误：未配置搜索 API 密钥。请在 .env 文件中设置 TAVILY_API_KEY。\n\n' +
      '免费注册获取密钥：https://app.tavily.com/sign-in';
  }

  const response = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: Math.min(Math.max(1, count), 10),
      include_answer: 'basic',
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    return `搜索 API 错误 (${response.status}): ${text}`;
  }

  const data = await response.json();

  // Format results
  const lines = [];
  lines.push(`搜索结果: ${query}`);

  if (data.answer) {
    lines.push(`\n摘要: ${data.answer}\n`);
  }

  const results = data.results || [];
  if (results.length === 0) {
    lines.push('无搜索结果');
    return lines.join('\n');
  }

  results.forEach((r, i) => {
    lines.push(`\n${i + 1}. ${r.title || '(无标题)'}`);
    if (r.content) lines.push(`   ${r.content.replace(/\n/g, ' ').slice(0, 300)}`);
    lines.push(`   ${r.url}`);
  });

  return lines.join('\n');
}

module.exports = webSearch;
