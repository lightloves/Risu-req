"""Basic usage example for risu-req in Python."""

import risu_req


def run() -> None:
    quick_res = risu_req.get(
        "https://httpbin.org/get",
        params={"client": "risu-req", "lang": "python"},
    )
    print("Quick GET status:", quick_res.status_code)

    with risu_req.RisuClient(
        base_url="https://httpbin.org",
        timeout={"connect": 5.0, "read": 10.0, "total": 15.0},
        headers={"X-Client-Name": "risu-req-py"},
        retries={"max_retries": 2, "backoff_factor": 0.2},
    ) as client:
        post_res = client.post(
            "/post",
            json={"message": "Hello from Python risu-req", "count": 100},
        )
        print("POST status:", post_res.status_code)
        data = post_res.json()
        print("Echoed JSON:", data.get("json"))


if __name__ == "__main__":
    run()
