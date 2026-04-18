import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "deepfake_secret_2024";

export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: "Todos los campos son requeridos" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ success: false, error: "El email ya está registrado" });
        }

        const user = new User({ name, email, password });
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ success: false, error: "Error al registrar usuario" });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: "Email y contraseña requeridos" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, error: "Credenciales incorrectas" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: "Credenciales incorrectas" });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, error: "Error al iniciar sesión" });
    }
};

export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, error: "Usuario no encontrado" });
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error obteniendo usuario" });
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