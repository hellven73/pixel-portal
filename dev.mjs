import {createPortal} from './server.mjs';
const app=await createPortal();const port=Number(process.env.PORT)||4173;app.server.listen(port,'0.0.0.0',()=>console.log(`Pixel development server on ${port}`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
