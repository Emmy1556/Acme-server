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
    /** Which plot size the enquiry is about — a snapshot, so later price edits don't rewrite history. */
    plot: {
      type: new Schema({ size: Number, price: Number, paymentPlan: String }, { _id: false }),
      default: undefined,
    },
    /**
     * Unused today: every enquiry goes to Acme's admin inbox so deals can't be
     * arranged with an agent directly. Kept for a future "assigned to" feature.
     */
    recipient: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["new", "read", "closed"], default: "new" },
  },
  { timestamps: true },
);

export type IInquiry = InferSchemaType<typeof inquirySchema>;
export const Inquiry = model("Inquiry", inquirySchema);
