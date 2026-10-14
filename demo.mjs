import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const env = { ...process.env, BROKER_SECRET: randomBytes(32).toString('hex'), PUBLIC_ORIGINS: 'http://localhost:3001,http://localhost:3002' };
const children = [spawn(process.execPath, ['encoder.mjs'], { cwd: new URL('.', import.meta.url), env: { ...env, PORT: '3001' }, stdio: 'inherit' }), spawn(process.execPath, ['decoder.mjs'], { cwd: new URL('.', import.meta.url), env: { ...env, PORT: '3002' }, stdio: 'inherit' })];
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => { child.on('error', () => { console.error('Unable to start the preview.'); process.exitCode = 1; stop(); }); child.on('exit', (code, signal) => { if (!stopping) { process.exitCode = code || (signal ? 1 : 0); stop(); } }); });
