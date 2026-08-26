/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Joins a terminal session the browser already registered, then runs the Azure device login.
 *
 * Trimmed from azure-remote-login/runner/agent.js: the session id arrives as a workflow input so
 * nothing is registered here, the access token stays in the browser, and the run stops once
 * `az login --use-device-code` finishes — no Terraform stage.
 */

import crypto from "crypto";
import pty from "node-pty";
import { WebSocket } from "ws";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { DeviceCodeDetector } from "./device-code.js";

const SESSION_ID = process.env.SESSION_ID;
const ENDPOINT = process.env.WEBPUBSUB_ENDPOINT;
const KEY = process.env.WEBPUBSUB_KEY;
const HUB = process.env.HUB_NAME || "terminal";
const SESSION_TTL = parseInt(process.env.SESSION_TTL || "1800", 10);
const COLS = 120;
const ROWS = 24;

if (!SESSION_ID) {
  console.error("FATAL: SESSION_ID env var required");
  process.exit(1);
}
if (!ENDPOINT || !KEY) {
  console.error("FATAL: WEBPUBSUB_ENDPOINT and WEBPUBSUB_KEY env vars required");
  process.exit(1);
}

async function getClientUrl() {
  const client = new WebPubSubServiceClient(`https://${ENDPOINT}`, { key: KEY }, HUB);
  const token = await client.getClientAccessToken({
    userId: `runner-${crypto.randomUUID()}`,
    roles: [`webpubsub.joinLeaveGroup.${SESSION_ID}`, `webpubsub.sendToGroup.${SESSION_ID}`],
    expiresInMinutes: Math.ceil(SESSION_TTL / 60),
  });
  if (typeof token === "string") return token;
  if (typeof token.url === "string") return token.url;
  if (typeof token.url?.url === "string") return token.url.url;
  throw new Error(`Unexpected getClientAccessToken response: ${JSON.stringify(token)}`);
}

async function main() {
  console.log(`Joining terminal session ${SESSION_ID}`);
  const ws = new WebSocket(await getClientUrl(), "json.webpubsub.azure.v1");
  const detector = new DeviceCodeDetector();
  let child = null;
  let joined = false;
  let finished = false;
  let loginExitCode = 1;

  const send = (message) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "sendToGroup",
        group: SESSION_ID,
        dataType: "text",
        noEcho: true,
        data: JSON.stringify(message),
      })
    );
  };

  function finish() {
    if (finished) return;
    finished = true;
    if (child) child.kill();
    if (ws.readyState === WebSocket.OPEN) ws.close();
    console.log(`Device login ${loginExitCode === 0 ? "SUCCESS" : "FAILED"}`);
    process.exit(loginExitCode === 0 ? 0 : 1);
  }

  function startAzLogin() {
    send({ type: "stage", stage: "login" });
    child = pty.spawn("az", ["login", "--use-device-code"], { cols: COLS, rows: ROWS, cwd: process.cwd(), env: process.env });

    child.onData((data) => {
      process.stdout.write(data);
      send({ type: "terminal", data });
      detector.feed(data);
    });

    detector.on("deviceCode", ({ url, code }) => {
      console.log(`::notice::Device code ${code} — sign in at ${url}`);
      send({ type: "deviceCode", url, code });
    });

    child.onExit(({ exitCode }) => {
      loginExitCode = exitCode;
      if (exitCode === 0) {
        send({ type: "loginCompleted" });
        send({ type: "stage", stage: "done" });
      } else {
        send({ type: "loginFailed", exitCode });
        send({ type: "stage", stage: "error" });
      }
      // Give the last frames a moment to reach the browser before the socket closes.
      setTimeout(finish, 1000);
    });
  }

  ws.on("message", (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (frame.type === "system" && frame.event === "connected") {
      ws.send(JSON.stringify({ type: "joinGroup", group: SESSION_ID, ackId: 1 }));
      return;
    }

    if (frame.type === "ack") {
      if (!frame.success) {
        console.error("::error::Could not join the session group");
        process.exit(1);
      }
      if (!joined) {
        joined = true;
        console.log("Joined the session group, starting az login");
        startAzLogin();
      }
      return;
    }

    if (frame.type !== "message" || frame.group !== SESSION_ID || !child) return;
    let payload;
    try {
      payload = JSON.parse(frame.data);
    } catch {
      child.write(String(frame.data));
      return;
    }
    if (payload.type === "input") child.write(payload.data);
    else if (payload.type === "resize") child.resize(payload.cols || COLS, payload.rows || ROWS);
  });

  ws.on("error", (err) => console.error("WebSocket error:", err.message));
  ws.on("close", () => {
    if (child) child.kill();
  });

  process.on("SIGTERM", finish);
  process.on("SIGINT", finish);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
