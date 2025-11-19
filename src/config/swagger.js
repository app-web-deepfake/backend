import fs from "fs";
import path from "path";
import yaml from "yaml";

const file = fs.readFileSync(path.join(process.cwd(), "src/docs/openapi.yaml"), "utf8");
const swaggerSpec = yaml.parse(file);

export default swaggerSpec;
