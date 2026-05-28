# Ethical Hacking Project - Link Shortener Info Gatherer

An educational tool for demonstrating how URL shorteners can be used to gather visitor information (IP, OS, browser, device). Built for university ethical hacking coursework.

## Features
- Shorten URLs using the Bitly API
- Captures visitor IP address, OS, browser, device type, and timestamp
- Live dashboard to view all captured data
- Simple CLI script for URL shortening

## Setup

1. Add your Bitly API token to `.env`:
   ```
   BITLY_TOKEN=your_actual_token_here
   ```
   Get a token at: https://app.bitly.com/settings/api/

2. Install & run:
   ```
   npm install
   npm start
   ```

3. Open `http://localhost:3000` to see the capture page.
4. Open `http://localhost:3000/dashboard` to view captured data.

## Shortening URLs

Via dashboard: Paste a URL in the input box on the dashboard page.

Via CLI:
```
node bitly.js https://example.com
```

## Important
For educational purposes only. Always follow ethical guidelines and obtain proper authorization before testing.
