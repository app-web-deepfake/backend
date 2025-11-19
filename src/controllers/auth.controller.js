import axios from "axios";

export const getFaciaToken = async (req, res) => {
    try {
        const { client_id, client_secret } = req.body;

        const formData = new URLSearchParams();
        formData.append("client_id", client_id);
        formData.append("client_secret", client_secret);

        const response = await axios.post(
            "https://api.facia.ai/request-access-token",
            formData
        );

        const token = response.data?.result?.data?.token;

        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Error generating token" });
    }
};
