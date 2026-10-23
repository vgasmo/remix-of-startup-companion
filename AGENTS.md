# Security architecture

- Enforce signed contract term immutability and verified activation in database triggers; UI restrictions alone are bypassable.
- Route manual signature attestations and renewals through role-checked, auditable database commands; preserve established manual and renewal workflows without permitting generic edits.
- Verify privileged user account status through the shared security helper before service-role operations; account-check errors deny access.
- Use the canonical server NDA authorization result and block protected views on verification errors; notification age does not define an expiry policy.
- Queue activation recovery in the signature transaction, wake it on enqueue, and disarm retries after drain; complete intake activation only after verifying signed contract and active unblocked workspace.
- The disposable SQL harness accepts explicit additive migration paths; audit fixtures model missing legacy tables only and never run against hosted data.
- Service-role workspace mutations require account-active verification and caller-scoped write RPCs; financial writes also check the financial-plan permission to exclude mentors.
- Email templates escape inserted data and restrict notification links to the application origin; CSV exports share the formula-neutralizing serializer.
- Contract document uploads persist metadata through a service-only atomic key merge after token validation, preventing concurrent reference loss.
- The canonical browser client bounds requests with cancellation; failed statistics are errors, never fabricated zero values.
- PDF workers are bundled from the installed renderer version so library upgrades cannot mismatch external workers.
- Dependency security overrides stay on compatible library APIs and are checked against the lockfile, browser-target transform tests and automatic build; never upgrade a build tool beyond a verified compatible version merely to clear a warning.
- Failed webhook delivery reclamation uses a conditional failed-state update; database failures request a provider retry instead of acknowledging an unprocessed duplicate.
- Parent-ID RLS helpers check access to the parent workspace without querying the child-policy table recursively; public account predicates fail closed for anonymous callers.
- Workspace assignment searches filter joined startup fields server-side and paginate with a stable ID tie-breaker; never first truncate matching startup IDs.
- Destructive notification performance tests require an explicit disposable loopback connection and never inherit hosted database environment variables; SQL harnesses reject missing files, empty suites and nonzero command exits.
