import { RisuClient, get } from "../dist/index.js";

async function run() {
  const quickRes = await get("https://httpbin.org/get", {
    params: { client: "risu-req", lang: "nodejs" },
  });
  console.log("Convenience GET status:", quickRes.status);

  const client = new RisuClient({
    baseUrl: "https://httpbin.org",
    timeout: { connect: 5000, read: 10000, total: 15000 },
    headers: { "X-Client-Name": "risu-req-node" },
    retries: { maxRetries: 2, backoffFactor: 0.2 },
  });

  try {
    const postRes = await client.post("/post", {
      json: { message: "Hello from risu-req", timestamp: Date.now() },
    });
    console.log("Client POST status:", postRes.status);
    const data = await postRes.json();
    console.log("Echoed JSON:", data.json);
  } finally {
    await client.close();
  }
}

run().catch(console.error);
