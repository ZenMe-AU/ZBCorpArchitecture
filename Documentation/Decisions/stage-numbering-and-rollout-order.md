# Decision: Stage Numbering and Rollout Order

## Status
Accepted

## Context
Infrastructure bootstrap spans multiple domains that depend on outputs from earlier stages.

## Decision
Use numbered cXX stages and a fixed progression controlled by the deploy orchestrator.

## Rationale
Ordered execution reduces dependency ambiguity and supports predictable failure isolation.

## Consequences
- Positive: easier traceability and repeatability across environments.
- Negative: less flexibility for ad hoc parallel execution.

## Evidence
- [corpSetup/initCorpEnvDeploy.js](../../corpSetup/initCorpEnvDeploy.js#L125)
- [corpSetup/initCorpEnvDeploy.js](../../corpSetup/initCorpEnvDeploy.js#L161)

## Related Patterns
- [Pipeline (software)](../ArchitecturePatterns/pipeline-software.md)
- [Template Method Pattern](../ArchitecturePatterns/template-method-pattern.md)
