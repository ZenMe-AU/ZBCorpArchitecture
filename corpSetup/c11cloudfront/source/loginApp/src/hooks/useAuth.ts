import { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest, cookieDomain } from "../authConfig";

/**
 * Hook: If authenticated, it will try to acquire token silently and set cookie for parent page
 * - Manages authentication state and actions (login, logout)
 * - On auth state change, attempts to acquire token silently and set cookie
 * - Returns { isAuthenticated, account, login, logout } for components to use
 */
export function useAuth() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0];

  useEffect(() => {
    console.log("Auth state changed. isAuthenticated:", isAuthenticated, "account:", account, "inProgress:", inProgress);
    if (inProgress !== "none") return;
    if (!isAuthenticated || !account) return;

    const getToken = async () => {
      try {
        const res = await instance.acquireTokenSilent({
          ...loginRequest,
          account,
        });

        if (res?.idToken) {
          await cookieStore.set({
            name: "idToken",
            value: res.idToken || "",
            domain: cookieDomain,
          });
          // await cookieStore.set({
          //   name: "preferred_username",
          //   value: idTokenClaims?.preferred_username || "",
          //   domain: cookieDomain,
          // });
          // console.log(cookieDomain);
        }
      } catch (err) {
        console.error("Token acquire failed", err);
      }
    };

    getToken();
  }, [isAuthenticated, account, instance, inProgress]);

  const login = () => instance.loginRedirect(loginRequest);

  const logout = async () => {
    await cookieStore.set({ name: "idToken", value: "", domain: cookieDomain });
    await cookieStore.delete({ name: "idToken", domain: cookieDomain });
    // await cookieStore.set({ name: "preferred_username", value: "", domain: cookieDomain });
    // await cookieStore.delete({ name: "preferred_username", domain: cookieDomain });
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("msal.")) {
        localStorage.removeItem(key);
      }
    });
    window.location.reload();
  };

  return {
    isAuthenticated,
    account,
    login,
    logout,
  };
}
