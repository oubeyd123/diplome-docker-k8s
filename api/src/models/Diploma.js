import mongoose from 'mongoose';

const diplomaSchema = new mongoose.Schema(
  {
    // SHA-256 of the PDF, 64 lowercase hex chars. Unique: one file = one diploma.
    hash: { type: String, required: true, unique: true, match: /^[0-9a-f]{64}$/ },
    nom: { type: String, required: true, trim: true, maxlength: 100 },
    prenom: { type: String, required: true, trim: true, maxlength: 100 },
    filiere: { type: String, required: true, trim: true, maxlength: 150 },
    annee: { type: Number, required: true, min: 1900, max: 2200 },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file
    issuedBy: { type: String, required: true },
    revoked: { type: Boolean, default: false },
    revokedAt: Date,
  },
  { timestamps: true }
);

export const Diploma = mongoose.model('Diploma', diplomaSchema);
