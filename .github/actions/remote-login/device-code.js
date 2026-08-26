/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Watches PTY output for the Azure device code prompt and pulls out the login URL and the code.
 * Copied from azure-remote-login/runner/device-code.js.
 */

import { EventEmitter } from "events";

export class DeviceCodeDetector extends EventEmitter {
  constructor() {
    super();
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

    const match = this.buffer.match(/enter the code\s+([A-Z0-9]+)/i);
    if (!match) return;

    const urlMatch = this.buffer.match(/https:\/\/(?:microsoft\.com\/devicelogin|login\.microsoftonline\.com\/common\/oauth2\/deviceauth)/i);
    this.emit("deviceCode", { url: urlMatch ? urlMatch[0] : "https://microsoft.com/devicelogin", code: match[1] });

    // Cleared so the same code is not emitted twice.
    this.buffer = "";
  }
}
