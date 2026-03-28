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

  // Extra context for appointment-based businesses
  const appointmentNote = objective === 'Book Appointments'
    ? '\nNote: For this business, a "conversion" means an appointment booked. Focus CPA analysis on cost-per-booking and optimise for high-intent local audiences.'
    : '';

  const prompt = `You are an expert digital marketing analyst. Analyze these ad metrics and give direct, specific insights — no fluff.

**Business:** ${niche}
**Goal:** ${objective}${aov ? ` | Avg order value: $${aov}` : ''}${appointmentNote}
**Platform:** ${platformLabel}
**Period:** ${dateLabel}

**Metrics:**
${metricLines}

Respond with exactly these sections:

## Performance Summary
2–3 sentences. Is this account performing well for a ${niche} business trying to ${objective}? Be blunt.

## What's Working
List 1–3 specific metrics that are strong. Explain why each matters for this niche.

## What Needs Fixing
List the 2–3 biggest problems. Give realistic target numbers to aim for.

## Action Plan
Give exactly 5 numbered recommendations. Each must be specific to ${niche} — name ad formats, audience types, copy angles, or budget moves. No generic tips.

## Campaign Ideas
Suggest 2–3 campaign types that work well for ${niche} businesses focused on ${objective}. Include the format, targeting approach, and why it fits.`;

  // No thinking — stream text tokens immediately
  const stream = client.messages.stream({
    model:      'claude-opus-4-6',
    max_tokens: 1500,
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
