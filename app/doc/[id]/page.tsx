import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { DocumentModel, Member } from "@/lib/models";
import { requireMembership, AuthzError } from "@/lib/guards";
import { EditorLoader } from "@/components/EditorLoader";

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  await connectDB();

  // Tenant isolation: requireMembership throws 404 if the user isn't a member.
  let role: "OWNER" | "EDITOR" | "VIEWER";
  try {
    ({ role } = await requireMembership(session.sub, id));
  } catch (err) {
    if (err instanceof AuthzError) notFound();
    throw err;
  }

  const doc = await DocumentModel.findById(id).lean();
  if (!doc) notFound();

  const memberRows = (await Member.find({ documentId: id })
    .populate("userId", "name email")
    .lean()) as unknown as Array<{
    role: "OWNER" | "EDITOR" | "VIEWER";
    userId: { _id: { toString(): string }; name: string; email: string };
  }>;

  const members = memberRows.map((m) => ({
    userId: m.userId._id?.toString() as string,
    name: m.userId.name,
    email: m.userId.email,
    role: m.role,
  }));

  return (
    <div>
      <nav className="border-b border-gray-200 bg-white/70 px-4 py-2 text-sm dark:border-gray-800 dark:bg-gray-950/70">
        <Link href="/dashboard" className="text-gray-500 hover:underline">
          ← All documents
        </Link>
      </nav>
      <EditorLoader
        documentId={id}
        initialTitle={doc.title}
        role={role}
        me={{ id: session.sub, name: session.name }}
        members={members}
      />
    </div>
  );
}
