'use strict';
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const {USERS, OWNERS} = require('./fixtures.cjs');

const PATH = '/__acceptance/fixture-health';
const ERROR = {error:'Fixture diagnostic unavailable'};
const USER_QUERY = `SELECT id,email,role,is_active,is_suspended,email_verified_at,verified_email,password_hash
  FROM public.users WHERE id = ANY($1::uuid[])`;
const OWNER_QUERY = `SELECT id,email,status,password_hash
  FROM public.business_users WHERE id = ANY($1::uuid[])`;
// Seed and password-change paths use cost 12. Bound work for malformed or altered rows.
const SUPPORTED_HASH = /^\$2[aby]\$(?:0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/;

// Acceptance launcher only: install after the existing outer gate.
function installFixtureHealth(app, config, pool) {
  app.all(PATH, (req, res, next) => {
    res.set('Cache-Control','private, no-store');
    if (req.method !== 'GET') return res.set('Allow','GET').status(405).json(ERROR);
    if (req.originalUrl.includes('?') || req.headers['transfer-encoding']
        || (req.headers['content-length'] && req.headers['content-length'] !== '0')) return res.status(400).json(ERROR);
    next();
  });
  app.get(PATH, rateLimit({windowMs:60*1000,max:3,keyGenerator:()=>'fixture-health',
    standardHeaders:false,legacyHeaders:false,handler:(req,res)=>res.status(429).json(ERROR)}), async (req, res) => {
    try {
      const [users, owners] = await Promise.all([
        pool.query({text:USER_QUERY,values:[USERS.map(user=>user.id)],query_timeout:1500}),
        pool.query({text:OWNER_QUERY,values:[OWNERS.map(owner=>owner.id)],query_timeout:1500})
      ]);
      const comparisons = new Map();
      async function credentialState(row) {
        const hashPresent = typeof row?.password_hash === 'string' && row.password_hash !== '';
        const hashUsable = hashPresent && SUPPORTED_HASH.test(row.password_hash);
        if (hashUsable && !comparisons.has(row.password_hash)) {
          comparisons.set(row.password_hash,bcrypt.compare(config.fixturePassword,row.password_hash));
        }
        return {hashPresent,hashUsable,configuredPasswordMatches:hashUsable ? await comparisons.get(row.password_hash) : false};
      }
      const userChecks = await Promise.all(USERS.map(async fixture => {
        const row = users.rows.find(user=>user.id===fixture.id);
        return {name:fixture.name,role:fixture.role,exists:!!row,
          emailMatches:typeof row?.email==='string' && row.email.toLowerCase()===fixture.email,
          roleMatches:row?.role===fixture.role,active:row?.is_active===true,suspended:row?.is_suspended===true,
          verified:!!row?.email_verified_at && typeof row?.email==='string'
            && typeof row?.verified_email==='string' && row.verified_email.toLowerCase()===row.email.toLowerCase(),
          ...await credentialState(row)};
      }));
      const ownerChecks = await Promise.all(OWNERS.map(async (fixture, index) => {
        const row = owners.rows.find(owner=>owner.id===fixture.id);
        return {name:['QA Owner','QA Pending Owner'][index],role:'business',exists:!!row,
          emailMatches:typeof row?.email==='string' && row.email.toLowerCase()===fixture.email,
          expectedStatus:fixture.status,statusMatches:row?.status===fixture.status,active:row?.status==='active',
          ...await credentialState(row)};
      }));
      res.json({fixtures:[...userChecks,...ownerChecks]});
    } catch {
      // Database and bcrypt errors can contain private row/configuration data.
      res.status(503).json(ERROR);
    }
  });
}

module.exports = {installFixtureHealth};
