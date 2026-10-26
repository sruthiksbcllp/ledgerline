'use strict';

/**
 * The catalog behind Settings → Integrations. Each entry describes one external app:
 *
 *   auth: 'oauth2'      - admin clicks Connect and signs in at the provider (Zoho Books, NetSuite).
 *                         The OAuth app's client ID / secret come from .env only.
 *         'credentials' - admin enters the app's API details in a form (Tally, SAP, GSP, RazorpayX,
 *                         WhatsApp). Fields marked `secret` are stored encrypted and never returned.
 *         'link'        - managed on another LedgerLine screen (Email account).
 *         'platform'    - configured once for the whole LedgerLine server via .env (AWS AI services).
 *
 *   verify(ctx)  - a real, read-only call to the provider that proves the connection works. It returns
 *                  { label, externalId, config } for the card, or throws IntegrationError. A provider
 *                  without `verify` is saved as SAVED ("not verified"), never as CONNECTED.
 *
 * To add an app: add an entry here. The routes, UI and storage pick it up automatically.
 */
const { IntegrationError, assertSafeUrl, httpRequest, basicAuth } = require('./common');

const env = (name) => String(process.env[name] || '').trim();
const missingEnv = (names) => names.filter((n) => !env(n));
const trimSlash = (s) => String(s || '').trim().replace(/\/+$/, '');
const providerMessage = (body, fallback) => body?.message || body?.error?.message || body?.error_description
  || body?.['o:errorDetails']?.[0]?.detail || body?.title || fallback;

// ── Zoho Books ───────────────────────────────────────────────────────────────
// Zoho runs separate data centres (.com, .in, .eu, ...). The user signs in at ZOHO_ACCOUNTS_URL and
// Zoho redirects back with `accounts-server` naming their data centre; tokens must be exchanged
// there. Both that and the token's `api_domain` are checked against Zoho's own domains.
const ZOHO_ACCOUNTS_RE = /^https:\/\/accounts\.zoho(cloud)?\.[a-z]{2,3}(\.[a-z]{2})?$/i;
const ZOHO_API_RE = /^https:\/\/www\.zohoapis(cloud)?\.[a-z]{2,3}(\.[a-z]{2})?$/i;
const zohoAccounts = (config) => {
  const url = trimSlash(config?.accounts_server || env('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.in');
  if (!ZOHO_ACCOUNTS_RE.test(url)) throw new IntegrationError('Unexpected Zoho accounts server', 400, 'ZOHO_BAD_DC');
  return url;
};

// ── NetSuite ─────────────────────────────────────────────────────────────────
// Account IDs like "1234567_SB1" become "1234567-sb1" in NetSuite host names.
const netsuiteHost = (config) => {
  const id = String(config?.account_id || '').trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) throw new IntegrationError('Enter your NetSuite account ID (Setup → Company → Company Information)', 400, 'NETSUITE_ACCOUNT');
  return id.toLowerCase().replace(/_/g, '-');
};

// ── Tally ────────────────────────────────────────────────────────────────────
const TALLY_COMPANIES_XML = '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>'
  + '<ID>List of Companies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>'
  + '</STATICVARIABLES></DESC></BODY></ENVELOPE>';
