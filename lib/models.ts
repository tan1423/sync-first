import mongoose, { Schema, model, models, type InferSchemaType } from "mongoose";

export const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

// ---- User ----
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// ---- Document ----
const documentSchema = new Schema(
  {
    title: { type: String, required: true, default: "Untitled document" },
  },
  { timestamps: true },
);

// ---- Member (per-user role on a document) ----
const memberSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ROLES, required: true, default: "VIEWER" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// One membership row per (document, user) — also the tenant-isolation key.
memberSchema.index({ documentId: 1, userId: 1 }, { unique: true });

// ---- DocState (latest compacted Yjs state) ----
const docStateSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true, unique: true },
    update: { type: Buffer, required: true }, // Y.encodeStateAsUpdate
    stateVector: { type: Buffer, required: true }, // Y.encodeStateVector
  },
  { timestamps: true },
);

// ---- Version (immutable time-travel snapshots) ----
const versionSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true },
    label: { type: String, required: true },
    snapshot: { type: Buffer, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
versionSchema.index({ documentId: 1, createdAt: -1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export type DocumentDoc = InferSchemaType<typeof documentSchema>;
export type MemberDoc = InferSchemaType<typeof memberSchema>;
export type DocStateDoc = InferSchemaType<typeof docStateSchema>;
export type VersionDoc = InferSchemaType<typeof versionSchema>;

// Guard against "OverwriteModelError" during Next.js hot-reload / repeated imports.
export const User = models.User ?? model("User", userSchema);
export const DocumentModel = models.Document ?? model("Document", documentSchema);
export const Member = models.Member ?? model("Member", memberSchema);
export const DocState = models.DocState ?? model("DocState", docStateSchema);
export const Version = models.Version ?? model("Version", versionSchema);

export { mongoose };
