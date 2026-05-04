const { GoogleAdsApi } = require('google-ads-api');

const DATE_RANGE_MAP = {
  today:      'TODAY',
  yesterday:  'YESTERDAY',
  last_7d:    'LAST_7_DAYS',
  last_30d:   'LAST_30_DAYS',
  this_month: 'THIS_MONTH',
  last_month: 'LAST_MONTH',
};

class GoogleProvider {
  constructor(config) {
    this.cfg = config.google;
  }

  async getInsights(dateRange = 'last_7d') {
    const { developer_token, client_id, client_secret, refresh_token, customer_id } = this.cfg;
    const gaRange = DATE_RANGE_MAP[dateRange];
    const cleanCustomerId = customer_id.replace(/-/g, '');

    const client = new GoogleAdsApi({ client_id, client_secret, developer_token });
    const customer = client.Customer({ customer_id: cleanCustomerId, refresh_token });

    const today = new Date().toISOString().slice(0, 10);
    const dateClause = gaRange
      ? `segments.date DURING ${gaRange}`
      : `segments.date BETWEEN '2010-01-01' AND '${today}'`;

    const rows = await customer.query(`
      SELECT
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE ${dateClause}
    `);

    const totals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0 };

    for (const row of rows) {
      const m = row.metrics ?? {};
      // google-ads-api returns camelCase field names
      totals.spend += ((m.cost_micros ?? m.costMicros ?? 0) / 1_000_000);
      totals.impressions += (m.impressions ?? 0);
      totals.clicks += (m.clicks ?? 0);
      totals.conversions += (m.conversions ?? 0);
      totals.conversions_value += (m.conversions_value ?? m.conversionsValue ?? 0);
    }

    const { spend, impressions, clicks, conversions, conversions_value } = totals;

    return {
      spend,
      impressions,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions * 100) : 0,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions * 1000) : null,
      reach: null,
      frequency: null,
      conversions,
      conversion_rate: clicks > 0 ? (conversions / clicks * 100) : 0,
      cpa: conversions > 0 ? spend / conversions : null,
      roas: spend > 0 ? conversions_value / spend : null,
    };
  }
}

module.exports = GoogleProvider;
