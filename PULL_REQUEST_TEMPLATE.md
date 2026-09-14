## What changed

<!-- One or two sentences. -->

## Checklist

- [ ] Every API call goes through the client (no ad-hoc requests with hand-built headers)
- [ ] Every endpoint used exists in a spec listed in `/openapi/index.json`
- [ ] No secrets, customer names, tenant codes, device serials or asset URLs (grep before you push)
- [ ] Runs from a clean clone with `.env.example` filled in, against a sandbox tenant
- [ ] `README.md` still true after this change
