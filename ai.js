const Anthropic = require('@anthropic-ai/sdk');
const { METRICS, METRIC_ORDER, formatValue } = require('./benchmarks');

const client = new Anthropic();

const PLATFORM_LABELS = {
  meta:      'Meta Ads',
  google:    'Google Ads',
  tiktok:    'TikTok Ads',
  pinterest: 'Pinterest Ads',
  combined:  'All Platforms',
};

const DATE_LABELS = {
  today:      'Today',
  yesterday:  'Yesterday',
  last_7d:    'Last 7 days',
  last_30d:   'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  maximum:    'All time',
};

async function* analyzeMetrics({ metrics, niche, objective, aov, platform, dateRange }) {
  const metricLines = METRIC_ORDER
    .map(key => {
      if (metrics[key] == null) return null;
      const m = METRICS[key];
      if (!m) return null;
      return `${m.label}: ${formatValue(key, metrics[key])}`;
    })
    .filter(Boolean)
    .join(' | ');

  const platformLabel = PLATFORM_LABELS[platform] ?? platform;
  const dateLabel     = DATE_LABELS[dateRange]    ?? dateRange;
  const aovLine       = aov ? ` | AOV $${aov}` : '';

  const prompt = `Senior ad analyst. Blunt, specific, no filler.

${niche} | ${objective}${aovLine} | ${platformLabel} | ${dateLabel}
${metricLines}

Reply in this exact format — nothing else:

**Verdict:** [1-2 sentences on overall performance. Is it profitable or burning money?]

**Fix:**
• [worst metric]: [value] — [specific fix + target number]
• [second issue]: [value] — [specific fix + target number]
• [third issue]: [value] — [specific fix + target number]

**Do now:**
1. [action specific to ${niche}, ≤12 words]
2. [action specific to ${niche}, ≤12 words]
3. [action specific to ${niche}, ≤12 words]`;

  const stream = client.messages.stream({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages:   [{ role: 'user', content: prompt }],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

module.exports = { analyzeMetrics };
