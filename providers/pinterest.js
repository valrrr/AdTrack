const axios = require('axios');

const BASE = 'https://api.pinterest.com/v5';

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
      return { start: '2014-01-01', end: fmt(today) };
    default: {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { start: fmt(s), end: fmt(today) };
    }
  }
}

class PinterestProvider {
  constructor(config) {
    this.cfg = config.pinterest ?? {};
  }

  async getInsights(dateRange) {
    const { access_token, ad_account_id } = this.cfg;
    const { start, end } = getDateRange(dateRange);

    const res = await axios.get(`${BASE}/ad_accounts/${ad_account_id}/analytics`, {
      headers: { Authorization: `Bearer ${access_token}` },
      params: {
        start_date:  start,
        end_date:    end,
        columns:     'SPEND_IN_DOLLAR,IMPRESSION_1,CLICK_1,TOTAL_CONVERSIONS,TOTAL_CONVERSIONS_VALUE_IN_MICRO_DOLLAR',
        granularity: 'TOTAL',
      },
    });

    const row = res.data?.[0] ?? {};

    const spend       = parseFloat(row.SPEND_IN_DOLLAR                          ?? 0);
    const impressions = parseInt(row.IMPRESSION_1                               ?? 0, 10);
    const clicks      = parseInt(row.CLICK_1                                    ?? 0, 10);
    const conversions = parseFloat(row.TOTAL_CONVERSIONS                        ?? 0);
    const revenue     = parseFloat(row.TOTAL_CONVERSIONS_VALUE_IN_MICRO_DOLLAR  ?? 0) / 1_000_000;

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
      roas:            spend > 0 && revenue > 0 ? revenue / spend : null,
      frequency:       null,
    };
  }
}

module.exports = PinterestProvider;
