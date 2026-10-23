import { RisuClient } from "../dist/index.js";

async function run() {
  const client = new RisuClient();

  try {
    const res = await client.get("https://httpbin.org/stream/5");
    const stream = res.stream();

    for await (const chunk of stream) {
      process.stdout.write(chunk);
    }
    console.log("\nStream finished.");
  } finally {
    await client.close();
  }
}

run().catch(console.error);
