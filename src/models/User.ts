import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

export const ROLES = ["user", "agent", "admin"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, default: "user" },
    /** For agents/landlords: company or agency name shown on listings */
    agency: { type: String, trim: true },
    avatar: { type: String },
    isActive: { type: Boolean, default: true },
    /** Agents must be verified by an admin before their listings go live */
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export type IUser = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<IUser> & { comparePassword(p: string): Promise<boolean> };

export const User = model("User", userSchema);
