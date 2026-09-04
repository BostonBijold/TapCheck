import Location from "@/models/Location";

// Every active Location under a company — an owner's computed
// visible-locations set (see docs/features/locations.md's Role tiers: this
// is never stored per-owner, always recomputed at read time).
export async function listActiveLocations(companyId: string) {
  return Location.find({ companyId, isActive: true }).sort({ name: 1 }).lean();
}

// Confirms a client-supplied locationId actually names an active Location
// under this company before trusting it any further — used wherever an
// owner picks a location explicitly (a ?locationId= query param, an invite
// creation location picker) rather than falling back to their own stored
// locationId. Returns the id back (unchanged) if valid, else null.
export async function validateLocationId(companyId: string, locationId: string | null | undefined): Promise<string | null> {
  if (!locationId) return null;
  const location = await Location.findOne({ _id: locationId, companyId, isActive: true }, "_id").lean();
  return location ? locationId : null;
}
