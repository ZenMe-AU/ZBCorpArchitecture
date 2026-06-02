# Decision: Identity Provider Microsoft Entra

## Status
Accepted

## Context
The platform needs workforce identity integration for browser login and federated access workflows.

## Decision
Use Microsoft Entra as the primary identity provider for login and token issuance.

## Rationale
The repository already provisions Entra app artifacts and validates Entra-issued tokens at the edge.

## Consequences
- Positive: centralized enterprise identity model and standards-based token metadata.
- Negative: runtime coupling to Entra metadata availability and token contract assumptions.

## Evidence
- [corpSetup/c25cloudfront/main.tf](../../corpSetup/c25cloudfront/main.tf#L6)
- [corpSetup/c25cloudfront/source/authGuardLambdaEdge/index.mjs](../../corpSetup/c25cloudfront/source/authGuardLambdaEdge/index.mjs#L9)

## Related Patterns
- [OpenID Connect](../ArchitecturePatterns/openid-connect.md)
- [Claims-Based Identity](../ArchitecturePatterns/claims-based-identity.md)
