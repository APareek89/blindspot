import { Hono } from 'hono';
import { createPreparedExample } from '@blindspot/core';
import { rateLimit,requireExecution } from '@blindspot/db';
import type { Env } from '../types';
export const examplesRouter=new Hono<Env>();
examplesRouter.post('/examples',async c=>{
 try{const actor=requireExecution();await rateLimit(`owner:${actor.ownerId}:example`,10,3600);return c.json(await createPreparedExample());}
 catch{return c.json({error:{message:'The prepared example could not be completed. Please try again shortly.'}},503);}
});
