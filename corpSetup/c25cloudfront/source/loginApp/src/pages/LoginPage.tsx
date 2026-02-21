import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { Button, Card, CardContent, Typography, Box, Container } from "@mui/material";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
import { useAuth, type Auth } from "../hooks/useAuth";
import { useAnchor, type Anchor } from "../hooks/useAnchor";

// Component: Displays login page with different content for authenticated and unauthenticated users
export default function LoginPage() {
  const { hasAnchor, goBack } = useAnchor();
  const { account, login, logout } = useAuth();

  return (
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
          <UnauthenticatedSection login={login} />
          <AuthenticatedSection account={account} logout={logout} hasAnchor={hasAnchor} goBack={goBack} />
        </CardContent>
      </Card>
    </Box>
  );
}

// Separate components for authenticated and unauthenticated sections below
function UnauthenticatedSection({ login }: Pick<Auth, "login">) {
  return (
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
  );
}

function AuthenticatedSection({ account, logout, hasAnchor, goBack }: Pick<Auth, "account" | "logout"> & Pick<Anchor, "hasAnchor" | "goBack">) {
  return (
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
            onClick={goBack}
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
  );
}
