"use strict";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { CLIENT_ID, TENANT_ID, AUTH_DOMAIN } from "./config.mjs";
import fs from "fs";

// Microsoft JWKS client
const msJwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 6 * 60 * 60 * 1000, // 6 hours
  timeout: 3000,
});

function getSigningKey(kid) {
  return new Promise((resolve, reject) => {
    msJwks.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

function authFailedResponse({ request, origin, returnTo }) {
  const dest = request.headers["sec-fetch-dest"]?.[0]?.value;
  const mode = request.headers["sec-fetch-mode"]?.[0]?.value;
  // Check if it's a navigation request for document, if so, return an HTML response with a link to login
  if (dest === "document" && mode === "navigate") {
    const html = fs.readFileSync("login.html", "utf-8");
    return {
      status: "200",
      statusDescription: "OK",
      headers: {
        "content-type": [{ key: "Content-Type", value: "text/html; charset=utf-8" }],
      },
      body: html,
    };
  }
  return {
    status: "403",
    statusDescription: "Forbidden",
    headers: {
      "content-type": [{ key: "Content-Type", value: "application/json" }],
      ...(origin && {
        "access-control-allow-origin": [{ key: "Access-Control-Allow-Origin", value: origin }],
        "access-control-allow-credentials": [{ key: "Access-Control-Allow-Credentials", value: "true" }],
        vary: [{ key: "Vary", value: "Origin" }],
      }),
    },
    body: JSON.stringify({
      code: "FORBIDDEN",
      message: "Invalid or expired token",
      loginUrl: AUTH_DOMAIN,
    }),
  };
}

function handleOptionsRequest(origin) {
  return {
    status: "204",
    headers: {
      "access-control-allow-origin": [{ key: "Access-Control-Allow-Origin", value: origin }],
      "access-control-allow-methods": [{ key: "Access-Control-Allow-Methods", value: "*" }],
      "access-control-allow-headers": [{ key: "Access-Control-Allow-Headers", value: "Authorization,X-Correlation-Id,Content-Type,Accept" }],
      "access-control-allow-credentials": [{ key: "Access-Control-Allow-Credentials", value: "true" }],
      vary: [{ key: "Vary", value: "Origin" }],
    },
  };
}

export const handler = async (event) => {
  const request = event.Records[0].cf.request;
  const cookieHeader = request.headers.cookie?.[0]?.value || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
  const host = request.headers.host?.[0]?.value || "";
  const uri = typeof request.uri === "string" ? request.uri : "/";
  request.uri = uri;
  const qs = request.querystring;
  const returnTo = encodeURIComponent(qs ? `https://${host}${uri}?${qs}` : `https://${host}${uri}`);
  const origin = request.headers?.origin?.[0]?.value || "";
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return handleOptionsRequest(origin); // Handle CORS preflight OPTIONS request
  }
  const idToken = cookies["idToken"]; // Read the cookie if available
  if (!idToken) {
    return authFailedResponse({ request, origin, returnTo }); // If no idToken is found, return auth failed response
  }
  // Test the token is valid and not expired
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded?.header?.kid) {
      throw new Error("The token is missing key id header (kid)");
    }
    const publicKey = await getSigningKey(decoded.header.kid);
    const verified = jwt.verify(idToken, publicKey, {
      audience: CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    });
    console.log("Token verified:", verified.sub);
  } catch (err) {
    console.log("Token verify failed:", err.message);
    return authFailedResponse({ request, origin, returnTo });
  }
  // Add x-forwarded-host and x-forwarded-path headers used by downstream proxy routing
  try {
    request.headers["x-forwarded-host"] = [{ key: "X-Forwarded-Host", value: host }];
    request.headers["x-forwarded-path"] = [{ key: "X-Forwarded-Path", value: uri }];
    return request;
  } catch (err) {
    console.error("Error while setting x-forwarded-host headers.", err);
    return {
      status: "500",
      statusDescription: "Internal Server Error",
      headers: {
        "content-type": [{ key: "Content-Type", value: "text/plain" }],
      },
      body: "Error routing request through CloudFront",
    };
  }
};
