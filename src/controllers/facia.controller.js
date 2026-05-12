import axios from "axios";

export const createLiveness = async (req, res) => {
    try {
        const { fileUrl, token } = req.body;

        const body = {
            type: "liveness",
            file: fileUrl,
            detect_deepfake: 1,
            offsite_liveness: 1,
            file_type: fileUrl.endsWith(".mp4") ? "video" : undefined
        };

        const response = await axios.post(
            "https://api.facia.ai/liveness",
            body,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json(response.data);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Error creating liveness transaction" });
    }
};

export const getLivenessResult = async (req, res) => {
    try {
        const { reference_id, token } = req.body;

        const response = await axios.post(
            "https://api.facia.ai/result",
            { reference_id },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json(response.data);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Error retrieving result" });
    }
};