const xmlDecode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const PROVIDERS = {
  zoho_books: {
    name: 'Zoho Books',
    category: 'Accounting & ERP',
    description: 'Sync vendors, bills, invoices and journal entries with your Zoho Books organisation.',
    planned: ['Two-way vendor and customer master sync', 'Push approved vendor bills and customer invoices', 'Post journal entries to the Zoho Books ledger', 'Pull payment status for reconciliation'],
    auth: 'oauth2',
    docsUrl: 'https://www.zoho.com/books/api/v3/oauth/',
    requiredEnv: ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'],
    fields: [],
    oauth: {
      clientId: () => env('ZOHO_CLIENT_ID'),
      clientSecret: () => env('ZOHO_CLIENT_SECRET'),
      authorizeUrl: (config) => `${zohoAccounts(config)}/oauth/v2/auth`,
      tokenUrl: (config) => `${zohoAccounts(config)}/oauth/v2/token`,
      scope: () => env('ZOHO_BOOKS_SCOPES') || 'ZohoBooks.fullaccess.all',
      pkce: false,
      clientAuth: 'body',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      // Zoho tells us which data centre the user belongs to.
      onCallback: (query, config) => {
        const server = trimSlash(query['accounts-server']);
        if (server && !ZOHO_ACCOUNTS_RE.test(server)) throw new IntegrationError('Zoho returned an unexpected accounts server', 400, 'ZOHO_BAD_DC');
        return server ? { ...config, accounts_server: server } : config;
      },
      afterToken: (tokens, config) => {
        const apiDomain = trimSlash(tokens.api_domain || 'https://www.zohoapis.in');
        if (!ZOHO_API_RE.test(apiDomain)) throw new IntegrationError('Zoho returned an unexpected API domain', 502, 'ZOHO_BAD_DC');
        return { ...config, api_domain: apiDomain };
      },
      revoke: async ({ config, refreshToken }) => {
        await httpRequest(`${zohoAccounts(config)}/oauth/v2/token/revoke?${new URLSearchParams({ token: refreshToken })}`, { method: 'POST' });
      }
    },
    verify: async ({ config, accessToken }) => {
      const apiDomain = trimSlash(config.api_domain);
      if (!ZOHO_API_RE.test(apiDomain)) throw new IntegrationError('Zoho API domain is missing. Connect again.', 409, 'RECONNECT');
      const res = await httpRequest(`${apiDomain}/books/v3/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
      if (res.status === 401) throw new IntegrationError('Zoho rejected the access token. Connect again.', 409, 'RECONNECT');
      if (!res.ok || res.body?.code !== 0) throw new IntegrationError(`Zoho Books: ${providerMessage(res.body, `request failed (${res.status})`)}`, 502, 'PROVIDER_ERROR');
      const orgs = res.body.organizations || [];
      if (!orgs.length) throw new IntegrationError('This Zoho account has no Zoho Books organisation. Create one in Zoho Books and connect again.', 422, 'ZOHO_NO_ORG');
      const chosen = orgs.find((o) => String(o.organization_id) === String(config.organization_id))
        || orgs.find((o) => o.is_default_org) || orgs[0];
      return {
        label: chosen.name,
        externalId: String(chosen.organization_id),
        config: {
          ...config,
          organization_id: String(chosen.organization_id),
          organization_name: chosen.name,
          organizations: orgs.map((o) => ({ id: String(o.organization_id), name: o.name }))
        }
      };
    }
  },

  tally: {
    name: 'Tally Prime',
    category: 'Accounting & ERP',
    description: 'Post vouchers and read ledgers from Tally running on your office PC or server.',
    planned: ['Post purchase, payment and journal vouchers', 'Read ledger masters and balances', 'Sync vendor ledgers'],
    auth: 'credentials',
    docsUrl: 'https://help.tallysolutions.com/integrate-with-tallyprime/',
    note: 'Tally runs on your own PC. In Tally, enable the HTTP server (F1 Help → Settings → Connectivity, port 9000) and make it reachable from LedgerLine (static IP, VPN or a secure tunnel).',
    requiredEnv: [],
    fields: [
      { name: 'server_url', label: 'Tally server URL', type: 'url', required: true, placeholder: 'http://tally.yourcompany.com:9000' },
      { name: 'company_name', label: 'Company name in Tally', type: 'text', required: false, placeholder: 'Exactly as shown in Tally (optional)' }
    ],
    verify: async ({ config }) => {
      const url = await assertSafeUrl(config.server_url, { label: 'Tally server URL' });
      const res = await httpRequest(url.toString(), { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: TALLY_COMPANIES_XML, timeoutMs: 10000 });
      if (!res.ok || !/<ENVELOPE/i.test(res.text)) throw new IntegrationError(`Tally did not answer at ${url.host} (${res.status}). Check that Tally is open and its HTTP server is on.`, 502, 'PROVIDER_ERROR');
      const companies = [...new Set([...res.text.matchAll(/<COMPANY\s+NAME="([^"]+)"/gi)].map((m) => xmlDecode(m[1])))];
      const wanted = String(config.company_name || '').trim();
      if (wanted && companies.length && !companies.some((c) => c.toLowerCase() === wanted.toLowerCase())) {
        throw new IntegrationError(`Tally is reachable, but "${wanted}" is not open in Tally. Open companies: ${companies.join(', ')}`, 422, 'TALLY_COMPANY');
      }
      return { label: wanted || companies[0] || `Tally at ${url.host}`, externalId: url.host, config: { ...config, server_url: url.toString().replace(/\/$/, '') } };
    }
  },

  netsuite: {
    name: 'Oracle NetSuite',
    category: 'Accounting & ERP',
    description: 'Exchange vendors, purchase orders, vendor bills and journals with NetSuite through SuiteTalk REST.',
    planned: ['Vendor and item master sync', 'Push purchase orders and vendor bills', 'Post journals by subsidiary'],
    auth: 'oauth2',
    docsUrl: 'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_158074210415.html',
    note: 'In NetSuite, create an Integration record with "Authorization Code Grant" and the REST Web Services scope, and set its redirect URI to the one shown below.',
    requiredEnv: ['NETSUITE_CLIENT_ID', 'NETSUITE_CLIENT_SECRET'],
    fields: [
      { name: 'account_id', label: 'NetSuite account ID', type: 'text', required: true, placeholder: '1234567 or 1234567_SB1', defaultEnv: 'NETSUITE_ACCOUNT_ID' }
    ],
    oauth: {
      clientId: () => env('NETSUITE_CLIENT_ID'),
      clientSecret: () => env('NETSUITE_CLIENT_SECRET'),
      authorizeUrl: (config) => `https://${netsuiteHost(config)}.app.netsuite.com/app/login/oauth2/authorize.nl`,
      tokenUrl: (config) => `https://${netsuiteHost(config)}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`,
      scope: () => 'rest_webservices',
      pkce: true,
      clientAuth: 'basic'
    },
    verify: async ({ config, accessToken }) => {
      const res = await httpRequest(`https://${netsuiteHost(config)}.suitetalk.api.netsuite.com/services/rest/record/v1/subsidiary?limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
      });
      if (res.status === 401) throw new IntegrationError('NetSuite rejected the access token. Connect again.', 409, 'RECONNECT');
      if (!res.ok) throw new IntegrationError(`NetSuite: ${providerMessage(res.body, `request failed (${res.status})`)}`, 502, 'PROVIDER_ERROR');
      return { label: `Account ${String(config.account_id).toUpperCase()}`, externalId: String(config.account_id).toUpperCase(), config };
    }
  },

  sap: {
    name: 'SAP S/4HANA',
    category: 'Accounting & ERP',
    description: 'Connect to SAP S/4HANA (Cloud or on-premise) OData APIs with a communication user.',
    planned: ['Business partner (vendor) sync', 'Push purchase orders and supplier invoices', 'Post journal entries by company code'],
    auth: 'credentials',
    docsUrl: 'https://api.sap.com/products/SAPS4HANACloud/apis/ODATA',
    note: 'Create a Communication User and a Communication Arrangement that includes the Business Partner API (SAP_COM_0008) in S/4HANA.',
    requiredEnv: [],
    fields: [
      { name: 'base_url', label: 'API host', type: 'url', required: true, placeholder: 'https://my123456-api.s4hana.cloud.sap' },
      { name: 'sap_client', label: 'SAP client', type: 'text', required: false, placeholder: '100 (on-premise only)', pattern: '^\\d{3}$' },
      { name: 'username', label: 'Communication user', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true, secret: true }
    ],
    verify: async ({ config, secrets }) => {
      const base = await assertSafeUrl(config.base_url, { httpsOnly: true, label: 'SAP API host' });
      const url = new URL('/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata', base);
      if (config.sap_client) url.searchParams.set('sap-client', config.sap_client);
      const res = await httpRequest(url.toString(), { headers: { Authorization: basicAuth(config.username, secrets.password), Accept: 'application/xml' } });
      if (res.status === 401) throw new IntegrationError('SAP rejected the user name or password.', 422, 'BAD_CREDENTIALS');
      if (res.status === 403) throw new IntegrationError('SAP accepted the login, but this user may not use the Business Partner API. Check the communication arrangement.', 422, 'FORBIDDEN');
      if (!res.ok) throw new IntegrationError(`SAP answered ${res.status}. Check the API host.`, 502, 'PROVIDER_ERROR');
      return { label: `${config.username} @ ${base.host}`, externalId: base.host, config: { ...config, base_url: base.origin } };
    }
  },

  gsp: {
    name: 'GST portal (GSP)',
    category: 'Tax & Compliance',
    description: 'File GSTR returns, generate e-invoices / e-way bills and pull GSTR-2B through your GST Suvidha Provider.',
    planned: ['Pull GSTR-2A / 2B for input tax credit matching', 'Generate e-invoice IRN and e-way bills', 'Validate vendor GSTINs'],
    auth: 'credentials',
    docsUrl: 'https://www.gstn.org.in/gsp',
    note: 'Each GSP (ClearTax, Masters India, IRIS, ...) has its own API. Details are stored securely now; a live check is added when the adapter for your GSP is activated.',
    requiredEnv: [],
    fields: [
      { name: 'gsp_name', label: 'GSP', type: 'select', required: true, options: ['ClearTax', 'Masters India', 'IRIS GST', 'Cygnet', 'Other'] },
      { name: 'api_base_url', label: 'GSP API URL', type: 'url', required: true, placeholder: 'https://api.your-gsp.com' },
      { name: 'gstin', label: 'GSTIN', type: 'text', required: true, placeholder: '29ABCDE1234F1Z5', pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$', uppercase: true },
      { name: 'gst_username', label: 'GST portal username', type: 'text', required: true },
      { name: 'client_id', label: 'GSP client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'GSP client secret', type: 'password', required: true, secret: true }
    ],
    validate: async ({ config }) => {
      const url = await assertSafeUrl(config.api_base_url, { httpsOnly: true, label: 'GSP API URL' });
      return { label: `${config.gsp_name} · ${config.gstin}`, externalId: config.gstin, config: { ...config, api_base_url: url.origin } };
    }
  },

  razorpayx: {
    name: 'RazorpayX (Bank payouts)',
    category: 'Banking & Payments',
    description: 'Pay vendors from your current account and track payout status and UTRs automatically.',
    planned: ['Pay approved vendor invoices by NEFT / RTGS / IMPS / UPI', 'Track payout status and UTR numbers', 'Bank statement feed for reconciliation'],
    auth: 'credentials',
    docsUrl: 'https://razorpay.com/docs/x/api-keys/',
    note: 'Generate API keys in RazorpayX → Account & Settings → Developer Controls. Use test-mode keys until you are ready to pay real vendors.',
    requiredEnv: [],
    fields: [
      { name: 'key_id', label: 'Key ID', type: 'text', required: true, placeholder: 'rzp_live_... or rzp_test_...', pattern: '^rzp_(live|test)_[A-Za-z0-9]+$' },
      { name: 'key_secret', label: 'Key secret', type: 'password', required: true, secret: true },
      { name: 'account_number', label: 'RazorpayX account number', type: 'text', required: true, pattern: '^[0-9]{6,20}$' },
      { name: 'webhook_secret', label: 'Webhook secret', type: 'password', required: false, secret: true, help: 'Optional. Needed later for payout status webhooks.' }
    ],
    verify: async ({ config, secrets }) => {
      const res = await httpRequest('https://api.razorpay.com/v1/contacts?count=1', { headers: { Authorization: basicAuth(config.key_id, secrets.key_secret) } });
      if (res.status === 401) throw new IntegrationError('Razorpay rejected the key ID or secret.', 422, 'BAD_CREDENTIALS');
      if (!res.ok) throw new IntegrationError(`RazorpayX: ${providerMessage(res.body?.error ? { message: res.body.error.description } : res.body, `request failed (${res.status})`)}`, 502, 'PROVIDER_ERROR');
      const mode = config.key_id.startsWith('rzp_live_') ? 'Live' : 'Test';
      return { label: `${mode} · A/c ••••${String(config.account_number).slice(-4)}`, externalId: config.key_id, config: { ...config, mode: mode.toUpperCase() } };
    }
  },

  whatsapp: {
    name: 'WhatsApp Business',
    category: 'Communication',
    description: 'Send approval requests, payment advices and reminders on WhatsApp through the Meta Cloud API.',
    planned: ['Approval requests with approve / reject replies', 'Payment advices to vendors', 'Collection reminders to customers'],
    auth: 'credentials',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    note: 'In Meta Business Manager, create a System User with whatsapp_business_messaging permission and generate a permanent access token.',
    requiredEnv: [],
    fields: [
      { name: 'phone_number_id', label: 'Phone number ID', type: 'text', required: true, pattern: '^[0-9]{5,25}$' },
      { name: 'waba_id', label: 'WhatsApp Business account ID', type: 'text', required: false, pattern: '^[0-9]{5,25}$' },
      { name: 'access_token', label: 'Permanent access token', type: 'password', required: true, secret: true }
    ],
    verify: async ({ config, secrets }) => {
      const version = env('WHATSAPP_GRAPH_VERSION') || 'v21.0';
      const res = await httpRequest(`https://graph.facebook.com/${version}/${encodeURIComponent(config.phone_number_id)}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${secrets.access_token}` }
      });
      if (res.status === 401 || res.body?.error?.code === 190) throw new IntegrationError('Meta rejected the access token.', 422, 'BAD_CREDENTIALS');
      if (!res.ok) throw new IntegrationError(`WhatsApp: ${providerMessage(res.body, `request failed (${res.status})`)}`, 502, 'PROVIDER_ERROR');
      return { label: `${res.body.verified_name || 'WhatsApp'} (${res.body.display_phone_number || config.phone_number_id})`, externalId: config.phone_number_id, config };
    }
  },

  microsoft_365: {
    name: 'Microsoft 365 / Outlook',
    category: 'Communication',
    description: 'Read vendor invoices from a shared Outlook mailbox, add due dates to calendars and keep documents in SharePoint / OneDrive.',
    planned: ['Pick up vendor invoices from a shared AP mailbox', 'Payment and period-close reminders in Outlook calendar', 'Store invoices and supporting documents in SharePoint / OneDrive'],
    auth: 'oauth2',
    docsUrl: 'https://learn.microsoft.com/en-us/graph/auth-v2-user',
    note: 'Uses the same Microsoft Entra app registration as Email account sign-in; add the redirect URI below to it.',
    // Same app registration as mailbox sign-in (services/mailOAuth.service.js), extra delegated scopes.
    requiredEnv: ['MICROSOFT_OAUTH_CLIENT_ID', 'MICROSOFT_OAUTH_CLIENT_SECRET'],
    fields: [],
    oauth: {
      clientId: () => env('MICROSOFT_OAUTH_CLIENT_ID'),
      clientSecret: () => env('MICROSOFT_OAUTH_CLIENT_SECRET'),
      authorizeUrl: () => `https://login.microsoftonline.com/${env('MICROSOFT_OAUTH_TENANT') || 'common'}/oauth2/v2.0/authorize`,
      tokenUrl: () => `https://login.microsoftonline.com/${env('MICROSOFT_OAUTH_TENANT') || 'common'}/oauth2/v2.0/token`,
      scope: () => 'openid email profile offline_access User.Read Mail.Read Calendars.ReadWrite Files.ReadWrite',
      pkce: true,
      clientAuth: 'body',
      extraAuthParams: { prompt: 'select_account' }
    },
    verify: async ({ accessToken }) => {
      const res = await httpRequest('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.status === 401) throw new IntegrationError('Microsoft rejected the access token. Connect again.', 409, 'RECONNECT');
      if (!res.ok) throw new IntegrationError(`Microsoft 365: ${providerMessage(res.body, `request failed (${res.status})`)}`, 502, 'PROVIDER_ERROR');
      const email = res.body.mail || res.body.userPrincipalName;
      return { label: `${res.body.displayName || email} (${email})`, externalId: res.body.id, config: {} };
    }
  },

  email: {
    name: 'Email account',
    category: 'Communication',
    description: 'RFQs and vendor emails are sent from your own Outlook or Gmail mailbox.',
    auth: 'link',
    link: '/settings/email-account',
    requiredEnv: [],
    fields: []
  },

  aws_ai: {
    name: 'AWS Textract + Bedrock',
    category: 'AI & Document Processing',
    description: 'OCR for scanned invoices (Textract) and AI extraction / insights (Bedrock).',
    planned: ['Read scanned and photographed invoices', 'AI extraction of invoice fields and line items'],
    auth: 'platform',
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html',
    note: 'Set once for the whole LedgerLine server by the platform team, using an IAM user or role allowed textract:AnalyzeExpense and bedrock:InvokeModel.',
    requiredEnv: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BEDROCK_MODEL_ID'],
    fields: [],
    verify: async () => {
      let Bedrock;
      try { Bedrock = require('@aws-sdk/client-bedrock'); } catch (_) {
        throw new IntegrationError('Install @aws-sdk/client-bedrock and @aws-sdk/client-textract on the server to activate AWS AI services.', 501, 'SDK_MISSING');
      }
      const client = new Bedrock.BedrockClient({ region: env('BEDROCK_REGION') || env('AWS_REGION') });
      try {
        const out = await client.send(new Bedrock.GetFoundationModelCommand({ modelIdentifier: env('BEDROCK_MODEL_ID') }));
        return { label: `${out.modelDetails?.modelName || env('BEDROCK_MODEL_ID')} · ${env('AWS_REGION')}` };
      } catch (e) {
        throw new IntegrationError(`AWS: ${e.message}`, 502, 'PROVIDER_ERROR');
      }
    }
  }
};

const providerOf = (key) => {
  const p = PROVIDERS[String(key || '').toLowerCase()];
  if (!p) throw new IntegrationError('Unknown integration', 404, 'UNKNOWN_PROVIDER');
  return p;
};

module.exports = { PROVIDERS, providerOf, missingEnv, env };
