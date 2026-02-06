"use strict";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { CLIENT_ID, TENANT_ID, AUTH_DOMAIN } from "./config.mjs";

// // const CLIENT_ID = "b0ee1412-c79a-48f3-978e-f61f740d7832";
// const CLIENT_ID = "b0552ac8-f601-4f4f-be1f-f1c3446aae71";
// const TENANT_ID = "15fb0613-7977-4551-801b-6aadac824241";
// const MS_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
// MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhTfqnXJAT9zSM4Xm5QHD
// 3kIW1tXHj5+1xj35D3ht0s9WogK2nzcwlSDWivqnt1aED3njfI9V6V8rOI5Sde8K
// B87QfLH6SmRtG4dLixDfFoulHPamQ9lEp5i8xVZeypRM03O30AGCfx0G83JiiHVA
// VLqpjc8Ervl6yMNHyg8hyBkbV/IyeZVVJW2nu0ljkQwyTLr1GH1h2I7a/ioK6WlW
// 7lNK8OYLSEQ/B9ecaKf8dPDy1/Zt5f7I6RdJPRicSgsBUeX34CuJJuBiOB0k4Tih
// JVhc43YexUDo+Sd/e2P3BgpdK3I0ksX5c58yO2z0OvpFHYSg2CYOdzEOj/mLKbOA
// zQIDAQAB
// -----END PUBLIC KEY-----`;
// const AUTH_DOMAIN = "https://login.zenblox.com.au";

// Microsoft JWKS client
const msJwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 6 * 60 * 60 * 1000, // 6 hours
  timeout: 3000,
});

function getSigningKeyAsync(kid) {
  return new Promise((resolve, reject) => {
    msJwks.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

function authFailedResponse({ isApiRequest, origin, returnTo }) {
  if (isApiRequest) {
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

  return {
    status: "302",
    headers: {
      location: [
        {
          key: "Location",
          value: AUTH_DOMAIN + `?returnTo=${returnTo}`,
        },
      ],
    },
  };
}

export const handler = async (event) => {
  const request = event.Records[0].cf.request;
  const isApiRequest = (request.headers.accept?.[0]?.value || "").includes("application/json");
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
  // TODO: enable this check later
  // const origin = (() => {
  //   const reqOrigin = request.headers?.origin?.[0]?.value || "";
  //   if (reqOrigin.startsWith("https://") && reqOrigin.endsWith(ALLOWED_ORIGIN_SUFFIX)) {
  //     return reqOrigin;
  //   }
  //   return "";
  // })();
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return {
      status: "204",
      headers: {
        "access-control-allow-origin": [{ key: "Access-Control-Allow-Origin", value: origin }],
        "access-control-allow-methods": [{ key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" }],
        "access-control-allow-headers": [{ key: "Access-Control-Allow-Headers", value: "Authorization,X-Correlation-Id,Content-Type,Accept" }],
        "access-control-allow-credentials": [{ key: "Access-Control-Allow-Credentials", value: "true" }],
        vary: [{ key: "Vary", value: "Origin" }],
      },
    };
  }
  const idToken = cookies["idToken"];
  if (!idToken) {
    return authFailedResponse({ isApiRequest, origin, returnTo });
  }

  try {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded?.header?.kid) {
      throw new Error("Missing kid");
    }

    const publicKey = await getSigningKeyAsync(decoded.header.kid);

    const verified = jwt.verify(idToken, publicKey, {
      audience: CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    });
    console.log("JWT verified:", verified.sub);
  } catch (err) {
    console.log("JWT verify failed:", err.message);
    return authFailedResponse({ isApiRequest, origin, returnTo });
  }

  try {
    request.headers["x-forwarded-host"] = [{ key: "X-Forwarded-Host", value: host }];
    request.headers["x-forwarded-path"] = [{ key: "X-Forwarded-Path", value: uri }];

    return request;
  } catch (err) {
    console.log("error while setting host headers.", err);
    return {
      status: "500",
      statusDescription: "Internal Server Error",
      headers: {
        "content-type": [{ key: "Content-Type", value: "text/plain" }],
      },
      body: "error while routing request",
    };
  }
};
