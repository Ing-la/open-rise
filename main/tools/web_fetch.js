const { parseHTML } = require('linkedom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');

// Shared turndown instance
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

async function webFetch(args) {
  const { url } = args;

  if (!url || typeof url !== 'string') {
    return '错误：需要提供 url 参数';
  }

  // Basic URL validation
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `错误：无效的 URL — ${url}`;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return '错误：仅支持 http/https 协议';
  }

  // Fetch the page
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ZoeAgent/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    return `错误：HTTP ${response.status} ${response.statusText}`;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    // Not HTML — return raw text up to a limit
    const text = await response.text();
    return text.length > 5000 ? text.slice(0, 5000) + '\n...(truncated)' : text;
  }

  const html = await response.text();

  // Parse with Readability (requires DOM in Node.js)
  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.content) {
    return '无法提取页面正文内容（页面可能依赖 JavaScript 渲染，或不是文章类页面）';
  }

  // Convert HTML content to Markdown
  const markdown = turndown.turndown(article.content);

  // Build output
  const lines = [];
  if (article.title) lines.push(`# ${article.title}`);
  if (article.byline) lines.push(`> 作者：${article.byline}`);
  if (article.publishedDate) lines.push(`> 日期：${article.publishedDate}`);
  if (article.excerpt && !markdown.includes(article.excerpt)) lines.push(`> ${article.excerpt}`);
  lines.push('');
  lines.push(markdown);

  return lines.join('\n');
}

module.exports = webFetch;
