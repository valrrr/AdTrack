const Anthropic = require('@anthropic-ai/sdk');
const { METRICS, METRIC_ORDER, formatValue } = require('./benchmarks');

const client = new Anthropic();

const PLATFORM_LABELS = {
  meta:     'Meta (Facebook/Instagram) Ads',
  google:   'Google Ads',
  combined: 'Meta + Google Ads (Combined)',
};

const DATE_LABELS = {
  today:      'Today',
  yesterday:  'Yesterday',
  last_7d:    'Last 7 days',
  last_30d:   'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
};

async function* analyzeMetrics({ metrics, niche, objective, aov, platform, dateRange }) {
  const metricLines = METRIC_ORDER
    .map(key => {
      if (metrics[key] == null) return null;
      const m = METRICS[key];
      if (!m) return null;
      return `- ${m.label}: ${formatValue(key, metrics[key])}`;
    })
    .filter(Boolean)
    .join('\n');

  const platformLabel = PLATFORM_LABELS[platform] ?? platform;
  const dateLabel     = DATE_LABELS[dateRange]    ?? dateRange;

  const prompt = `You are an expert digital marketing analyst and media buyer. Analyze these ad metrics and provide specific, actionable insights.

**Business Context:**
- Industry/Niche: ${niche}
- Primary Objective: ${objective}${aov ? `\n- Average Order Value: $${aov}` : ''}
- Platform: ${platformLabel}
- Period: ${dateLabel}

**Current Metrics:**
${metricLines}

Provide a structured analysis with these sections:

## Performance Summary
2-3 sentences assessing overall performance for a ${niche} business focused on ${objective}.

## What's Working
Specific metrics that are strong for this niche, with a brief explanation of why each matters.

## Areas to Improve
The 2-3 most impactful metrics to fix, with realistic targets to aim for.

## Recommendations
5 concrete, actionable recommendations. Be specific — reference actual ad strategies, audience segments, creative approaches, or budget tactics relevant to ${niche}. No generic advice.

## Campaign Ideas
2-3 specific campaign types or formats that typically perform well for ${niche} businesses with a ${objective} objective.

Be direct, specific, and practical.`;

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
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
