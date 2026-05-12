import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendSuggestionEmail } from "../services/email.service.js";

const JWT_SECRET = process.env.JWT_SECRET;

const signToken = (user) =>
    jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "30d" }
    );

export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ success: false, error: "Todos los campos son requeridos" });

        const existingUser = await User.findOne({ email });
        if (existingUser)
            return res.status(409).json({ success: false, error: "El email ya está registrado" });

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const user = new User({
            name, email, password,
            emailVerificationToken: verificationToken,
            emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        await user.save();

        // Send verification email (non-blocking — don't fail registration if email fails)
        sendVerificationEmail(email, verificationToken).catch((err) =>
            console.error("Error sending verification email:", err.message)
        );

        const token = signToken(user);
        res.status(201).json({
            success: true,
            token,
            emailVerified: false,
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ success: false, error: "Error al registrar usuario" });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ success: false, error: "Email y contraseña requeridos" });

        const user = await User.findOne({ email });
        if (!user)
            return res.status(401).json({ success: false, error: "Credenciales incorrectas" });

        const isMatch = await user.comparePassword(password);
        if (!isMatch)
            return res.status(401).json({ success: false, error: "Credenciales incorrectas" });

        const token = signToken(user);
        res.json({
            success: true,
            token,
            emailVerified: user.emailVerified,
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, error: "Error al iniciar sesión" });
    }
};

export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password -emailVerificationToken -resetPasswordToken");
        if (!user)
            return res.status(404).json({ success: false, error: "Usuario no encontrado" });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error obteniendo usuario" });
    }
};

export const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: new Date() },
        });
        if (!user)
            return res.status(400).json({ success: false, error: "Token inválido o expirado" });

        user.emailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save();

        res.json({ success: true, message: "Email verificado correctamente" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error verificando email" });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email)
            return res.status(400).json({ success: false, error: "Email requerido" });

        const user = await User.findOne({ email });
        // Always respond OK to avoid email enumeration
        if (!user)
            return res.json({ success: true, message: "Si el email existe, recibirás un enlace de restablecimiento" });

        const resetToken = crypto.randomBytes(32).toString("hex");
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
        await user.save();

        sendPasswordResetEmail(email, resetToken).catch((err) =>
            console.error("Error sending reset email:", err.message)
        );

        res.json({ success: true, message: "Si el email existe, recibirás un enlace de restablecimiento" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error procesando solicitud" });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password)
            return res.status(400).json({ success: false, error: "Token y nueva contraseña requeridos" });
        if (password.length < 6)
            return res.status(400).json({ success: false, error: "La contraseña debe tener al menos 6 caracteres" });

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() },
        });
        if (!user)
            return res.status(400).json({ success: false, error: "Token inválido o expirado" });

        user.password = password;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ success: true, message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error restableciendo contraseña" });
    }
};

export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ success: false, error: "Contraseña actual y nueva requeridas" });
        if (newPassword.length < 6)
            return res.status(400).json({ success: false, error: "La nueva contraseña debe tener al menos 6 caracteres" });

        const user = await User.findById(req.userId);
        if (!user)
            return res.status(404).json({ success: false, error: "Usuario no encontrado" });

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch)
            return res.status(401).json({ success: false, error: "La contraseña actual es incorrecta" });

        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: "Contraseña cambiada correctamente" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error cambiando contraseña" });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name && !email)
            return res.status(400).json({ success: false, error: "Nada que actualizar" });

        const user = await User.findById(req.userId);
        if (!user)
            return res.status(404).json({ success: false, error: "Usuario no encontrado" });

        if (email && email !== user.email) {
            const existing = await User.findOne({ email, _id: { $ne: user._id } });
            if (existing)
                return res.status(409).json({ success: false, error: "El email ya está en uso" });

            user.email = email;
            user.emailVerified = false;
            const verificationToken = crypto.randomBytes(32).toString("hex");
            user.emailVerificationToken = verificationToken;
            user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            sendVerificationEmail(email, verificationToken).catch((err) =>
                console.error("Error sending verification email:", err.message)
            );
        }

        if (name) user.name = name;
        await user.save();

        res.json({
            success: true,
            message: "Perfil actualizado",
            user: { id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
        });
    } catch (err) {
        console.error("updateProfile error:", err);
        res.status(500).json({ success: false, error: "Error actualizando perfil" });
    }
};

export const resendVerification = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user)
            return res.status(404).json({ success: false, error: "Usuario no encontrado" });
        if (user.emailVerified)
            return res.json({ success: true, message: "El email ya está verificado" });

        const verificationToken = crypto.randomBytes(32).toString("hex");
        user.emailVerificationToken = verificationToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        sendVerificationEmail(user.email, verificationToken).catch((err) =>
            console.error("Error sending verification email:", err.message)
        );

        res.json({ success: true, message: "Email de verificación reenviado" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error reenviando verificación" });
    }
};

export const sendSuggestion = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.trim().length < 10)
            return res.status(400).json({ success: false, error: "El mensaje debe tener al menos 10 caracteres" });

        const user = await User.findById(req.userId).select("email");
        if (!user)
            return res.status(404).json({ success: false, error: "Usuario no encontrado" });

        await sendSuggestionEmail(user.email, message.trim());
        res.json({ success: true, message: "Mensaje enviado correctamente" });
    } catch (err) {
        console.error("sendSuggestion error:", err);
        res.status(500).json({ success: false, error: "Error enviando mensaje" });
    }
};

export const getFaciaToken = async (req, res) => {
    try {
        const axios = (await import("axios")).default;
        const { client_id, client_secret } = req.body;
        const formData = new URLSearchParams();
        formData.append("client_id", client_id);
        formData.append("client_secret", client_secret);
        const response = await axios.post("https://api.facia.ai/request-access-token", formData);
        const token = response.data?.result?.data?.token;
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Error generating token" });
    }
};