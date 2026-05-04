const axios = require('axios');

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

function getDateRange(range) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt   = d => d.toISOString().slice(0, 10);

  switch (range) {
    case 'today':
      return { start: fmt(today), end: fmt(today) };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { start: fmt(y), end: fmt(y) };
    }
    case 'last_7d': {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { start: fmt(s), end: fmt(today) };
    }
    case 'last_30d': {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { start: fmt(s), end: fmt(today) };
    }
    case 'this_month':
      return { start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), end: fmt(today) };
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last  = new Date(first); last.setDate(0);
      return { start: fmt(new Date(last.getFullYear(), last.getMonth(), 1)), end: fmt(last) };
    }
    case 'maximum':
      return { start: '2018-01-01', end: fmt(today) };
    default: {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { start: fmt(s), end: fmt(today) };
    }
  }
}

class TiktokProvider {
  constructor(config) {
    this.cfg = config.tiktok ?? {};
  }

  async getInsights(dateRange) {
    const { access_token, advertiser_id } = this.cfg;
    const { start, end } = getDateRange(dateRange);

    const res = await axios.get(`${BASE}/report/integrated/get/`, {
      headers: { 'Access-Token': access_token },
      params: {
        advertiser_id,
        report_type: 'BASIC',
        dimensions:  JSON.stringify(['advertiser_id']),
        metrics:     JSON.stringify(['spend', 'impressions', 'clicks', 'conversions', 'cost_per_conversion', 'conversion_rate']),
        start_date:  start,
        end_date:    end,
        page_size:   1,
      },
    });

    const row = res.data?.data?.list?.[0]?.metrics ?? {};

    const spend       = parseFloat(row.spend       ?? 0);
    const impressions = parseInt(row.impressions   ?? 0, 10);
    const clicks      = parseInt(row.clicks        ?? 0, 10);
    const conversions = parseFloat(row.conversions ?? 0);

    return {
      spend,
      impressions,
      reach:           null,
      clicks,
      ctr:             impressions > 0 ? (clicks / impressions * 100) : 0,
      cpc:             clicks > 0 ? spend / clicks : null,
      cpm:             impressions > 0 ? (spend / impressions * 1000) : null,
      conversions,
      conversion_rate: clicks > 0 ? (conversions / clicks * 100) : 0,
      cpa:             conversions > 0 ? spend / conversions : null,
      roas:            null,
      frequency:       null,
    };
  }
}

module.exports = TiktokProvider;
