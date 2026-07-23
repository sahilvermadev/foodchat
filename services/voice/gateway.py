"""Authenticated WebSocket gateway for Rekky's speech-to-speech worker."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import subprocess
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from tokens import VoiceTokenError, validate_voice_token, voice_signing_key_id

UPSTREAM_URL = "ws://127.0.0.1:8765/v1/realtime"
PROCESS: subprocess.Popen[bytes] | None = None
LOGGER = logging.getLogger("rekky.voice")
LOGGER.setLevel(logging.INFO)


def _speech_command() -> list[str]:
    api_key = os.environ["OPENROUTER_API_KEY"]
    return [
        "speech-to-speech",
        "--mode",
        "realtime",
        "--stt",
        "parakeet-tdt",
        "--llm_backend",
        "responses-api",
        "--tts",
        "qwen3",
        "--model_name",
        os.getenv("VOICE_LLM_MODEL", "google/gemini-3.1-flash-lite"),
        "--responses_api_base_url",
        "https://openrouter.ai/api/v1",
        "--responses_api_api_key",
        api_key,
        "--responses_api_stream",
        "--enable_live_transcription",
    ]


async def _wait_for_upstream(process: subprocess.Popen[bytes]) -> None:
    for _ in range(600):
        if process.poll() is not None:
            raise RuntimeError(f"speech-to-speech exited with code {process.returncode}")
        try:
            async with websockets.connect(UPSTREAM_URL, open_timeout=1):
                return
        except (OSError, TimeoutError):
            await asyncio.sleep(1)
    raise RuntimeError("speech-to-speech did not become ready")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global PROCESS
    voice_secret = os.environ.get("VOICE_TOKEN_SECRET", "")
    if len(voice_secret) < 32:
        raise RuntimeError("VOICE_TOKEN_SECRET must contain at least 32 characters")
    LOGGER.info("Voice authentication key_id=%s", voice_signing_key_id(voice_secret))
    PROCESS = subprocess.Popen(_speech_command())
    await _wait_for_upstream(PROCESS)
    try:
        yield
    finally:
        PROCESS.terminate()
        try:
            PROCESS.wait(timeout=15)
        except subprocess.TimeoutExpired:
            PROCESS.kill()


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    ready = PROCESS is not None and PROCESS.poll() is None
    return {
        "auth_transport": "first-message",
        "status": "ready" if ready else "starting",
    }


async def _client_to_upstream(
    client: WebSocket, upstream: websockets.ClientConnection, session_id: str
) -> None:
    audio_chunks = 0
    while True:
        message = await client.receive()
        if message["type"] == "websocket.disconnect":
            return
        if message.get("text") is not None:
            try:
                event = json.loads(message["text"])
                event_type = event.get("type", "unknown")
            except (json.JSONDecodeError, AttributeError):
                event_type = "invalid"
            if event_type == "input_audio_buffer.append":
                audio_chunks += 1
                if audio_chunks % 50 == 1:
                    LOGGER.info(
                        "[%s] client audio chunks=%d", session_id, audio_chunks
                    )
            else:
                LOGGER.info("[%s] client event=%s", session_id, event_type)
            await upstream.send(message["text"])
        elif message.get("bytes") is not None:
            await upstream.send(message["bytes"])


async def _upstream_to_client(
    upstream: websockets.ClientConnection, client: WebSocket, session_id: str
) -> None:
    audio_chunks = 0
    async for message in upstream:
        if isinstance(message, str):
            try:
                event = json.loads(message)
                event_type = event.get("type", "unknown")
                delta = event.get("delta", "")
            except (json.JSONDecodeError, AttributeError):
                event_type = "invalid"
                delta = ""
            if event_type in {"response.audio.delta", "response.output_audio.delta"}:
                audio_chunks += 1
                if audio_chunks % 10 == 1:
                    LOGGER.info(
                        "[%s] worker audio chunks=%d base64_chars=%d",
                        session_id,
                        audio_chunks,
                        len(delta),
                    )
            else:
                LOGGER.info("[%s] worker event=%s", session_id, event_type)
            await client.send_text(message)
        else:
            await client.send_bytes(message)


@app.websocket("/v1/realtime")
async def realtime(client: WebSocket) -> None:
    session_id = secrets.token_hex(4)
    await client.accept()
    try:
        auth_message = json.loads(await asyncio.wait_for(client.receive_text(), timeout=5))
        if auth_message.get("type") != "rekky.authenticate":
            raise ValueError("Missing voice authentication message")
        token = auth_message.get("token", "")
        validate_voice_token(token, os.environ["VOICE_TOKEN_SECRET"])
    except VoiceTokenError as error:
        LOGGER.warning("Rejected voice session grant: %s", error)
        await client.close(code=1008, reason="Invalid or expired voice session")
        return
    except (
        asyncio.TimeoutError,
        json.JSONDecodeError,
        KeyError,
        ValueError,
        WebSocketDisconnect,
    ):
        LOGGER.warning("Rejected malformed voice session grant")
        await client.close(code=1008, reason="Invalid or expired voice session")
        return

    LOGGER.info("[%s] accepted voice session", session_id)
    try:
        async with websockets.connect(UPSTREAM_URL, max_size=None) as upstream:
            LOGGER.info("[%s] connected to speech worker", session_id)
            client_task = asyncio.create_task(
                _client_to_upstream(client, upstream, session_id)
            )
            upstream_task = asyncio.create_task(
                _upstream_to_client(upstream, client, session_id)
            )
            done, pending = await asyncio.wait(
                {client_task, upstream_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*done, *pending, return_exceptions=True)
    except (OSError, WebSocketDisconnect) as error:
        LOGGER.warning(
            "[%s] voice session interrupted: %s", session_id, type(error).__name__
        )
        await client.close(code=1011, reason="Voice worker unavailable")
    finally:
        LOGGER.info("[%s] closed voice session", session_id)
