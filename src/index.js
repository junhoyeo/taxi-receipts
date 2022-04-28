const queryString = require('query-string');
const cookie = require('cookie');
const { exit } = require('process');
const puppeteer = require('puppeteer');
const parseCurl = require('parse-curl');
const path = require('path');
const fs = require('fs').promises;

const omit = (prop, { [prop]: _, ...rest }) => rest;

const delay = (ms) =>
  new Promise((resolve) =>
    setTimeout(() => {
      resolve();
    }, ms),
  );

const getConfigurations = async () => {
  const buffer = await fs.readFile(path.join(__dirname, 'curl.raw'));
  const config = parseCurl(buffer.toString());

  let headers = omit('Host', config.header);
  headers = omit('Set-Cookie', headers);

  const rawCookies = config.header['Set-Cookie'] ?? '';
  const cookies = cookie.parse(rawCookies);

  return { headers, cookies };
};

const main = async () => {
  const { headers, cookies } = await getConfigurations();

  const browserSize = {
    width: 375,
    height: 1200,
  };
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: browserSize,
    args: [
      `--window-size=${browserSize.width},${browserSize.height}`,
      '--disable-notifications',
    ],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148/KakaoTApp v5.11.0',
  );

  await page.setExtraHTTPHeaders(headers);

  const cookieList = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: 'service.kakaomobility.com',
  }));
  await page.setCookie(...cookieList);

  await page.goto('https://service.kakaomobility.com/history');

  const historyURL = queryString.stringifyUrl({
    url: 'https://service.kakaomobility.com/api/history/records/template',
    query: {
      offset: 0,
      limit: 5,
      products: 'TAXI',
    },
  });
  const data = await page.evaluate(async (historyURL) => {
    const response = await fetch(historyURL);
    const data = await response.json();
    return data;
  }, historyURL);
  console.log(data);

  const receipts = data.items.map((v) => v.id);

  for (let i = 0; i < receipts.length; i++) {
    const receiptID = receipts[i];

    const historyDetailURL = queryString.stringifyUrl({
      url: 'https://service.kakaomobility.com/history/detail/',
      query: { id: receiptID },
    });

    await page //
      .goto(historyDetailURL)
      .catch((error) => console.error(error));
    await delay(1_000);
    await page.screenshot({
      path: `screenshot-${receiptID}.png`,
    });
    await delay(800);
  }

  await browser.close();
};

main()
  .then(() => {
    exit(0);
  })
  .catch((error) => {
    console.error(error);
    exit(1);
  });
