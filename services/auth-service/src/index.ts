import "dotenv/config";
import express from "express";
import cors from "cors";
import { signIn, signUp, googleLogin } from "./controllers/authController.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/v1/auth/signup", signUp);
app.post("/api/v1/auth/signin", signIn);
app.post("/api/v1/auth/google", googleLogin);
app.get("/api/health", (_req, res) => res.json({ service: "AuthService", ok: true }));

const port = Number(process.env.PORT ?? 8081);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`AuthService running on http://localhost:${port}`));
}

export default app;
