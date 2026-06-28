from pathlib import Path

files = []
root = Path('services/auth-service')
files.append((root / 'src' / 'index.ts',
'import "dotenv/config";\nimport express from "express";\nimport cors from "cors";\nimport { signIn, signUp } from "./controllers/authController.ts";\nimport { signIn, signUp, googleLogin } from "./controllers/authController.ts";\n\nconst app = express();',
'import "dotenv/config";\nimport express from "express";\nimport cors from "cors";\nimport { signIn, signUp, googleLogin } from "./controllers/authController.ts";\n\nconst app = express();'))
files.append((root / 'src' / 'controllers' / 'authController.ts',
'        const isPasswordCorrect = await bcrypt.compare(password, user.password);\n\n        if (!isPasswordCorrect) {\n            return res.status(401).json({ error: "Invalid credentials" });\n        }\n',
'        const isPasswordCorrect = user.password\n          ? await bcrypt.compare(password, user.password)\n          : false;\n\n        if (!isPasswordCorrect) {\n            return res.status(401).json({ error: "Invalid credentials" });\n        }\n'))
role_patch = 'export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {\n  console.log("requireAdmin sees userRole =", JSON.stringify(req.userRole));\n  if ((req.userRole || "").trim().toUpperCase() !== "ADMIN") {\n    return res.status(403).json({ error: "Forbidden: admin role required" });\n  }\n  next();\n};\n'
role_replace = 'export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {\n  console.log("requireAdmin sees userRole =", JSON.stringify(req.userRole));\n  const role = (req.userRole || "").trim();\n  if (!["PROVIDER_ADMIN", "PLATFORM_OPERATOR"].includes(role)) {\n    return res.status(403).json({ error: "Forbidden: provider or operator role required" });\n  }\n  next();\n};\n'
for svc in ['user-service','billing-service','charger-service','session-service','vehicle-service','reservation-service']:
    files.append((Path(svc) / 'src' / 'middleware' / 'verifyToken.ts', role_patch, role_replace))
for path, old, new in files:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise ValueError(f'Old text not found in {p}')
    p.write_text(text.replace(old, new), encoding='utf-8')
print('Patched files successfully')
