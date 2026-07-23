"""Dependency-free validation for Rekky voice session grants."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import time


class VoiceTokenError(ValueError):
    """A safely loggable voice grant validation failure."""


def voice_signing_key_id(secret: str) -> str:
    """Return a non-secret identifier for a signing key."""
    return hashlib.sha256(secret.encode()).hexdigest()[:12]


def _decode_segment(segment: str) -> dict[str, object]:
    padding = "=" * (-len(segment) % 4)
    raw = base64.b64decode(segment + padding, altchars=b"-_", validate=True)
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("JWT segment is not an object")
    return value


def validate_voice_token(token: str, secret: str, now: int | None = None) -> str:
    """Validate the Rekky API's minimal HS256 grant and return its user id."""
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
        header = _decode_segment(header_segment)
        payload = _decode_segment(payload_segment)
        expected = hmac.new(
            secret.encode(),
            f"{header_segment}.{payload_segment}".encode(),
            hashlib.sha256,
        ).digest()
        padding = "=" * (-len(signature_segment) % 4)
        actual = base64.b64decode(
            signature_segment + padding, altchars=b"-_", validate=True
        )
        current_time = int(time.time()) if now is None else now
        subject = payload.get("sub")
        if header.get("alg") != "HS256" or header.get("typ") != "JWT":
            raise ValueError("Unsupported token algorithm")
        if header.get("kid") is not None and header.get("kid") != voice_signing_key_id(secret):
            raise ValueError("Signing key mismatch")
        if not hmac.compare_digest(actual, expected):
            raise ValueError("Invalid token signature")
        if payload.get("iss") != "rekky-api" or payload.get("aud") != "rekky-voice":
            raise ValueError("Invalid token scope")
        if not isinstance(payload.get("exp"), int) or payload["exp"] <= current_time:
            raise ValueError("Expired token")
        if not isinstance(payload.get("iat"), int) or payload["iat"] > current_time + 10:
            raise ValueError("Invalid issue time")
        if not isinstance(subject, str) or not subject:
            raise ValueError("Missing subject")
        return subject
    except (
        ValueError,
        TypeError,
        KeyError,
        UnicodeDecodeError,
        binascii.Error,
        json.JSONDecodeError,
    ) as error:
        raise VoiceTokenError(str(error) or type(error).__name__) from error
