// import React from "react";
import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import { MsalProvider, useMsal, useIsAuthenticated } from "@azure/msal-react";
import { msalConfig, loginRequest, cookieDomain } from "./authConfig";
import { useAnchorPage, goBackAnchor } from "./hook/useAnchorPage";
import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { Button, Card, CardContent, Typography, Box, Container } from "@mui/material";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
// import Tooltip from "@mui/material/Tooltip";
// import IconButton from "@mui/material/IconButton";

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

function AppContent() {
  const hasAnchor = useAnchorPage();
  const params = new URLSearchParams(window.location.search);
  const rawReturnTo = params.get("returnTo");

  let returnTo = "/";

  if (rawReturnTo) {
    try {
      const decoded = decodeURIComponent(rawReturnTo);
      const url = new URL(decoded);
      console.log("Return to URL:", url);
      if (url.protocol === "https:" && url.host.endsWith(cookieDomain)) {
        returnTo = decoded;
      }
    } catch {}
  }

  sessionStorage.setItem("returnTo", returnTo);
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
    // await cookieStore.delete({ name: "preferred_username", domain: cookieDomain });
    // console.log("logout");
    // sessionStorage.clear();
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith("msal.")) {
        sessionStorage.removeItem(key);
      }
    });
    localStorage.clear();
    window.location.reload();
    // await instance.logoutRedirect();
  };

  // const hasParentToken = (await cookieStore.getAll()).some(
  //   c =>
  //     c.name === 'token' &&
  //     (c.domain === 'example.com' || c.domain === '.example.com')
  // );

  // const insAccounts = instance.getAllAccounts();
  // console.log("insAccounts:", insAccounts);
  if (isAuthenticated && account) {
    // if (account) {
    // Get ID token silently

    const response = async () => {
      return await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
    };
    response().then(async function (res) {
      // console.log(res);
      // console.log(res?.idToken);
      // Set the ID token as a cookie
      if (res && res.idToken) {
        // const idTokenClaims = res.idTokenClaims as { preferred_username?: string };
        // localStorage.setItem("idToken", res.idToken);
        // localStorage.setItem("preferred_username", idTokenClaims?.preferred_username || "");
        try {
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
          isAuthenticated = true;
        } catch (error) {
          console.log(`Error setting cookie: ${error}`);
          // logout();
        }
      }
    });
    console.log("account:", account);
  }

  return (
    <>
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: "url('/bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          px: 2, // padding for small screens
        }}
      >
        <Card
          sx={{
            maxWidth: 350,
            width: "100%",
            mx: "auto",
            borderRadius: 6,
            boxShadow: 10,
          }}
        >
          <CardContent sx={{ textAlign: "center", pt: 4 }}>
            <UnauthenticatedTemplate>
              <Box
                sx={{
                  position: "relative",
                  display: "inline-block",
                  textAlign: "center",
                }}
              >
                <Typography variant="h6" fontWeight="bold" sx={{ position: "relative", zIndex: 1 }}>
                  Sign in <br />
                  to access protected content
                </Typography>
                <Box component="img" src="/welcome.png" sx={{ maxWidth: 260, my: -4 }} />
                <Button variant="contained" endIcon={<Login />} sx={{ borderRadius: 20, textTransform: "none" }} onClick={login}>
                  Sign in with Microsoft
                </Button>
              </Box>
            </UnauthenticatedTemplate>

            <AuthenticatedTemplate>
              <Container sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                  You are signed in as
                </Typography>
                <Typography variant="body1" sx={{ mb: 3, wordBreak: "break-word" }}>
                  {account?.idTokenClaims?.preferred_username || ""}{" "}
                </Typography>
              </Container>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {hasAnchor && (
                  <Button
                    variant="outlined"
                    sx={{
                      borderRadius: 20,
                      textTransform: "none",
                      fontWeight: "bold",
                      fontSize: "0.95rem",
                    }}
                    // href={returnTo}
                    onClick={goBackAnchor}
                  >
                    Return to Previous Page
                  </Button>
                )}

                <Button
                  variant="outlined"
                  color="error"
                  sx={{
                    borderRadius: 20,
                    textTransform: "none",
                    fontWeight: "bold",
                    fontSize: "0.95rem",
                  }}
                  onClick={logout}
                  startIcon={<Logout />}
                >
                  Sign Out
                </Button>
              </Box>
            </AuthenticatedTemplate>
          </CardContent>
        </Card>
      </Box>
    </>
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
