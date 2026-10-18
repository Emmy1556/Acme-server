import { Property } from "../models/Property";

/**
 * Small, idempotent data fixes run on every start-up (safe to run repeatedly —
 * each one only touches documents still in the old shape).
 */
export async function runMigrations() {
  // 2026-10: a land listing's single `titleDocument` became a list, `titleDocuments`.
  const { modifiedCount } = await Property.collection.updateMany({ titleDocument: { $exists: true } }, [
    {
      $set: {
        titleDocuments: {
          $cond: [{ $in: [{ $ifNull: ["$titleDocument", ""] }, ["", null]] }, "$$REMOVE", ["$titleDocument"]],
        },
      },
    },
    { $unset: "titleDocument" },
  ]);
  if (modifiedCount) console.log(`🛠  Migrated ${modifiedCount} listing(s) to multiple title documents`);
}
