import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

export const sendVerificationEmail = async (email, token) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const url = `${frontendUrl}/verify-email/${token}`;
    await transporter.sendMail({
        from: `"AI DeepFake Detector" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verifica tu cuenta — DeepFake Detector",
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#1e293b;">¡Bienvenido a DeepFake Detector!</h2>
                <p style="color:#475569;">Haz clic en el botón para verificar tu cuenta:</p>
                <a href="${url}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#407FC2;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Verificar cuenta</a>
                <p style="color:#94a3b8;font-size:12px;">Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p>
            </div>
        `,
    });
};

export const sendPasswordResetEmail = async (email, token) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const url = `${frontendUrl}/reset-password/${token}`;
    await transporter.sendMail({
        from: `"AI DeepFake Detector" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Restablece tu contraseña — DeepFake Detector",
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#1e293b;">Restablecer contraseña</h2>
                <p style="color:#475569;">Recibimos una solicitud para restablecer tu contraseña:</p>
                <a href="${url}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#407FC2;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Restablecer contraseña</a>
                <p style="color:#94a3b8;font-size:12px;">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este mensaje.</p>
            </div>
        `,
    });
};

export const sendSuggestionEmail = async (userEmail, message) => {
    await transporter.sendMail({
        from: `"AI DeepFake Detector" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: `Duda de usuario - ${userEmail}`,
        html: `
            <div style="font-family:sans-serif;max-width:540px;margin:auto;padding:32px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#1e293b;">Mensaje de usuario</h2>
                <p style="color:#475569;"><strong>Correo:</strong> ${userEmail}</p>
                <div style="margin:16px 0;padding:16px;background:#ffffff;border-left:4px solid #407FC2;border-radius:4px;color:#334155;">
                    ${message.replace(/\n/g, '<br/>')}
                </div>
                <p style="color:#94a3b8;font-size:12px;">Enviado desde la sección de Recomendaciones — DeepFake Detector</p>
            </div>
        `,
    });
};
