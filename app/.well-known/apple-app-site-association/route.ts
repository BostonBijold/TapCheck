import { NextResponse } from "next/server";

// Universal Links config for the NFC feature (see docs/features/nfc.md) —
// scoped to /nfc/* only, not the whole site. Served as a route handler
// rather than a static public/ file so Content-Type: application/json is
// guaranteed regardless of static-file content-type quirks; Apple fetches
// this over HTTPS with no redirect allowed.
//
// appID's team ID (T3NRTCA735) is the free Personal Team currently used for
// local device testing — once the paid Developer Program enrollment clears
// and TestFlight/App Store builds sign with that team instead, this must be
// updated to match, or Universal Links will silently stop matching for any
// build signed with the new team.
export async function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "T3NRTCA735.com.bostonbijold.beone",
          paths: ["/nfc/*"],
        },
      ],
    },
  });
}
