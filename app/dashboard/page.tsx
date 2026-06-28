import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { DocumentModel, Member, Version } from "@/lib/models";
import { Dashboard } from "@/components/Dashboard";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  await connectDB();
  const memberships = await Member.find({ userId: session.sub }).lean();
  const docIds = memberships.map((m) => m.documentId);

  const [docs, versionCounts, memberCounts] = await Promise.all([
    DocumentModel.find({ _id: { $in: docIds } }).lean(),
    Version.aggregate([
      { $match: { documentId: { $in: docIds } } },
      { $group: { _id: "$documentId", n: { $sum: 1 } } },
    ]),
    Member.aggregate([
      { $match: { documentId: { $in: docIds } } },
      { $group: { _id: "$documentId", n: { $sum: 1 } } },
    ]),
  ]);

  const roleByDoc = new Map(memberships.map((m) => [m.documentId.toString(), m.role]));
  const vCount = new Map(versionCounts.map((c) => [c._id.toString(), c.n]));
  const mCount = new Map(memberCounts.map((c) => [c._id.toString(), c.n]));

  const documents = docs
    .map((d) => {
      const id = d._id.toString();
      return {
        id,
        title: d.title,
        role: (roleByDoc.get(id) ?? "VIEWER") as "OWNER" | "EDITOR" | "VIEWER",
        updatedAt: new Date(d.updatedAt).toISOString(),
        versions: vCount.get(id) ?? 0,
        collaborators: mCount.get(id) ?? 0,
      };
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));

  return (
    <Dashboard
      user={{ name: session.name, email: session.email }}
      initialDocuments={documents}
    />
  );
}
