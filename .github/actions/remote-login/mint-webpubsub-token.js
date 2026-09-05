/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Mints the Web PubSub client URL the agent connects with, and nothing else.
 *
 * Split out of agent.js so the identity that signs this token is unrelated to the identity the
 * human establishes afterwards. The token only grants join/send on one ephemeral group, so a
 * service principal signing it is fine — and doing it here means it is already in hand before
 * ~/.azure is wiped for the device login.
 *
 * With AAD this calls the service's :generateToken API rather than signing locally, so a wrong RBAC
 * role fails loudly here instead of surfacing later as a WebSocket connection error.
 */

import crypto from "crypto";
import { appendFileSync } from "fs";
import { AzureCliCredential } from "@azure/identity";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

const SESSION_ID = process.env.SESSION_ID;
// The SDK wants a bare host, so any scheme or trailing slash is stripped rather than concatenated.
const ENDPOINT = process.env.WEBPUBSUB_ENDPOINT?.trim()
  .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  .replace(/\/+$/, "");
// The tenant is explicit because azure/login signed in with no subscription.
const TENANT_ID = process.env.WEBPUBSUB_TENANT_ID?.trim();
const HUB = process.env.HUB_NAME || "terminal";
const SESSION_TTL = parseInt(process.env.SESSION_TTL || "1800", 10);

if (!SESSION_ID) {
  console.error("FATAL: SESSION_ID env var required");
  process.exit(1);
}
if (!ENDPOINT) {
  console.error("FATAL: WEBPUBSUB_ENDPOINT env var required");
  process.exit(1);
}
if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(ENDPOINT)) {
  console.error(`FATAL: WEBPUBSUB_ENDPOINT must be a host like myhub.webpubsub.azure.com, got "${ENDPOINT}"`);
  process.exit(1);
}

const credential = new AzureCliCredential(TENANT_ID ? { tenantId: TENANT_ID } : {});
const client = new WebPubSubServiceClient(`https://${ENDPOINT}`, credential, HUB);
const token = await client.getClientAccessToken({
  userId: `runner-${crypto.randomUUID()}`,
  roles: [`webpubsub.joinLeaveGroup.${SESSION_ID}`, `webpubsub.sendToGroup.${SESSION_ID}`],
  expiresInMinutes: Math.ceil(SESSION_TTL / 60),
});

const url = typeof token === "string" ? token : typeof token.url === "string" ? token.url : token.url?.url;
if (typeof url !== "string") {
  throw new Error(`Unexpected getClientAccessToken response: ${JSON.stringify(token)}`);
}

// The URL carries the token, so it is masked before it reaches the log.
console.log(`::add-mask::${url}`);
appendFileSync(process.env.GITHUB_ENV, `WEBPUBSUB_CLIENT_URL=${url}\n`);
console.log(`Minted a client URL for ${ENDPOINT} hub ${HUB}, session ${SESSION_ID}`);
