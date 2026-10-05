// Entry point: listen on 0.0.0.0:$PORT (default 8080), §3.1.
import { createServer } from './server.js';

const port = Number(process.env.PORT || 8080);
const server = createServer();
server.listen(port, '0.0.0.0', () => console.log(`pocketful listening on 0.0.0.0:${port}`));

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
