import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as signIn } from "../app/login/session/route";

const DASHBOARD_URL = "https://blindspot-dashboard.onrender.com";
const BODY = new URLSearchParams({ key: "not-a-project-key", next: "/connect" }).toString();

function formRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest(`${DASHBOARD_URL}/login/session`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(BODY.length),
      "x-forwarded-host": "blindspot-dashboard.onrender.com",
      "x-forwarded-proto": "https",
      ...headers,
    },
    body: BODY,
  });
}

async function main() {
  const opaqueSameOrigin = await signIn(
    formRequest({
      origin: "null",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
    }),
  );
  assert.equal(opaqueSameOrigin.status, 303);
  assert.equal(
    opaqueSameOrigin.headers.get("location"),
    `${DASHBOARD_URL}/login?error=shape&next=%2Fconnect`,
  );
  assert.equal(opaqueSameOrigin.headers.has("set-cookie"), false);

  const explicitSameOrigin = await signIn(formRequest({ origin: DASHBOARD_URL }));
  assert.equal(explicitSameOrigin.status, 303);
  assert.equal(
    explicitSameOrigin.headers.get("location"),
    `${DASHBOARD_URL}/login?error=shape&next=%2Fconnect`,
  );

  const crossSite = await signIn(
    formRequest({
      origin: "null",
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
    }),
  );
  assert.equal(crossSite.status, 403);
  assert.deepEqual(await crossSite.json(), { error: "cross-origin sign-in is not allowed" });

  const missingOrigin = await signIn(formRequest({}));
  assert.equal(missingOrigin.status, 403);

  console.log("auth origin regression tests passed");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
