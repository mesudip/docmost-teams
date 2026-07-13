#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


def fatal(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def http_request(method: str, url: str, headers=None, data=None):
    request = urllib.request.Request(
        url,
        headers=headers or {},
        data=data,
        method=method,
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), exc.read()


def json_request(method: str, url: str, token: str, payload=None):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    status, response_headers, body = http_request(
        method,
        url,
        headers=headers,
        data=data,
    )
    if not body:
        return status, response_headers, None
    try:
        return status, response_headers, json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        return status, response_headers, body.decode("utf-8", errors="replace")


def get_admin_token(base_url: str, admin_user: str, admin_password: str) -> str:
    token_url = f"{base_url}/realms/master/protocol/openid-connect/token"
    payload = urllib.parse.urlencode(
        {
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": admin_user,
            "password": admin_password,
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    status, _, body = http_request("POST", token_url, headers=headers, data=payload)
    if status != 200:
        fatal(
            f"failed to get admin token ({status}): "
            f"{body.decode('utf-8', errors='replace')}"
        )

    payload = json.loads(body.decode("utf-8"))
    token = payload.get("access_token")
    if not token:
        fatal("missing access_token in admin token response")
    return token


def ensure_realm(base_url: str, token: str, realm: str) -> None:
    realm_url = f"{base_url}/admin/realms/{urllib.parse.quote(realm)}"
    status, _, payload = json_request("GET", realm_url, token)
    if status == 200:
        return
    if status != 404:
        fatal(f"failed to check realm {realm} ({status}): {payload}")

    status, _, response = json_request(
        "POST",
        f"{base_url}/admin/realms",
        token,
        {
            "realm": realm,
            "enabled": True,
            "registrationAllowed": False,
            "resetPasswordAllowed": True,
            "rememberMe": True,
            "loginWithEmailAllowed": True,
            "duplicateEmailsAllowed": False,
        },
    )
    if status not in (201, 204):
        fatal(f"failed to create realm {realm} ({status}): {response}")


def get_client_uuid(base_url: str, token: str, realm: str, client_id: str):
    status, _, payload = json_request(
        "GET",
        f"{base_url}/admin/realms/{urllib.parse.quote(realm)}/clients"
        f"?clientId={urllib.parse.quote(client_id)}",
        token,
    )
    if status != 200:
        fatal(f"failed to query client {client_id} ({status}): {payload}")
    if isinstance(payload, list) and payload:
        return payload[0].get("id")
    return None


def ensure_client(
    base_url: str,
    token: str,
    realm: str,
    client_id: str,
    client_secret: str,
    redirect_base_urls: list[str],
) -> None:
    client_uuid = get_client_uuid(base_url, token, realm, client_id)
    redirect_uris = set()
    web_origins = set()
    for redirect_base_url in redirect_base_urls:
        base = redirect_base_url.rstrip("/")
        redirect_uris.add(f"{base}/*")
        redirect_uris.add(f"{base}/api/sso/oidc/*")
        web_origins.add(base)

    payload = {
        "clientId": client_id,
        "name": client_id,
        "enabled": True,
        "protocol": "openid-connect",
        "publicClient": False,
        "secret": client_secret,
        "standardFlowEnabled": True,
        "directAccessGrantsEnabled": True,
        "serviceAccountsEnabled": False,
        "redirectUris": sorted(redirect_uris),
        "webOrigins": sorted(web_origins),
    }

    clients_url = (
        f"{base_url}/admin/realms/{urllib.parse.quote(realm)}/clients"
    )
    if client_uuid:
        status, _, response = json_request(
            "PUT",
            f"{clients_url}/{client_uuid}",
            token,
            payload,
        )
        if status not in (200, 204):
            fatal(f"failed to update client {client_id} ({status}): {response}")
        return

    status, _, response = json_request("POST", clients_url, token, payload)
    if status not in (201, 204):
        fatal(f"failed to create client {client_id} ({status}): {response}")


def ensure_groups_mapper(
    base_url: str,
    token: str,
    realm: str,
    client_id: str,
) -> None:
    client_uuid = get_client_uuid(base_url, token, realm, client_id)
    if not client_uuid:
        fatal(f"failed to resolve client {client_id} for groups mapper")

    mappers_url = (
        f"{base_url}/admin/realms/{urllib.parse.quote(realm)}/clients/"
        f"{client_uuid}/protocol-mappers/models"
    )
    status, _, existing = json_request("GET", mappers_url, token)
    if status != 200 or not isinstance(existing, list):
        fatal(f"failed to query protocol mappers ({status}): {existing}")

    payload = {
        "name": "groups",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-group-membership-mapper",
        "config": {
            "claim.name": "groups",
            "full.path": "false",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
        },
    }

    current = next((item for item in existing if item.get("name") == "groups"), None)
    if current:
        payload["id"] = current["id"]
        status, _, response = json_request(
            "PUT",
            f"{mappers_url}/{current['id']}",
            token,
            payload,
        )
    else:
        status, _, response = json_request("POST", mappers_url, token, payload)

    if status not in (200, 201, 204):
        fatal(f"failed to configure groups mapper ({status}): {response}")


def ensure_group(base_url: str, token: str, realm: str, name: str) -> str:
    groups_url = f"{base_url}/admin/realms/{urllib.parse.quote(realm)}/groups"
    status, _, groups = json_request(
        "GET",
        f"{groups_url}?search={urllib.parse.quote(name)}&exact=true",
        token,
    )
    if status != 200 or not isinstance(groups, list):
        fatal(f"failed to query group {name} ({status}): {groups}")

    for group in groups:
        if str(group.get("name", "")).lower() == name.lower():
            return group["id"]

    status, headers, response = json_request(
        "POST",
        groups_url,
        token,
        {"name": name},
    )
    if status not in (201, 204):
        fatal(f"failed to create group {name} ({status}): {response}")

    location = headers.get("location") or headers.get("Location")
    if location:
        return location.rstrip("/").split("/")[-1]

    return ensure_group(base_url, token, realm, name)


def ensure_group_membership(
    base_url: str,
    token: str,
    realm: str,
    user_id: str,
    group_id: str,
) -> None:
    status, _, response = json_request(
        "PUT",
        f"{base_url}/admin/realms/{urllib.parse.quote(realm)}/users/"
        f"{user_id}/groups/{group_id}",
        token,
    )
    if status not in (200, 204):
        fatal(f"failed to assign Root group ({status}): {response}")


def ensure_user(
    base_url: str,
    token: str,
    realm: str,
    username: str,
    password: str,
) -> str:
    users_url = f"{base_url}/admin/realms/{urllib.parse.quote(realm)}/users"
    status, _, payload = json_request(
        "GET",
        f"{users_url}?username={urllib.parse.quote(username)}",
        token,
    )
    if status != 200:
        fatal(f"failed to query user {username} ({status}): {payload}")

    user_id = None
    if isinstance(payload, list):
        for item in payload:
            if str(item.get("username", "")).lower() == username.lower():
                user_id = item.get("id")
                break

    if not user_id:
        status, response_headers, response = json_request(
            "POST",
            users_url,
            token,
            {
                "username": username,
                "enabled": True,
                "emailVerified": True,
                "firstName": username.capitalize(),
                "lastName": "User",
                "email": f"{username.lower()}@docmost.local",
            },
        )
        if status not in (201, 204):
            fatal(f"failed to create user {username} ({status}): {response}")

        location = response_headers.get("location") or response_headers.get("Location")
        if location:
            user_id = location.rstrip("/").split("/")[-1]

    if not user_id:
        status, _, payload = json_request(
            "GET",
            f"{users_url}?username={urllib.parse.quote(username)}",
            token,
        )
        if status != 200 or not isinstance(payload, list):
            fatal(f"failed to re-query user {username} ({status}): {payload}")
        for item in payload:
            if str(item.get("username", "")).lower() == username.lower():
                user_id = item.get("id")
                break

    if not user_id:
        fatal(f"failed to resolve user id for {username}")

    status, _, response = json_request(
        "PUT",
        f"{users_url}/{user_id}/reset-password",
        token,
        {"type": "password", "value": password, "temporary": False},
    )
    if status not in (200, 204):
        fatal(f"failed to set password for user {username} ({status}): {response}")

    return user_id


def parse_default_user(value: str) -> tuple[str, str]:
    parts = value.split(":", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        fatal(
            f"invalid --default-user value {value!r}; "
            "expected username:password"
        )
    return parts[0], parts[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--realm", required=True)
    parser.add_argument("--admin-user", required=True)
    parser.add_argument("--admin-password", required=True)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--client-secret", required=True)
    parser.add_argument("--redirect-base-url", action="append", default=[])
    parser.add_argument("--default-user", action="append", default=[])
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    token = get_admin_token(base_url, args.admin_user, args.admin_password)
    ensure_realm(base_url, token, args.realm)
    ensure_client(
        base_url,
        token,
        args.realm,
        args.client_id,
        args.client_secret,
        args.redirect_base_url or ["http://localhost:3000"],
    )
    ensure_groups_mapper(base_url, token, args.realm, args.client_id)
    root_group_id = ensure_group(base_url, token, args.realm, "Root")

    default_users = args.default_user or [
        "admin:admin",
        "user1:pass",
        "user2:pass",
    ]
    for raw_user in default_users:
        username, password = parse_default_user(raw_user)
        user_id = ensure_user(base_url, token, args.realm, username, password)
        if username.lower() == "admin":
            ensure_group_membership(
                base_url,
                token,
                args.realm,
                user_id,
                root_group_id,
            )

    print(
        f"Keycloak realm {args.realm!r} is ready with client "
        f"{args.client_id!r}.",
        flush=True,
    )


if __name__ == "__main__":
    main()
