#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


API_BASE_URL = os.environ.get(
    "DOCMOST_API_BASE_URL",
    "http://host.docker.internal:3000",
).rstrip("/")
PUBLIC_BASE_URL = os.environ.get(
    "DOCMOST_PUBLIC_BASE_URL",
    "http://localhost:3000",
).rstrip("/")
ADMIN_NAME = os.environ.get("DOCMOST_ADMIN_NAME", "Local Admin")
ADMIN_EMAIL = os.environ.get("DOCMOST_ADMIN_EMAIL", "admin@docmost.local")
ADMIN_PASSWORD = os.environ.get("DOCMOST_ADMIN_PASSWORD", "admin12345")
WORKSPACE_NAME = os.environ.get("DOCMOST_WORKSPACE_NAME", "Docmost Local")
KEYCLOAK_ISSUER = os.environ.get(
    "KEYCLOAK_ISSUER",
    "http://localhost:8081/realms/docmost-local",
).rstrip("/")
KEYCLOAK_CLIENT_ID = os.environ.get("KEYCLOAK_CLIENT_ID", "docmost-local")
KEYCLOAK_CLIENT_SECRET = os.environ.get(
    "KEYCLOAK_CLIENT_SECRET",
    "docmost-local-secret",
)
TIMEOUT_SECS = int(os.environ.get("BOOTSTRAP_TIMEOUT_SECS", "900"))


cookie_jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))


def log(message: str) -> None:
    print(message, flush=True)


def http_request(method: str, url: str, payload=None):
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(url, headers=headers, data=data, method=method)
    try:
        with opener.open(request) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()
    except urllib.error.URLError as exc:
        return None, str(exc).encode("utf-8")


def parse_response(body: bytes):
    if not body:
        return None
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        return body.decode("utf-8", errors="replace")

    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


def wait_for_docmost() -> None:
    deadline = time.time() + TIMEOUT_SECS
    health_url = f"{API_BASE_URL}/api/health"
    while time.time() < deadline:
        status, _ = http_request("GET", health_url)
        if status == 200:
            log(f"Docmost is reachable at {API_BASE_URL}.")
            return
        time.sleep(2)
    raise RuntimeError(f"timed out waiting for Docmost at {health_url}")


def setup_workspace_or_login() -> bool:
    status, body = http_request(
        "POST",
        f"{API_BASE_URL}/api/auth/setup",
        {
            "name": ADMIN_NAME,
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "workspaceName": WORKSPACE_NAME,
        },
    )
    if status == 200:
        log("Created the initial Docmost workspace and admin account.")
        return True

    if status == 403:
        log("Workspace already exists. Logging in with the configured admin account.")
        login_status, login_body = http_request(
            "POST",
            f"{API_BASE_URL}/api/auth/login",
            {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
            },
        )
        if login_status == 200:
            log("Logged in as the configured admin user.")
            return True
        login_error = parse_response(login_body)
        if login_status == 400 and "enforced SSO" in str(login_error):
            log(
                "Workspace already exists with SSO enforcement enabled. "
                "Skipping authenticated Docmost bootstrap updates."
            )
            return False
        raise RuntimeError(
            f"admin login failed ({login_status}): {login_error}"
        )

    raise RuntimeError(f"workspace setup failed ({status}): {parse_response(body)}")


def list_sso_providers():
    status, body = http_request("POST", f"{API_BASE_URL}/api/sso/providers", {})
    if status == 404:
        log(
            "SSO endpoints are not available in this build. "
            "Keycloak is ready, but Docmost OIDC provider bootstrap is skipped."
        )
        return None
    if status != 200:
        raise RuntimeError(
            f"failed to query SSO providers ({status}): {parse_response(body)}"
        )

    payload = parse_response(body)
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return payload["items"]
    if isinstance(payload, list):
        return payload
    return []


def ensure_oidc_provider() -> None:
    providers = list_sso_providers()
    if providers is None:
        return

    provider = None
    for item in providers:
        if item.get("type") == "oidc" and item.get("name") == "Keycloak Local":
            provider = item
            break

    if provider is None:
        status, body = http_request(
            "POST",
            f"{API_BASE_URL}/api/sso/create",
            {"type": "oidc", "name": "Keycloak Local"},
        )
        if status != 200:
            raise RuntimeError(
                f"failed to create OIDC provider ({status}): {parse_response(body)}"
            )
        provider = parse_response(body)
        log("Created the Keycloak Local OIDC provider in Docmost.")

    status, body = http_request(
        "POST",
        f"{API_BASE_URL}/api/sso/update",
        {
            "id": provider["id"],
            "name": "Keycloak Local",
            "oidcIssuer": KEYCLOAK_ISSUER,
            "oidcClientId": KEYCLOAK_CLIENT_ID,
            "oidcClientSecret": KEYCLOAK_CLIENT_SECRET,
            "isEnabled": True,
            "allowSignup": True,
            "groupSync": True,
            "settings": {
                "groupClaimName": "groups",
                "requireVerifiedEmail": True,
            },
        },
    )
    if status != 200:
        raise RuntimeError(
            f"failed to update OIDC provider ({status}): {parse_response(body)}"
        )

    log(
        "Configured Docmost OIDC provider against Keycloak. "
        f"Use {PUBLIC_BASE_URL} for browser testing."
    )


def enable_fork_workspace_features() -> None:
    status, body = http_request(
        "POST",
        f"{API_BASE_URL}/api/workspace/update",
        {
            "allowPersonalSpaces": True,
            "enforceSso": True,
        },
    )
    if status != 200:
        raise RuntimeError(
            f"failed to enable fork workspace features ({status}): "
            f"{parse_response(body)}"
        )

    log("Enabled private spaces and enforced SSO for the local workspace.")


def main() -> int:
    try:
        wait_for_docmost()
        authenticated = setup_workspace_or_login()
        if authenticated:
            ensure_oidc_provider()
            enable_fork_workspace_features()
    except Exception as exc:
        log(f"docmost bootstrap failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
