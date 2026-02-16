import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { Button, Card, CardContent, Typography, Box, Container } from "@mui/material";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
import { useAuth } from "../hooks/useAuth";
import { useAnchorPage, goBackAnchor } from "../hooks/useAnchorPage";

// Component: Displays login page with different content for authenticated and unauthenticated users
export default function LoginPage() {
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
          <UnauthenticatedSection />
          <AuthenticatedSection />
        </CardContent>
      </Card>
    </Box>
  );
}

// Separate components for authenticated and unauthenticated sections below
function UnauthenticatedSection() {
  const { login } = useAuth();

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

function AuthenticatedSection() {
  const { logout, account } = useAuth();
  const { hasAnchor } = useAnchorPage();

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
  );
}
