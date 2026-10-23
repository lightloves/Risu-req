import { RisuClient, CookieJar } from "../dist/index.js";

async function run() {
  const jar = new CookieJar();
  const client = new RisuClient({
    cookies: jar,
    proxy: process.env.HTTP_PROXY,
    timeout: 10000,
  });

  try {
    const res = await client.get("https://httpbin.org/cookies/set?session=sample123");
    console.log("Status:", res.status);
    console.log("Stored cookies:", jar.getCookies("https://httpbin.org"));
  } finally {
    await client.close();
  }
}

run().catch(console.error);
