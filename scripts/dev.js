const { spawn } = require('child_process');
const { createServer } = require('vite');
const electronPath = require('electron');

async function main() {
  // Start Vite dev server
  const vite = await createServer({
    configFile: './vite.config.ts',
    server: { port: 5173 },
  });
  await vite.listen();
  const url = `http://localhost:${vite.config.server.port}`;
  console.log(`Vite dev server running at ${url}`);

  // Compile electron TypeScript
  const tsc = spawn('npx', ['tsc', '-p', 'tsconfig.electron.json', '--watch'], {
    stdio: 'pipe',
    shell: true,
  });

  // Wait a bit for initial compile
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Start Electron
  const electron = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });

  electron.on('close', () => {
    tsc.kill();
    vite.close();
    process.exit();
  });
}

main().catch(console.error);
