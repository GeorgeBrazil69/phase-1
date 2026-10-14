process.env.APP_ROLE = 'decoder';
process.env.PORT ||= '3002';
process.env.BROKER_ORIGIN ||= 'http://127.0.0.1:3001';
const { server } = await import('./server.mjs');
server.listen(Number(process.env.PORT), '127.0.0.1', () => console.log(`VeilDrop decoder: http://localhost:${process.env.PORT}`));
