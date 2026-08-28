import { NextResponse } from "next/server";

// Universal Links config for the NFC feature (see docs/features/nfc.md) —
// scoped to /nfc/* only, not the whole site. Served as a route handler
// rather than a static public/ file so Content-Type: application/json is
// guaranteed regardless of static-file content-type quirks; Apple fetches
// this over HTTPS with no redirect allowed.
//
// appID's team ID (X3DPK5Y29G) is the paid Developer Program team — update
// this (and ios/App/App.xcodeproj's DEVELOPMENT_TEAM) together if the app
// is ever re-signed under a different team, or Universal Links will
// silently stop matching.
export async function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "X3DPK5Y29G.com.bostonbijold.tapcheck",
          paths: ["/nfc/*"],
        },
      ],
    },
  });
}
