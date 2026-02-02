// import React from "react";
import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import { MsalProvider, useMsal, useIsAuthenticated } from "@azure/msal-react";
import { msalConfig, loginRequest, cookieDomain } from "./authConfig";

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

function AppContent() {
  const { instance, accounts } = useMsal();
  let isAuthenticated = useIsAuthenticated();
  const account: AccountInfo | undefined = accounts[0];

  // Trigger login redirect
  const login = async () => {
    await instance.loginRedirect(loginRequest);
  };

  // Trigger logout redirect
  const logout = async () => {
    await cookieStore.set({ name: "idToken", value: "", domain: cookieDomain });
    await cookieStore.delete({ name: "idToken", domain: cookieDomain });
    await cookieStore.delete({ name: "preferred_username", domain: cookieDomain });
    console.log("logout");
    sessionStorage.clear();
    window.location.reload();
    // await instance.logoutRedirect();
  };

  // const hasParentToken = (await cookieStore.getAll()).some(
  //   c =>
  //     c.name === 'token' &&
  //     (c.domain === 'example.com' || c.domain === '.example.com')
  // );

  const insAccounts = instance.getAllAccounts();
  console.log("insAccounts:", insAccounts);
  // if (isAuthenticated && account) {
  if (account) {
    // Get ID token silently

    const response = async () => {
      return await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
    };
    response().then(async function (res) {
      console.log(res);
      console.log(res?.idToken);
      // Set the ID token as a cookie
      if (res && res.idToken) {
        const idTokenClaims = res.idTokenClaims as { preferred_username?: string };
        // localStorage.setItem("idToken", res.idToken);
        // localStorage.setItem("preferred_username", idTokenClaims?.preferred_username || "");
        try {
          await cookieStore.set({
            name: "idToken",
            value: res.idToken || "",
            domain: cookieDomain,
          });
          await cookieStore.set({
            name: "preferred_username",
            value: idTokenClaims?.preferred_username || "",
            domain: cookieDomain,
          });
          console.log(cookieDomain);
          isAuthenticated = true;
        } catch (error) {
          console.log(`Error setting cookie1: ${error}`);
          // logout();
        }
      }
    });
    console.log("account:", account);
  }

  return (
    <div style={{ padding: 24 }}>
      {!isAuthenticated && <button onClick={login}>Sign in</button>}

      {isAuthenticated && account && (
        <>
          {/* <h3>ID Token Claims</h3>
          <pre>{JSON.stringify(account.idTokenClaims, null, 2)}</pre> */}
          <div>You are signed in as {account.username}</div>
          <button onClick={logout}>Sign out</button>
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <AppContent />
    </MsalProvider>
  );
}

export default App;
