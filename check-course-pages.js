/**
 * Diagnostic: why a course's lessons/videos/quiz don't show.
 * Run on the LIVE server (same place you ran the migration):
 *   node check-course-pages.js
 *   node check-course-pages.js "Million Dollar Playbook"   # filter by title
 *
 * Reports, per course: how many pages/folders exist vs how many are PUBLISHED,
 * and flags pages whose folderId doesn't match any folder (orphans). The app
 * only renders pages with status === "published", so drafts are the usual cause
 * of "modules show but no lessons".
 */
try { require("dotenv").config(); } catch (_) {}
const mongoose = require("mongoose");

const titleFilter = process.argv[2];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "millerstorm", serverSelectionTimeoutMS: 8000 });
  const Courses = mongoose.connection.collection("courses");
  const q = titleFilter ? { title: new RegExp(titleFilter, "i") } : {};
  const courses = await Courses.find(q).toArray();
  console.log(`Found ${courses.length} course(s)\n`);

  for (const c of courses) {
    const pages = c.pages || [];
    const folders = c.folders || [];
    const pubPages = pages.filter((p) => p.status === "published");
    const pubFolders = folders.filter((f) => f.status === "published");
    const folderIds = new Set(folders.map((f) => f.id));
    const orphans = pages.filter((p) => p.folderId && !folderIds.has(p.folderId));

    console.log(`=== "${c.title}" (status: ${c.status}, accessMode: ${c.accessMode || "open"}) ===`);
    console.log(`  folders: ${folders.length} total, ${pubFolders.length} published`);
    console.log(`  pages:   ${pages.length} total, ${pubPages.length} published`);
    const draft = pages.length - pubPages.length;
    if (draft > 0) console.log(`  ⚠️  ${draft} page(s) are NOT published (draft) — these will NOT show to users`);
    if (orphans.length) console.log(`  ⚠️  ${orphans.length} page(s) point to a folderId that doesn't exist`);
    // per-folder published lesson count
    for (const f of folders) {
      const inF = pages.filter((p) => p.folderId === f.id);
      const pubInF = inF.filter((p) => p.status === "published");
      console.log(`    • ${f.title} [${f.status}] → ${pubInF.length}/${inF.length} published lessons`);
    }
    const noFolder = pages.filter((p) => !p.folderId);
    if (noFolder.length) console.log(`    • (no folder) → ${noFolder.filter((p) => p.status === "published").length}/${noFolder.length} published`);
    console.log("");
  }

  await mongoose.disconnect();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
