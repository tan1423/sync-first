// Authorization guards — the single choke-point for tenant isolation.
//
// Every document data access MUST go through requireMembership(). Because a
// Member row is required for (userId, documentId), there is no code path that
// returns another tenant's document — this is the "strict ORM scoping" the
// assignment asks for (MongoDB has no Row-Level Security).
import { connectDB } from "./db";
import { Member, type Role } from "./models";

export class AuthzError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

export interface Membership {
  documentId: string;
  userId: string;
  role: Role;
}

/** Throws AuthzError(404) if the user is not a member (don't leak existence). */
export async function requireMembership(
  userId: string,
  documentId: string,
  minRole: Role = "VIEWER",
): Promise<Membership> {
  await connectDB();
  const member = await Member.findOne({ documentId, userId }).lean();

  // 404 (not 403) on missing membership so we never reveal that a document
  // exists to a user who has no relationship with it.
  if (!member) throw new AuthzError(404, "Document not found");

  const role = member.role as Role;
  if (RANK[role] < RANK[minRole]) {
    throw new AuthzError(403, "Insufficient permissions");
  }

  return { documentId, userId, role };
}

/** True if the role may push state to the realtime server (not a viewer). */
export function canWrite(role: Role): boolean {
  return role === "OWNER" || role === "EDITOR";
}
