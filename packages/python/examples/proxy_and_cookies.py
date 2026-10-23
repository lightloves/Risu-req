"""Cookie and proxy usage example for risu-req in Python."""

import os
import risu_req


def run() -> None:
    jar = risu_req.CookieJar()
    proxy_env = os.environ.get("HTTP_PROXY")

    with risu_req.RisuClient(
        cookies=jar,
        proxy=proxy_env,
        timeout=10.0,
    ) as client:
        res = client.get("https://httpbin.org/cookies/set?user_session=py_token_999")
        print("Status code:", res.status_code)
        cookies = jar.get_cookies("https://httpbin.org")
        for cookie in cookies:
            print(f"Cookie: {cookie.name}={cookie.value} (Secure: {cookie.secure})")


if __name__ == "__main__":
    run()
