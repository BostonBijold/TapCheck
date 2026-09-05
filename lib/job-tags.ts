import mongoose from "mongoose";
import JobTag from "@/models/JobTag";
import User from "@/models/User";

// User.jobTags stores plain tag-name strings (see models/User.ts), not a
// ref to JobTag._id — same "no join needed to display" tradeoff documented
// there. That means a rename or archive here must cascade into every
// User.jobTags array that references the old name, or catalog and
// assignment silently drift apart. Both helpers mirror
// lib/inventory.ts's archiveInventoryGroup: look up the catalog doc scoped
// to companyId, fan the change out to dependents, then save.

// Renames a tag and rewrites every User.jobTags entry that held the old
// name to the new one in the same request. The positional `$` operator is
// safe here since a given tag name should never appear twice in one user's
// own jobTags array.
export async function renameJobTag(companyId: string, tagId: string, name: string) {
  const tag = await JobTag.findOne({ _id: tagId, companyId });
  if (!tag) return null;

  const oldName = tag.name;
  tag.name = name;
  await tag.save();

  // User.companyId is Mongoose-typed as ObjectId (unlike JobTag's plain
  // String) — SKIP_AUTH's dev sentinel company id isn't a valid ObjectId
  // and would otherwise make this cast-fail, same defensive pattern as
  // app/api/team/route.ts's GET.
  if (oldName !== name && mongoose.isValidObjectId(companyId)) {
    await User.updateMany({ companyId, jobTags: oldName }, { $set: { "jobTags.$": name } });
  }

  return tag;
}

// Archives a tag and strips it from every User.jobTags array that held it —
// unlike InventoryGroup's archive (which falls members back to "Ungrouped"),
// a job tag has no fallback value; it's simply removed from whoever had it.
export async function archiveJobTag(companyId: string, tagId: string) {
  const tag = await JobTag.findOne({ _id: tagId, companyId });
  if (!tag) return null;

  const unassignedCount = mongoose.isValidObjectId(companyId)
    ? await User.countDocuments({ companyId, jobTags: tag.name })
    : 0;
  if (mongoose.isValidObjectId(companyId)) {
    await User.updateMany({ companyId, jobTags: tag.name }, { $pull: { jobTags: tag.name } });
  }

  tag.isActive = false;
  await tag.save();

  return { tag, unassignedCount };
}
