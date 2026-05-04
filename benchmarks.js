const METRICS = {
  spend:           { label: 'Total Spend',    format: 'currency',    hasRating: false, description: 'Total amount spent on ads in the period.', context: "No universal good/bad — it's about efficiency. Focus on the metrics below." },
  impressions:     { label: 'Impressions',    format: 'number',      hasRating: false, description: 'Times your ad was displayed (includes repeat views).', context: 'High impressions with low CTR signals weak creative or poor targeting.' },
  reach:           { label: 'Reach',          format: 'number',      hasRating: false, description: 'Unique people who saw your ad at least once.', context: 'Unlike impressions, reach is deduplicated. Key for brand awareness. Meta only.' },
  clicks:          { label: 'Clicks',         format: 'number',      hasRating: false, description: 'Total clicks on your ads.', context: 'Direct signal of audience interest. More clicks = more traffic, but watch quality.' },
  ctr:             { label: 'CTR',            format: 'percent',     hasRating: true,  inverted: false, thresholds: { green: 2.0, yellow: 0.8 },  benchmark: '~2% search / ~0.9% social', description: 'Click-Through Rate — % of impressions that became a click.', context: 'Higher = more compelling creative and precise targeting.' },
  cpc:             { label: 'CPC',            format: 'currency',    hasRating: true,  inverted: true,  thresholds: { green: 1.50, yellow: 3.50 }, benchmark: '~$1.72 Meta / ~$2.69 Google', description: 'Cost Per Click — average cost paid per click.', context: 'Lower = more efficient spend on traffic.' },
  cpm:             { label: 'CPM',            format: 'currency',    hasRating: true,  inverted: true,  thresholds: { green: 8.0, yellow: 15.0 },  benchmark: '~$8–$12 avg', description: 'Cost per 1,000 Impressions — how much it costs to reach 1,000 people.', context: 'High CPM can mean competitive audience or narrow targeting.' },
  conversions:     { label: 'Conversions',    format: 'number',      hasRating: false, description: 'Desired actions completed (purchases, signups, leads, etc.).', context: "The ultimate outcome metric — what you're ultimately paying for." },
  conversion_rate: { label: 'Conv. Rate',     format: 'percent',     hasRating: true,  inverted: false, thresholds: { green: 3.0, yellow: 1.0 },  benchmark: '~2.9% Google / ~9.2% Meta', description: '% of clicks that resulted in a conversion.', context: 'Higher = better landing page and audience-offer match.' },
  cpa:             { label: 'CPA',            format: 'currency',    hasRating: true,  inverted: true,  thresholds: { green: 30.0, yellow: 75.0 }, benchmark: '~$48 Google / ~$18 Meta', description: 'Cost Per Acquisition — avg cost to generate one conversion.', context: 'Must stay below customer LTV/margin to be profitable.' },
  roas:            { label: 'ROAS',           format: 'multiplier',  hasRating: true,  inverted: false, thresholds: { green: 4.0, yellow: 2.0 },  benchmark: '4x+ target', description: 'Return on Ad Spend — revenue per $1 of ad spend.', context: '4x+ is typically profitable. Below 2x = likely losing money on most products.' },
  frequency:       { label: 'Frequency',      format: 'multiplier',  hasRating: true,  inverted: true,  thresholds: { green: 2.0, yellow: 3.5 },  benchmark: 'Keep below 3–4x', description: 'Avg times each unique person has seen your ad.', context: 'Above 3–4x triggers ad fatigue and rising CPMs. Rotate creatives proactively. Meta only.' },
};

const METRIC_ORDER = [
  'spend', 'impressions', 'reach', 'clicks',
  'ctr', 'cpc', 'cpm',
  'conversions', 'conversion_rate', 'cpa', 'roas', 'frequency',
];

function getRating(key, value) {
  const m = METRICS[key];
  if (!m?.hasRating || value == null) return null;
  const { green, yellow } = m.thresholds;
  if (!m.inverted) {
    if (value >= green) return 'good';
    if (value >= yellow) return 'ok';
    return 'poor';
  } else {
    if (value <= green) return 'good';
    if (value <= yellow) return 'ok';
    return 'poor';
  }
}

function formatValue(key, value) {
  if (value == null) return 'N/A';
  const fmt = METRICS[key]?.format ?? 'number';
  if (fmt === 'currency') return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fmt === 'percent') return value.toFixed(2) + '%';
  if (fmt === 'multiplier') return value.toFixed(2) + 'x';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return Math.round(value).toLocaleString('en-US');
}

function combineMetrics(...datasets) {
  const providers = datasets.filter(Boolean);
  if (providers.length === 0) return null;

  const v = (d, k) => (d?.[k] ?? 0);
  const spend       = providers.reduce((s, d) => s + v(d, 'spend'), 0);
  const impressions = providers.reduce((s, d) => s + v(d, 'impressions'), 0);
  const clicks      = providers.reduce((s, d) => s + v(d, 'clicks'), 0);
  const conversions = providers.reduce((s, d) => s + v(d, 'conversions'), 0);

  // Weighted ROAS across providers that have it
  let roas = null;
  const withRoas = providers.filter(d => d?.roas != null);
  if (withRoas.length > 0) {
    const roasSpend = withRoas.reduce((s, d) => s + v(d, 'spend'), 0);
    if (roasSpend > 0) roas = withRoas.reduce((s, d) => s + d.roas * v(d, 'spend'), 0) / roasSpend;
    else roas = withRoas[0].roas;
  }

  return {
    spend,
    impressions,
    reach:           datasets[0]?.reach     ?? null,
    clicks,
    ctr:             impressions > 0 ? (clicks / impressions * 100) : 0,
    cpc:             clicks > 0 ? spend / clicks : null,
    cpm:             impressions > 0 ? (spend / impressions * 1000) : null,
    conversions,
    conversion_rate: clicks > 0 ? (conversions / clicks * 100) : 0,
    cpa:             conversions > 0 ? spend / conversions : null,
    roas,
    frequency:       datasets[0]?.frequency ?? null,
  };
}

module.exports = { METRICS, METRIC_ORDER, getRating, formatValue, combineMetrics };
