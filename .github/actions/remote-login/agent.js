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
import { execFileSync } from "child_process";
import pty from "node-pty";
import { WebSocket } from "ws";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { DeviceCodeDetector } from "./device-code.js";

const SESSION_ID = process.env.SESSION_ID;
const ENDPOINT = process.env.WEBPUBSUB_ENDPOINT;
const KEY = process.env.WEBPUBSUB_KEY;
const HUB = process.env.HUB_NAME || "terminal";
const TENANT_ID = process.env.AZURE_TENANT_ID?.trim();
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID?.trim();
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

  function selectSubscription() {
    if (!SUBSCRIPTION_ID) {
      const warning = "AZURE_SUBSCRIPTION_ID is not set — staying on whichever subscription az defaulted to";
      console.log(`::warning::${warning}`);
      send({ type: "terminal", data: `\r\n${warning}\r\n` });
      return true;
    }
    try {
      execFileSync("az", ["account", "set", "--subscription", SUBSCRIPTION_ID], { stdio: "pipe" });
      const name = execFileSync("az", ["account", "show", "--query", "name", "-o", "tsv"], { encoding: "utf8" }).trim();
      console.log(`Subscription set to ${name} (${SUBSCRIPTION_ID})`);
      send({ type: "terminal", data: `\r\nSubscription set to ${name}\r\n` });
      return true;
    } catch (err) {
      const detail = err.stderr?.toString().trim() || err.message;
      console.error(`::error::Could not select subscription ${SUBSCRIPTION_ID}: ${detail}`);
      send({ type: "terminal", data: `\r\nCould not select subscription ${SUBSCRIPTION_ID}\r\n${detail}\r\n` });
      return false;
    }
  }

  function startAzLogin() {
    send({ type: "stage", stage: "login" });

    // Scoping the login itself beats switching afterwards: the device code is issued by this tenant.
    const args = ["login", "--use-device-code"];
    if (TENANT_ID) args.push("--tenant", TENANT_ID);
    else console.log("::warning::AZURE_TENANT_ID is not set — signing in to the account's home tenant");
    console.log(`Starting: az ${args.join(" ")}`);

    child = pty.spawn("az", args, { cols: COLS, rows: ROWS, cwd: process.cwd(), env: process.env });

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
      if (exitCode !== 0) {
        send({ type: "loginFailed", exitCode });
        send({ type: "stage", stage: "error" });
      } else if (selectSubscription()) {
        send({ type: "loginCompleted" });
        send({ type: "stage", stage: "done" });
      } else {
        loginExitCode = 1;
        send({ type: "loginFailed", exitCode: 1 });
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
