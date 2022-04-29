import cookie from 'cookie';
import { promises as fs } from 'fs';
import parseCurl from 'parse-curl';
import path from 'path';
import { exit } from 'process';
import puppeteer from 'puppeteer';
import queryString from 'query-string';

import { HistoryItem, HistoryResponse, Receipt } from './types';

const omit = (prop: string, { [prop]: _, ...rest }) => rest;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  // FIXME: replace hardcoded
  const hasCached = true;
  let historyItems: HistoryItem[] = [];
  let offset: number = 0;

  if (hasCached) {
    const data = await fs.readFile('./history.cache.raw');
    historyItems = JSON.parse(data.toString());
  } else {
    while (true) {
      const historyURL = queryString.stringifyUrl({
        url: 'https://service.kakaomobility.com/api/history/records/template',
        query: {
          offset,
          limit: 5,
          products: 'TAXI',
        },
      });
      const data: HistoryResponse | undefined = await page
        .evaluate(async (historyURL) => {
          const response = await fetch(historyURL);
          const data = await response.json();
          return data;
        }, historyURL)
        .catch(() => undefined);

      if (data) {
        if (data.items[0]?.datetime.startsWith('2021-09')) {
          break;
        }
        console.log(
          data.items[0]?.datetime,
          data.items[data.items.length - 1]?.datetime,
        );
        historyItems = [...historyItems, ...data.items];
        await fs.writeFile('./history.cache.raw', JSON.stringify(historyItems));
      } else {
        break;
      }

      offset += data.items.length;
    }
  }

  const receipts: Receipt[] = historyItems.flatMap((receipt) => {
    if (receipt.template.tags[0]?.label === '결제취소') {
      // 결제취소
      return [];
    }
    const price = parseInt(
      receipt.template.contents
        .find((v) => v.label === '금액')
        ?.values[0]?.value?.replaceAll(',', '') ?? '',
      10,
    );
    if (isNaN(price)) {
      // 직접결제
      return [];
    }

    const source =
      receipt.template.contents.find((v) => v.label === '출발')?.values[0]
        ?.value ?? '';

    const destination =
      receipt.template.contents.find((v) => v.label === '도착')?.values[0]
        ?.value ?? '';

    const result = {
      id: receipt.id,
      price,
      datetime: receipt.datetime,
      places: {
        source,
        destination,
      },
    };

    // 회사에서 출발
    const isSourceOffice = [].some((keyword) => source.includes(keyword));

    // 집에서 출발
    const isSourceHome = [].some((keyword) => source.includes(keyword));

    // 집으로 도착
    const isDestinationHome = [].some((keyword) =>
      destination.includes(keyword),
    );

    if (isSourceHome) {
      // 집에서 출발한 건 제외
      return [];
    }
    if (isSourceOffice && isDestinationHome) {
      // 회사에서 출발해서 집으로 온 것만
      console.log(source, '->', destination);
      return result;
    } else if (source.includes('')) {
      // 예외
      return result;
    }

    // 나머지는 제외
    return [];
  });

  console.log({ receiptLength: receipts.length });

  const totalUsageAmount = receipts.reduce(
    (total, receipt) => total + receipt.price,
    0,
  );
  console.log({ totalUsageAmount });

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    const receiptID = receipt.id;

    const historyDetailURL = queryString.stringifyUrl({
      url: 'https://service.kakaomobility.com/history/detail/',
      query: { id: receiptID },
    });
    console.log({ historyDetailURL, receiptID });

    await page //
      .goto(historyDetailURL)
      .catch((error) => console.error(error));
    await delay(1_000);
    await page.screenshot({
      path: `./screenshots/${receipt.datetime}-${receiptID}-${receipt.price}.png`,
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
