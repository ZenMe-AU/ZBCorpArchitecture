/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Watches PTY output for a device code prompt and pulls out the login URL and the code.
 * One detector per login: the two clouds print different shapes, so the cloud picks the pattern.
 */

import { EventEmitter } from "events";

const PATTERNS = {
  azure: {
    // "To sign in, use a web browser ... and enter the code ABCDEFGH to authenticate."
    code: /enter the code\s+([A-Z0-9]{6,})/i,
    url: /https:\/\/(?:microsoft\.com\/devicelogin|login\.microsoftonline\.com\/common\/oauth2\/deviceauth)/i,
    fallbackUrl: "https://microsoft.com/devicelogin",
  },
  // `aws login --remote` shows a URL and then waits for the code the console hands back, so the
  // URL is the whole payload — there is no code to display up front.
  aws: {
    code: null,
    url: /https:\/\/[a-z0-9.-]*\.(?:aws\.amazon\.com|amazonaws\.com)\/\S*/i,
  },
};

export class DeviceCodeDetector extends EventEmitter {
  constructor(cloud) {
    super();
    if (!PATTERNS[cloud]) throw new Error(`Unknown cloud "${cloud}"`);
    this.cloud = cloud;
    this.pattern = PATTERNS[cloud];
    this.buffer = "";
    this.maxBuffer = 4096;
  }

  /**
   * Feed raw terminal data. Emits a 'deviceCode' event when a code is found.
   * @param {string|Buffer} data - Raw PTY output
   */
  feed(data) {
    this.buffer += typeof data === "string" ? data : data.toString("utf8");

    if (this.buffer.length > this.maxBuffer) {
      this.buffer = this.buffer.slice(-this.maxBuffer);
    }

    // A cloud with no code pattern is URL-only: seeing the URL is the whole signal.
    const match = this.pattern.code ? this.buffer.match(this.pattern.code) : null;
    if (this.pattern.code && !match) return;

    const urlMatch = this.buffer.match(this.pattern.url);
    if (!urlMatch && !match) return;

    this.emit("deviceCode", {
      cloud: this.cloud,
      url: urlMatch ? urlMatch[0] : this.pattern.fallbackUrl,
      code: match ? match[1] : undefined,
    });

    // Cleared so the same code is not emitted twice.
    this.buffer = "";
  }
}
