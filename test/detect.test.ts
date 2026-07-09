import { describe, expect, it } from 'vitest';
import { classify, referrerHost } from '../src/detect';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36';

describe('bots and unfurlers', () => {
  it('flags WhatsApp unfurler as whatsapp bot', () => {
    const c = classify('WhatsApp/2.23.20.0', '');
    expect(c).toMatchObject({ medium: 'whatsapp', isBot: true, device: 'bot' });
  });

  it('flags Telegram unfurler', () => {
    const c = classify('TelegramBot (like TwitterBot)', '');
    expect(c).toMatchObject({ medium: 'telegram', isBot: true });
  });

  it('flags Slack unfurler', () => {
    const c = classify('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', '');
    expect(c).toMatchObject({ medium: 'slack', isBot: true });
  });

  it('flags facebookexternalhit', () => {
    const c = classify('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', '');
    expect(c).toMatchObject({ medium: 'facebook', isBot: true });
  });

  it('flags Twitterbot', () => {
    expect(classify('Twitterbot/1.0', '')).toMatchObject({ medium: 'twitter', isBot: true });
  });

  it('flags Discordbot', () => {
    const c = classify('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', '');
    expect(c).toMatchObject({ medium: 'discord', isBot: true });
  });

  it('flags LinkedInBot', () => {
    const c = classify('LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)', '');
    expect(c).toMatchObject({ medium: 'linkedin', isBot: true });
  });

  it('flags Googlebot as generic bot', () => {
    const c = classify(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/126.0.0.0 Safari/537.36',
      ''
    );
    expect(c).toMatchObject({ medium: 'bot', isBot: true });
  });

  it('flags curl', () => {
    expect(classify('curl/8.6.0', '')).toMatchObject({ medium: 'bot', isBot: true });
  });

  it('flags python-requests', () => {
    expect(classify('python-requests/2.31.0', '')).toMatchObject({ medium: 'bot', isBot: true });
  });

  it('flags empty user-agent', () => {
    expect(classify('', '')).toMatchObject({ medium: 'bot', isBot: true });
  });

  it('flags generic word-boundary bot', () => {
    expect(classify('Mozilla/5.0 (compatible; SomeNewBot/1.0)', '')).toMatchObject({ isBot: true });
  });

  it('does NOT flag Cubot phone as bot', () => {
    const c = classify(
      'Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.181 Mobile Safari/537.36',
      ''
    );
    expect(c.isBot).toBe(false);
  });
});

describe('in-app browsers', () => {
  it('detects Instagram in-app on iOS', () => {
    const c = classify(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.34.90 (iPhone15,2; iOS 17_0; en_SG)',
      ''
    );
    expect(c).toMatchObject({ medium: 'instagram', os: 'ios', device: 'mobile', isBot: false });
  });

  it('detects Instagram before generic FB tokens', () => {
    const c = classify(
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.42.101 Android FBAN/InstagramForAndroid',
      ''
    );
    expect(c.medium).toBe('instagram');
  });

  it('detects Facebook in-app (FBAV/FB_IAB)', () => {
    const c = classify(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AD1A.240418.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/467.0.0.45.83;]',
      ''
    );
    expect(c).toMatchObject({ medium: 'facebook', os: 'android', device: 'mobile', isBot: false });
  });

  it('detects Messenger before Facebook', () => {
    const c = classify(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/460.0.0.36.109;FBBV/588019631]',
      ''
    );
    expect(c.medium).toBe('messenger');
  });

  it('detects TikTok in-app', () => {
    const c = classify(
      'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36 musical_ly_2023505030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly',
      ''
    );
    expect(c).toMatchObject({ medium: 'tiktok', isBot: false });
  });

  it('detects WeChat', () => {
    const c = classify(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2d) NetType/WIFI Language/en',
      ''
    );
    expect(c.medium).toBe('wechat');
  });

  it('detects LINE without matching the word "outline"', () => {
    const line = classify(`${IPHONE_SAFARI} Line/14.0.1`, '');
    expect(line.medium).toBe('line');
    const notLine = classify(MAC_CHROME, 'https://outline.com/page');
    expect(notLine.medium).toBe('referral');
  });

  it('detects Twitter for iPhone', () => {
    const c = classify(`${IPHONE_SAFARI.replace(' Safari/604.1', '')} Twitter for iPhone/10.20`, '');
    expect(c.medium).toBe('twitter');
  });

  it('detects LinkedIn app', () => {
    const c = classify(`${ANDROID_CHROME} LinkedInApp/4.1.900`, '');
    expect(c.medium).toBe('linkedin');
  });
});

describe('referrer-based mediums', () => {
  it('t.co → twitter', () => {
    expect(classify(MAC_CHROME, 'https://t.co/AbC123').medium).toBe('twitter');
  });

  it('l.facebook.com → facebook', () => {
    expect(classify(IPHONE_SAFARI, 'https://l.facebook.com/l.php?u=x').medium).toBe('facebook');
  });

  it('t.me → telegram', () => {
    expect(classify(MAC_CHROME, 'https://t.me/somechannel/42').medium).toBe('telegram');
  });

  it('web.whatsapp.com → whatsapp', () => {
    expect(classify(MAC_CHROME, 'https://web.whatsapp.com/').medium).toBe('whatsapp');
  });

  it('gmail → email', () => {
    expect(classify(MAC_CHROME, 'https://mail.google.com/mail/u/0/').medium).toBe('email');
  });

  it('google search → search', () => {
    expect(classify(MAC_CHROME, 'https://www.google.com.sg/search?q=x').medium).toBe('search');
    expect(classify(MAC_CHROME, 'https://www.google.com/').medium).toBe('search');
  });

  it('unknown site → referral', () => {
    expect(classify(MAC_CHROME, 'https://someblog.example.com/post').medium).toBe('referral');
  });

  it('no referrer, plain browser → direct', () => {
    expect(classify(IPHONE_SAFARI, '').medium).toBe('direct');
  });

  it('malformed referrer → direct', () => {
    expect(classify(MAC_CHROME, 'not a url').medium).toBe('direct');
  });
});

describe('browser / os / device', () => {
  it('iPhone Safari', () => {
    expect(classify(IPHONE_SAFARI, '')).toMatchObject({ browser: 'safari', os: 'ios', device: 'mobile' });
  });

  it('Mac Chrome', () => {
    expect(classify(MAC_CHROME, '')).toMatchObject({ browser: 'chrome', os: 'macos', device: 'desktop' });
  });

  it('Android Chrome mobile', () => {
    expect(classify(ANDROID_CHROME, '')).toMatchObject({ browser: 'chrome', os: 'android', device: 'mobile' });
  });

  it('Windows Edge', () => {
    const c = classify(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
      ''
    );
    expect(c).toMatchObject({ browser: 'edge', os: 'windows', device: 'desktop' });
  });

  it('iPad → tablet', () => {
    const c = classify(
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ''
    );
    expect(c).toMatchObject({ os: 'ios', device: 'tablet' });
  });

  it('Android webview marker', () => {
    const c = classify(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AD1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36',
      ''
    );
    expect(c.browser).toBe('webview');
  });

  it('Firefox on Linux', () => {
    const c = classify('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', '');
    expect(c).toMatchObject({ browser: 'firefox', os: 'linux', device: 'desktop' });
  });
});

describe('referrerHost', () => {
  it('normalizes host and strips www', () => {
    expect(referrerHost('https://www.Example.com/path?q=1')).toBe('example.com');
  });
  it('returns null for empty or malformed', () => {
    expect(referrerHost('')).toBeNull();
    expect(referrerHost('nope')).toBeNull();
  });
});
