import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { query } from './db.js';
import { session,HttpError,rateLimit,fail } from './security.js';
import { authRoutes } from './auth-routes.js';
import { tutorRoutes } from './tutor-routes.js';
import { bookingRoutes } from './booking-routes.js';
import { messageRoutes } from './message-routes.js';

export function createApp() {
  const app=express();
  const production=process.env.NODE_ENV==='production';
  const origin=process.env.APP_ORIGIN || (production ? '' : 'http://127.0.0.1:5173');
  if(production&&!origin.startsWith('https://')) throw new Error('Set APP_ORIGIN to the production HTTPS URL.');
  const allowedOrigins=new Set([origin,...(!production?['http://localhost:5173','http://127.0.0.1:5173','http://127.0.0.1:3001','http://localhost:3001']:[])]);
  app.disable('x-powered-by');
  if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],imgSrc:["'self'",'data:','https://images.unsplash.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:production?[]:null}},strictTransportSecurity:production?undefined:false}));
  app.use(express.json({limit:'24kb'}));
  app.use('/api',(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const requestOrigin=req.get('Origin');
      if((requestOrigin&&!allowedOrigins.has(requestOrigin))||req.get('Sec-Fetch-Site')==='cross-site') fail(403,'Request origin is not allowed.');
      const hasBody=Number(req.get('Content-Length'))>0 || Boolean(req.get('Transfer-Encoding'));
      if(hasBody&&req.get('Content-Type')?.split(';')[0]!=='application/json') fail(415,'Send JSON for this request.');
    }
    next();
  });
  app.get('/api/health',async(_req,res)=>{
    await query('SELECT 1 FROM verbal.schema_migrations LIMIT 1');
    res.json({status:'ok',database:'connected'});
  });
  app.use('/api',rateLimit('api',1000),session,authRoutes,tutorRoutes);
  // Keep authenticated catch-all router middleware scoped to its own paths.
  app.use('/api', (req,res,next)=>{
    if(req.path.startsWith('/bookings')) return bookingRoutes(req,res,next);
    if(req.path==='/messages'||req.path==='/conversations') return messageRoutes(req,res,next);
    next();
  });
  app.use('/api',(_req,_res)=>fail(404,'API endpoint not found.'));
  const dist=fileURLToPath(new URL('../dist/',import.meta.url));
  if(existsSync(path.join(dist,'index.html'))) {
    app.use(express.static(dist,{maxAge:production?'1h':0,index:false}));
    app.get('/{*splat}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
  }
  app.use((err,_req,res,_next)=>{
    if(err instanceof HttpError) return res.status(err.status).json({error:err.message});
    if(err.type==='entity.parse.failed') return res.status(400).json({error:'Request body must be valid JSON.'});
    if(err.type==='entity.too.large') return res.status(413).json({error:'Request is too large.'});
    if(err.code==='23505') return res.status(409).json({error:'This record already exists or this time was just booked. Please refresh and try again.'});
    if(err.code==='23503') return res.status(409).json({error:'A related record has changed. Please refresh and try again.'});
    console.error('Request failed',{code:err.code||'INTERNAL_ERROR'});
    res.status(500).json({error:'Something went wrong. Please try again.'});
  });
  return app;
}
