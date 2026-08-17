import { loadConfig } from "./config.mjs";
import { createAiNodeServer } from "./server.mjs";

const config = loadConfig();
const server = createAiNodeServer(config);

server.listen(config.port, config.host, () => {
  console.info(`SNN AI Node listening on http://${config.host}:${config.port}`);
});
