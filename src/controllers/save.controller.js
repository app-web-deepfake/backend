import Upload from "../models/Upload.js";

export const saveFileData = async (req, res) => {
    try {
        const { fileUrl, fileType } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ error: "fileUrl requerido" });
        }

        const saved = await Upload.create({ fileUrl, fileType });

        res.json({
            message: "Guardado correctamente",
            data: saved
        });
    } catch (error) {
        console.log("❌ Error guardando archivo", error);
        res.status(500).json({ error: "Error guardando archivo" });
    }
};
