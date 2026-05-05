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
  today:      'today',
  yesterday:  'yesterday',
  last_7d:    'the last 7 days',
  last_30d:   'the last 30 days',
  this_month: 'this month',
  last_month: 'last month',
  maximum:    'all time',
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
  const aovLine       = aov ? ` | avg sale $${aov}` : '';

  const prompt = `You write weekly ad campaign updates for business owners — not marketers. Plain English only. No jargon.

Business: ${niche} | Goal: ${objective}${aovLine} | Platform: ${platformLabel} | Period: ${dateLabel}
Ad data: ${metricLines}

Reply in EXACTLY this format — no extra text, no markdown symbols:

VERDICT: [One honest sentence. Mention money spent and the main result (leads, sales, or reach). Say clearly if it's going well or needs work.]

RESULTS:
• [impressions] people saw the ads
• [clicks] visited your site or offer
• [conversions] [leads/sales/bookings] at $[cpa] each
• $[spend] spent ${dateLabel}

NEEDS:
• [Specific creative ask — e.g. "Send us 3–4 new photos of your work or team so we can test fresh ads"]
• [Specific info they should share — upcoming offers, events, new services, seasonal changes]
• [Specific feedback that helps targeting — who's been calling, what questions customers ask, what's selling]

TIP: [One thing they can do this week that directly helps results. Under 20 words. Actionable, not vague.]`;

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
