# OpenID Connect

## Overview
Intent: Authenticate users through standards-based identity metadata, token issuance, and JWT verification. Problem: The edge layer must verify user identity before allowing content access without managing its own identity store. Trade-Offs: OIDC interoperability is strong, but token validation and cookie transport choices require careful security controls. Wikipedia Reference: [OpenID Connect](https://en.wikipedia.org/wiki/OpenID_Connect).

## Implementation
The edge guard resolves issuer metadata and validates JWT signatures and claims in [corpSetup/c25cloudfront/source/authGuardLambdaEdge/index.mjs](../../corpSetup/c25cloudfront/source/authGuardLambdaEdge/index.mjs#L9) and [corpSetup/c25cloudfront/source/authGuardLambdaEdge/index.mjs](../../corpSetup/c25cloudfront/source/authGuardLambdaEdge/index.mjs#L121).

The login SPA drives interactive and silent token acquisition in [corpSetup/c25cloudfront/source/loginApp/src/hooks/useAuth.ts](../../corpSetup/c25cloudfront/source/loginApp/src/hooks/useAuth.ts#L24), and redirect enforcement is implemented in [corpSetup/c25cloudfront/source/loginApp/src/pages/LoginGuard.tsx](../../corpSetup/c25cloudfront/source/loginApp/src/pages/LoginGuard.tsx#L19).

## Future enhancements
- Move token transport toward stronger cookie/session handling where feasible.
- Add token freshness and clock-skew test coverage in edge validation paths.

## Related Decisions and Patterns
- Related decisions:
  - [Identity Provider Microsoft Entra](../Decisions/identity-provider-microsoft-entra.md)
  - [Token in Cookie Edge Auth Tradeoff](../Decisions/token-in-cookie-edge-auth-tradeoff.md)
- Related patterns:
  - [Claims-Based Identity](claims-based-identity.md)
  - [Chain-of-Responsibility Pattern](chain-of-responsibility-pattern.md)
