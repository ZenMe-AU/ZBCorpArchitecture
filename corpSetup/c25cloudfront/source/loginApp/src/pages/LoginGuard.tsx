import type { ReactNode } from "react";
import { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "../authConfig";

interface LoginGuardProps {
  children: ReactNode;
}

// Component: Guards its children with authentication check and triggers login redirect if not authenticated
export default function LoginGuard({ children }: LoginGuardProps) {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (inProgress !== "none") return;
    if (!isAuthenticated) {
      instance.loginRedirect(loginRequest);
    }
  }, [isAuthenticated, inProgress, instance]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
