require('dotenv').config();
const express = require('express');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'captures.json');
const BITLY_TOKEN = process.env.BITLY_TOKEN;

let sseClients = [];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function readCaptures() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveCapture(data) {
  const captures = readCaptures();
  captures.push(data);
  fs.writeFileSync(DATA_FILE, JSON.stringify(captures, null, 2));
}

async function getGeo(ip) {
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'unknown') {
    return { city: 'Local', country: 'Local', flag: '💻' };
  }
  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=city,country,countryCode,query`, { timeout: 3000 });
    if (res.data && res.data.city) {
      const code = (res.data.countryCode || '').toLowerCase();
      const flag = code ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 0x61)) : '🏳';
      return { city: res.data.city, country: res.data.country, flag };
    }
  } catch {}
  return { city: 'Unknown', country: 'Unknown', flag: '🌍' };
}

function notifyClients(capture) {
  const msg = JSON.stringify(capture);
  for (const client of sseClients) {
    client.write(`data: ${msg}\n\n`);
  }
}

app.get('/', async (req, res) => {
  const parser = new UAParser(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const geo = await getGeo(ip);

  const capture = {
    ip,
    city: geo.city,
    country: geo.country,
    flag: geo.flag,
    os: `${parser.getOS().name} ${parser.getOS().version}`,
    browser: `${parser.getBrowser().name} ${parser.getBrowser().version}`,
    device: parser.getDevice().type || 'desktop',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    referer: req.headers['referer'] || 'direct'
  };

  saveCapture(capture);
  notifyClients(capture);
  res.render('index', { capture });
});

app.get('/dashboard', (req, res) => {
  const captures = readCaptures();
  res.render('dashboard', { captures, count: captures.length });
});

app.get('/api/captures', (req, res) => {
  res.json(readCaptures());
});

app.get('/api/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  sseClients.push(res);
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

app.post('/api/shorten', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const response = await axios.post('https://api-ssl.bitly.com/v4/shorten', {
      long_url: url
    }, {
      headers: {
        'Authorization': `Bearer ${BITLY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ link: response.data.link });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to shorten URL',
      details: err.response?.data || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
