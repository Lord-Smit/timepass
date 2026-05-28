require('dotenv').config();
const axios = require('axios');

const BITLY_TOKEN = process.env.BITLY_TOKEN;
const url = process.argv[2];

if (!url) {
  console.error('Usage: node bitly.js <url-to-shorten>');
  process.exit(1);
}

if (!BITLY_TOKEN || BITLY_TOKEN === '135038f6b65495cf09bab7e2a628c76ca7aca03a') {
  console.error('Error: Set your BITLY_TOKEN in .env file');
  process.exit(1);
}

(async () => {
  try {
    const res = await axios.post('https://api-ssl.bitly.com/v4/shorten', {
      long_url: url
    }, {
      headers: {
        'Authorization': `Bearer ${BITLY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Shortened URL:', res.data.link);
  } catch (err) {
    console.error('Error:', err.response?.data?.description || err.message);
  }
})();
