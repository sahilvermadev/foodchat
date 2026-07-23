import base64
import hashlib
import hmac
import json
import unittest

from tokens import VoiceTokenError, validate_voice_token, voice_signing_key_id


def encode(value: dict[str, object]) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


def token(secret: str, expiry: int, *, include_key_id: bool = True) -> str:
    header_values = {"alg": "HS256", "typ": "JWT"}
    if include_key_id:
        header_values["kid"] = voice_signing_key_id(secret)
    header = encode(header_values)
    payload = encode(
        {
            "aud": "rekky-voice",
            "exp": expiry,
            "iat": 1000,
            "iss": "rekky-api",
            "jti": "grant-1",
            "sub": "user-123",
        }
    )
    unsigned = f"{header}.{payload}"
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), unsigned.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{unsigned}.{signature}"


class VoiceTokenTest(unittest.TestCase):
    def test_accepts_valid_backend_grant(self) -> None:
        self.assertEqual(validate_voice_token(token("secret", 1060), "secret", 1000), "user-123")
        self.assertEqual(
            validate_voice_token(
                token("secret", 1060, include_key_id=False), "secret", 1000
            ),
            "user-123",
        )

    def test_rejects_expired_or_tampered_grant(self) -> None:
        with self.assertRaises(VoiceTokenError):
            validate_voice_token(token("secret", 999), "secret", 1000)
        with self.assertRaises(VoiceTokenError):
            validate_voice_token(token("secret", 1000), "secret", 1000)
        with self.assertRaisesRegex(VoiceTokenError, "Signing key mismatch"):
            validate_voice_token(token("wrong", 1060), "secret", 1000)

    def test_rejects_malformed_grant(self) -> None:
        with self.assertRaises(VoiceTokenError):
            validate_voice_token("not-a-token", "secret", 1000)
        with self.assertRaises(VoiceTokenError):
            validate_voice_token("e30.e30.%%%", "secret", 1000)


if __name__ == "__main__":
    unittest.main()
