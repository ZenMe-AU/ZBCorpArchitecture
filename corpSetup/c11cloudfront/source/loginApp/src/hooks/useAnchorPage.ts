import { useEffect, useState } from "react";
import { cookieDomain } from "../authConfig";

const HISTORY_KEY = "nav_history_depth";
const ANCHOR_KEY = "nav_anchor_page";

/**
 * Hook: Record anchor page and history stack depth
 * - Only stores pages on the same subdomain
 * - Returns {hasAnchor: boolean} indicating if Go Back button should be shown
 */
export function useAnchorPage(): { hasAnchor: boolean } {
  const [hasAnchor, setHasAnchor] = useState<boolean>(false);

  useEffect(() => {
    try {
      const ref: string = document.referrer;
      const currentUrl: string = window.location.origin + window.location.pathname;
      // Only store if referrer is on the same subdomain
      if (ref && ref !== currentUrl && new URL(ref).hostname.endsWith(cookieDomain)) {
        sessionStorage.setItem(ANCHOR_KEY, ref);
        sessionStorage.setItem(HISTORY_KEY, String(window.history.length - 1));
        console.log("Anchor page set:", ref, "History depth:", window.history.length - 1, "Current URL:", currentUrl);
      }
      // Determine if Go Back button should show
      const depth: number = Number(sessionStorage.getItem(HISTORY_KEY));
      const page: string | null = sessionStorage.getItem(ANCHOR_KEY);
      setHasAnchor((depth && !Number.isNaN(depth)) || Boolean(page));
    } catch (e) {
      // no anchor be set if any error occurs (e.g. cross-origin referrer)
      setHasAnchor(false);
    }
  }, []);

  return { hasAnchor };
}

/**
 * Navigate back to the stored anchor
 * Priority: history stack depth → anchorPage → console.warn(do nothing)
 */
export function goBackAnchor(): void {
  try {
    // Use history depth first
    const anchorDepth: number = Number(sessionStorage.getItem(HISTORY_KEY) ?? NaN);
    if (!Number.isNaN(anchorDepth)) {
      const delta: number = anchorDepth - window.history.length;
      console.log("Navigating back with history delta:", delta, anchorDepth, window.history.length);
      if (delta !== 0) {
        window.history.go(delta);
        return;
      }
    }
    // Fallback: use anchorPage
    const anchorPage: string | null = sessionStorage.getItem(ANCHOR_KEY);
    if (anchorPage) {
      console.log("Navigating back to anchor page:", anchorPage);
      window.location.href = anchorPage;
      return;
    }
  } catch (e) {
    console.error("Failed to navigate back anchor", e);
  }
  console.warn("No valid anchor found, navigating to fallback");
}
