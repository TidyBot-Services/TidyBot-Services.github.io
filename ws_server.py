#!/usr/bin/env python3
"""
WebSocket server for SkillClaw local dev dashboard.

Bridges the orchestrator status to the browser hex gallery.
Accepts inject/stop/retry commands from the browser.

Usage:
    pip install websockets
    python ws_server.py

    # Then serve the site:
    python -m http.server 8080

    # Open http://localhost:8080
"""

import asyncio
import json
import time
from pathlib import Path

try:
    import websockets
except ImportError:
    print("pip install websockets")
    raise

WS_PORT = 8765
LOCAL_REPOS = Path(__file__).parent / "logs" / "local_repos.json"

# Connected browser clients
clients: set = set()

# Callback registry — orchestrator can register handlers
_on_inject = None
_on_stop = None
_on_retry = None


def load_local_repos():
    if LOCAL_REPOS.exists():
        return json.loads(LOCAL_REPOS.read_text())
    return []


async def broadcast(msg: dict):
    """Send a message to all connected browsers."""
    data = json.dumps(msg)
    to_remove = set()
    for client in clients:
        try:
            await client.send(data)
        except websockets.ConnectionClosed:
            to_remove.add(client)
    clients -= to_remove


async def broadcast_status_update(entry: dict):
    """Push a single skill status update to all browsers."""
    await broadcast({"type": "status_update", "payload": entry})


async def broadcast_full_sync(entries: list):
    """Push full skill list to all browsers."""
    await broadcast({"type": "full_sync", "payload": entries})


async def handler(websocket):
    clients.add(websocket)
    print(f"[WS] client connected ({len(clients)} total)")

    # Send current state on connect
    repos = load_local_repos()
    await websocket.send(json.dumps({"type": "full_sync", "payload": repos}))

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "inject":
                    agent_id = msg.get("agent_id", "")
                    text = msg.get("text", "")
                    print(f"[WS] inject -> {agent_id}: {text}")
                    if _on_inject:
                        _on_inject(agent_id, text)

                elif msg_type == "stop":
                    agent_id = msg.get("agent_id", "")
                    print(f"[WS] stop -> {agent_id}")
                    if _on_stop:
                        _on_stop(agent_id)

                elif msg_type == "retry":
                    skill = msg.get("skill", "")
                    print(f"[WS] retry -> {skill}")
                    if _on_retry:
                        _on_retry(skill)

                elif msg_type == "edit":
                    skill = msg.get("skill", "")
                    text = msg.get("text", "")
                    print(f"[WS] edit -> {skill}: {text}")

                else:
                    print(f"[WS] unknown msg type: {msg_type}")

            except json.JSONDecodeError:
                print(f"[WS] bad JSON: {raw[:100]}")
    except websockets.ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)
        print(f"[WS] client disconnected ({len(clients)} total)")


async def main():
    print(f"[WS] starting on ws://localhost:{WS_PORT}")
    print(f"[WS] serving {len(load_local_repos())} skills from {LOCAL_REPOS}")
    async with websockets.serve(handler, "localhost", WS_PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
