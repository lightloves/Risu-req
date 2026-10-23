"""Streaming response download example for risu-req in Python."""

import sys
import risu_req


def run() -> None:
    with risu_req.RisuClient() as client:
        res = client.get("https://httpbin.org/stream/5")
        for chunk in res.stream(chunk_size=128):
            sys.stdout.write(chunk.decode("utf-8", errors="replace"))
            sys.stdout.flush()
        print("\nStreaming finished.")


if __name__ == "__main__":
    run()
