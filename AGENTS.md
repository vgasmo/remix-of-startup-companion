# Security architecture

- Enforce signed contract term immutability and verified activation in database triggers; UI restrictions alone are bypassable.
- Route manual signature attestations and renewals through role-checked, auditable database commands; preserve established manual and renewal workflows without permitting generic edits.
- Verify privileged user account status through the shared security helper before service-role operations; account-check errors deny access.
- Use the canonical server NDA authorization result and block protected views on verification errors; notification age does not define an expiry policy.
- Queue activation recovery in the signature transaction, wake it on enqueue, and disarm retries after drain; complete intake activation only after verifying signed contract and active unblocked workspace.
- The disposable SQL harness accepts explicit additive migration paths; audit fixtures model missing legacy tables only and never run against hosted data.