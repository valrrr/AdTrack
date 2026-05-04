const axios = require('axios');

const GRAPH_API = 'https://graph.facebook.com/v19.0';

const DATE_PRESETS = {
  today:      'today',
  yesterday:  'yesterday',
  last_7d:    'last_7d',
  last_30d:   'last_30d',
  this_month: 'this_month',
  last_month: 'last_month',
  maximum:    'maximum',
};

class MetaProvider {
  constructor(config) {
    this.cfg = config.meta;
  }

  async getInsights(dateRange = 'last_7d') {
    const { app_id, app_secret, access_token, ad_account_id } = this.cfg;

    const fields = [
      'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm',
      'reach', 'frequency', 'actions', 'cost_per_action_type', 'purchase_roas',
    ].join(',');

    const { data } = await axios.get(`${GRAPH_API}/act_${ad_account_id}/insights`, {
      params: {
        fields,
        date_preset: DATE_PRESETS[dateRange] ?? 'last_7d',
        level: 'account',
        access_token,
      },
    });

    const rows = data?.data ?? [];
    if (!rows.length) return this._empty();

    const row = rows[0];
    const spend = parseFloat(row.spend ?? 0);
    const impressions = parseInt(row.impressions ?? 0, 10);
    const clicks = parseInt(row.clicks ?? 0, 10);
    const reach = parseInt(row.reach ?? 0, 10);

    // Purchase conversions
    let conversions = 0;
    const purchaseTypes = new Set(['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase']);
    for (const action of row.actions ?? []) {
      if (purchaseTypes.has(action.action_type)) conversions += parseFloat(action.value ?? 0);
    }

    // ROAS
    let roas = null;
    if (row.purchase_roas?.length) {
      const r = parseFloat(row.purchase_roas[0]?.value ?? 0);
      if (r > 0) roas = r;
    }

    return {
      spend,
      impressions,
      clicks,
      ctr: parseFloat(row.ctr ?? 0),
      cpc: row.cpc ? parseFloat(row.cpc) : null,
      cpm: parseFloat(row.cpm ?? 0),
      reach: reach > 0 ? reach : null,
      frequency: reach > 0 ? parseFloat(row.frequency ?? 0) : null,
      conversions,
      conversion_rate: clicks > 0 ? (conversions / clicks * 100) : 0,
      cpa: conversions > 0 ? spend / conversions : null,
      roas,
    };
  }

  _empty() {
    return Object.fromEntries(
      ['spend','impressions','clicks','ctr','cpc','cpm','reach','frequency','conversions','conversion_rate','cpa','roas']
        .map(k => [k, null])
    );
  }
}

module.exports = MetaProvider;
