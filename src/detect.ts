export interface Classification {
  medium: string;
  browser: string;
  os: string;
  device: string;
  isBot: boolean;
}

// Unfurlers/crawlers that identify a platform: still bots, but the platform is
// a useful signal ("this link was pasted into WhatsApp").
const BOT_SIGNATURES: ReadonlyArray<readonly [string, string]> = [
  ['whatsapp/', 'whatsapp'],
  ['telegrambot', 'telegram'],
  ['slackbot', 'slack'],
  ['slack-imgproxy', 'slack'],
  ['twitterbot', 'twitter'],
  ['facebookexternalhit', 'facebook'],
  ['facebookcatalog', 'facebook'],
  ['discordbot', 'discord'],
  ['linkedinbot', 'linkedin'],
  ['skypeuripreview', 'skype'],
  ['googleimageproxy', 'email'],
  ['pinterestbot', 'pinterest'],
  ['redditbot', 'reddit'],
];

const GENERIC_BOT_SIGNATURES: readonly string[] = [
  'googlebot',
  'adsbot-google',
  'bingbot',
  'applebot',
  'duckduckbot',
  'yandexbot',
  'baiduspider',
  'petalbot',
  'bytespider',
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'iframely',
  'embedly',
  'vkshare',
  'headlesschrome',
  'phantomjs',
  'lighthouse',
  'python-requests',
  'python-urllib',
  'curl/',
  'wget/',
  'go-http-client',
  'okhttp',
  'node-fetch',
  'axios/',
  'libwww',
];

// "bot" at a word end catches SomeNewBot/1.0 etc.; the lookbehind spares Cubot phones.
const GENERIC_BOT_RE = /(?<!cu)bot\b|\b(crawler|spider|crawl|scraper|preview|fetcher|monitor|validator)\b/i;

// In-app browser markers on human clicks. Order matters: Instagram and
// Messenger UAs also carry FBAN/FBAV tokens, so they must match first.
const IN_APP_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['instagram', 'instagram'],
  ['fban/messenger', 'messenger'],
  ['orca-android', 'messenger'],
  ['orca-ios', 'messenger'],
  ['fban', 'facebook'],
  ['fbav', 'facebook'],
  ['fb_iab', 'facebook'],
  ['tiktok', 'tiktok'],
  ['bytedancewebview', 'tiktok'],
  ['musical_ly', 'tiktok'],
  ['micromessenger', 'wechat'],
  ['snapchat', 'snapchat'],
  ['twitter for iphone', 'twitter'],
  ['twitterandroid', 'twitter'],
  ['linkedinapp', 'linkedin'],
  ['pinterest/', 'pinterest'],
  ['gsa/', 'google_app'],
];

const LINE_APP_RE = /\bline\/\d/i;

// Exact referrer hosts (matched after lowercasing and stripping "www.").
const REFERRER_HOSTS: Readonly<Record<string, string>> = {
  't.co': 'twitter',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'fb.com': 'facebook',
  'lnkd.in': 'linkedin',
  't.me': 'telegram',
  'telegram.me': 'telegram',
  'wa.me': 'whatsapp',
  'youtu.be': 'youtube',
  'news.ycombinator.com': 'hackernews',
  'mail.google.com': 'email',
  'outlook.live.com': 'email',
  'outlook.office.com': 'email',
  'outlook.office365.com': 'email',
  'mail.yahoo.com': 'email',
  'mail.proton.me': 'email',
  'bing.com': 'search',
  'duckduckgo.com': 'search',
  'search.yahoo.com': 'search',
  'baidu.com': 'search',
  'ecosia.org': 'search',
};

// Domain-suffix rules: match the host itself or any subdomain
// (covers l.facebook.com, lm.facebook.com, out.reddit.com, web.telegram.org, ...).
const REFERRER_SUFFIXES: ReadonlyArray<readonly [string, string]> = [
  ['facebook.com', 'facebook'],
  ['instagram.com', 'instagram'],
  ['linkedin.com', 'linkedin'],
  ['telegram.org', 'telegram'],
  ['whatsapp.com', 'whatsapp'],
  ['slack.com', 'slack'],
  ['discord.com', 'discord'],
  ['discordapp.com', 'discord'],
  ['tiktok.com', 'tiktok'],
  ['youtube.com', 'youtube'],
  ['reddit.com', 'reddit'],
];

function refHostname(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** Normalized referrer host for GROUP BY, or null. Exported for the click logger. */
export function referrerHost(referrer: string): string | null {
  return refHostname(referrer);
}

function mediumFromReferrer(referrer: string): string | null {
  const host = refHostname(referrer);
  if (!host) return null;
  const exact = REFERRER_HOSTS[host];
  if (exact) return exact;
  for (const [suffix, medium] of REFERRER_SUFFIXES) {
    if (host === suffix || host.endsWith('.' + suffix)) return medium;
  }
  if (host.startsWith('google.') || host.includes('.google.')) return 'search';
  return 'referral';
}

function detectOs(ua: string): string {
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('cros')) return 'chromeos';
  if (ua.includes('macintosh') || ua.includes('mac os x')) return 'macos';
  if (ua.includes('windows nt')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

function detectDevice(ua: string): string {
  if (ua.includes('ipad')) return 'tablet';
  if (ua.includes('android') && !ua.includes('mobile')) return 'tablet';
  if (/iphone|ipod/.test(ua) || ua.includes('mobile')) return 'mobile';
  return 'desktop';
}

function detectBrowser(ua: string): string {
  if (/edg\/|edgios|edga\//.test(ua)) return 'edge';
  if (/opr\/|opios/.test(ua)) return 'opera';
  if (ua.includes('samsungbrowser')) return 'samsung';
  if (/firefox\/|fxios/.test(ua)) return 'firefox';
  if (ua.includes('; wv)')) return 'webview';
  if (/crios|chrome\//.test(ua)) return 'chrome';
  if (ua.includes('version/') && ua.includes('safari/')) return 'safari';
  // WebKit without the Safari token = an iOS in-app webview.
  if (ua.includes('applewebkit') && !ua.includes('safari/')) return 'webview';
  return 'unknown';
}

export function classify(userAgent: string, referrer: string): Classification {
  const ua = (userAgent || '').toLowerCase().trim();

  if (!ua) {
    return { medium: 'bot', browser: 'unknown', os: 'unknown', device: 'bot', isBot: true };
  }

  for (const [sig, medium] of BOT_SIGNATURES) {
    if (ua.includes(sig)) {
      return { medium, browser: 'unknown', os: 'unknown', device: 'bot', isBot: true };
    }
  }
  if (GENERIC_BOT_SIGNATURES.some((sig) => ua.includes(sig)) || GENERIC_BOT_RE.test(ua)) {
    return { medium: 'bot', browser: 'unknown', os: 'unknown', device: 'bot', isBot: true };
  }

  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  const device = detectDevice(ua);

  let medium: string | null = null;
  for (const [marker, m] of IN_APP_MARKERS) {
    if (ua.includes(marker)) {
      medium = m;
      break;
    }
  }
  if (!medium && LINE_APP_RE.test(ua)) medium = 'line';
  if (!medium) medium = mediumFromReferrer(referrer);
  if (!medium) medium = 'direct';

  return { medium, browser, os, device, isBot: false };
}
