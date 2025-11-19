import mongoose from "mongoose";
import {MONGO_URI} from "./env.js";

export const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ MongoDB conectado");
    } catch (error) {
        console.error("❌ Error conectando a MongoDB", error);
        process.exit(1);
    }
};
