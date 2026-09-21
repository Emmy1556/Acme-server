import { Schema, model, type InferSchemaType } from "mongoose";

/** Messages from the Contact page, or enquiries about a specific property. */
const inquirySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    subject: { type: String, trim: true },
    message: { type: String, required: true, maxlength: 3000 },
    property: { type: Schema.Types.ObjectId, ref: "Property" },
    /** Who should see it: the listing's owner, or admin for general contact */
    recipient: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["new", "read", "closed"], default: "new" },
  },
  { timestamps: true },
);

export type IInquiry = InferSchemaType<typeof inquirySchema>;
export const Inquiry = model("Inquiry", inquirySchema);
