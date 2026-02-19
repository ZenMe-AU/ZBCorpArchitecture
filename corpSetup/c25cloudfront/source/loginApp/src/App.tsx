// import React from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig";
import LoginPage from "./pages/LoginPage";
import LoginGuard from "./pages/LoginGuard";

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <LoginGuard>
        <LoginPage />
      </LoginGuard>
    </MsalProvider>
  );
}

export default App;
