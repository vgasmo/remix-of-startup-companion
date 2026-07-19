#!/usr/bin/env node
// Microsoft Graph sandbox probe — client_credentials against a dedicated STAGING tenant.
// Fails closed if any variable missing, tenant matches production, or Graph rejects.

const die = (m) => { console.error(`[rc5:probe-graph] FAIL — ${m}`); process.exit(1); };

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be 'true'.");
const { RC5_GRAPH_TENANT_ID: tenant, RC5_GRAPH_CLIENT_ID: cid, RC5_GRAPH_CLIENT_SECRET: sec } = process.env;
if (!tenant || !cid || !sec) die('RC5_GRAPH_TENANT_ID, RC5_GRAPH_CLIENT_ID, RC5_GRAPH_CLIENT_SECRET are required.');
if (process.env.RC5_PROD_GRAPH_TENANT_ID && tenant === process.env.RC5_PROD_GRAPH_TENANT_ID) die('Graph tenant matches production. Refusing.');

const body = new URLSearchParams({ client_id: cid, client_secret: sec, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' });
const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
if (!res.ok) die(`Graph token endpoint returned ${res.status}.`);
const json = await res.json();
if (!json.access_token) die('No access_token in Graph response.');
// Do NOT print the token. Only shape confirmation.
console.log(`[rc5:probe-graph] OK — token acquired, expires_in=${json.expires_in}s.`);
