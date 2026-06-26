import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["usuario", "admin"], default: "usuario" },
    createdAt: { type: Date, default: Date.now },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null },
    emailVerificationExpires: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // ── Gamificación: racha diaria ──────────────────────────────
    streak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    // lastAnalysisDate: SOLO se actualiza cuando el usuario completa un análisis.
    // Nunca se toca en login ni checkin manual. Es la fuente de verdad para la racha.
    lastAnalysisDate: { type: Date, default: null },
    totalAnalyses: { type: Number, default: 0 },
});

UserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", UserSchema);
