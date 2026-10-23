'use strict';

/**
 * Helpers for grouping self-registered users into a company by email domain.
 * Free/public mailbox domains are never shared: everyone on gmail.com is not one company.
 */

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.in', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
  'zoho.com', 'zohomail.com', 'zohomail.in', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru',
  'rediffmail.com', 'tutanota.com', 'tuta.io', 'fastmail.com', 'hey.com', 'qq.com', '163.com', '126.com'
]);

const PUBLIC_DOMAIN_EXTRA = String(process.env.PUBLIC_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
PUBLIC_DOMAIN_EXTRA.forEach((d) => PUBLIC_EMAIL_DOMAINS.add(d));

/** Returns the lower-cased domain part of an email, or null when the email is malformed. */
const emailDomain = (email) => {
  const value = String(email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  const domain = value.slice(at + 1);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
};

const isPublicEmailDomain = (domain) => PUBLIC_EMAIL_DOMAINS.has(String(domain || '').toLowerCase());

/** "acme-corp.co.in" -> "Acme Corp" */
const companyNameFromDomain = (domain) => {
  const label = String(domain || '').split('.')[0] || 'Company';
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Company';
};

module.exports = { emailDomain, isPublicEmailDomain, companyNameFromDomain };
