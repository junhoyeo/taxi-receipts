const cookie = require('cookie');
const { exit } = require('process');
const puppeteer = require('puppeteer');
const parseCurl = require('parse-curl');
const path = require('path');
const fs = require('fs').promises;

const omit = (prop, { [prop]: _, ...rest }) => rest;

const getConfigurations = async () => {
  const buffer = await fs.readFile(path.join(__dirname, 'curl.raw'));
  const config = parseCurl(buffer.toString());

  let headers = omit('Host', config.header);
  headers = omit('Set-Cookie', headers);

  const rawCookies = config.header['Set-Cookie'] ?? '';
  let cookies = cookie.parse(rawCookies);
  cookies = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: 'service.kakaomobility.com',
  }));

  return { headers, cookies };
};

const main = async () => {
  const { headers, cookies } = await getConfigurations();
  console.log(headers, cookies);

  const browserSize = {
    width: 375,
    height: 812,
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

  await page.setExtraHTTPHeaders(headers);
  await page.setCookie(...cookies);

  // TODO: Capture receipt from https://service.kakaomobility.com/history/detail/?id=${receipt_id}
  await page.goto('https://service.kakaomobility.com/history');
  await page.screenshot({ path: 'screenshot.png' });

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
