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

app.get('/', (req, res) => {
  const parser = new UAParser(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const capture = {
    ip,
    os: `${parser.getOS().name} ${parser.getOS().version}`,
    browser: `${parser.getBrowser().name} ${parser.getBrowser().version}`,
    device: parser.getDevice().type || 'desktop',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    referer: req.headers['referer'] || 'direct'
  };

  saveCapture(capture);
  res.render('index', { capture });
});

app.get('/dashboard', (req, res) => {
  const captures = readCaptures();
  res.render('dashboard', { captures, count: captures.length });
});

app.get('/api/captures', (req, res) => {
  res.json(readCaptures());
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
