process.env.APP_ROLE = 'encoder';
process.env.PORT ||= '3001';
const { server } = await import('./server.mjs');
server.listen(Number(process.env.PORT), '127.0.0.1', () => console.log(`VeilDrop encoder: http://localhost:${process.env.PORT}`));
