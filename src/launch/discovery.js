'use strict';
const H = require('./shared');
const {publicVenue,availableVenueSQL} = require('../services/venue-helpers');
const {visibleDiscoveryVenueSQL} = require('../services/venue-duplicate-discovery');
const {reviewedPriceSQL} = require('../services/venue-facts');
const NIGHTLIFE = ['bar','nightclub','lounge','cocktail_bar','brewery','beer_hall','dive_bar','rooftop_bar','pub','wine_bar','club','music'];
const ALIASES = {southie:'south boston',rooftops:'rooftop',cocktails:'cocktail',restaurants:'restaurant',bars:'bar'};
const CARD = `v.id,v.slug,v.name,v.type,v.category,v.cuisine,v.neighborhood,v.city,v.state,v.address,v.price_level,v.price_label,to_jsonb(v)->'field_provenance' AS field_provenance,
  NULL::numeric AS rating,NULL::integer AS review_count,'unverified'::text AS metrics_status,v.source,v.enriched_at,v.last_enriched_at,v.needs_manual_review,v.lat,v.lng,v.website,v.has_real_photo,v.reservation_url,v.opentable_url,v.resy_url,v.reservation_live,v.reservation_provider,
  v.trending,v.featured,v.spotlight,NULL::boolean AS is_open_now,
  CASE WHEN CASE WHEN jsonb_typeof(v.google_photo_names)='array' THEN jsonb_array_length(v.google_photo_names)>0 ELSE false END
    THEN '/api/photo?name=' || (v.google_photo_names->>0) || '&w=600'
    WHEN v.image_url IS NOT NULL AND v.image_url NOT ILIKE '%unsplash.com%' AND v.image_url NOT ILIKE '%pexels.com%' THEN v.image_url
    ELSE NULL END AS thumbnail_url`;
const DETAIL = CARD + `,v.zip_code,v.phone,v.description,v.short_desc,v.hours_json,v.hours_display,
  v.image_url,v.image_urls,v.cover_image_url,v.tags,v.features,v.vibe,v.vibe_tags,v.cover_charge,v.dress_code,
  v.google_maps_url,v.updated_at,v.is_claimed`;
const HAYSTACK = `concat_ws(' ',v.name,v.type,v.category,v.cuisine,v.neighborhood,v.city,v.state,v.address,v.description,v.vibe,v.vibe_tags::text,v.tags::text)`;
function build(query = {}, mode = 'all') {
  const values = [], conditions = [availableVenueSQL('v'), visibleDiscoveryVenueSQL('v')];
  const add = value => { values.push(value); return '$'+values.length; };
  const q = H.text(query.q ?? query.search, 'search', 160).toLowerCase();
  const rawTokens = q.split(/\s+/).filter(t => t && !['in','near','the','and','a','an','of'].includes(t));
  if (rawTokens.length > 12) throw new H.HttpError(400, 'Use at most 12 search words');
  for (const term of rawTokens) conditions.push(`${HAYSTACK} ILIKE ${add('%'+H.like(ALIASES[term] || term)+'%')}`);
  for (const [key,column] of [['city','v.city'],['cuisine','v.cuisine'],['vibe',"concat_ws(' ',v.vibe,v.vibe_tags::text,v.tags::text)"]]) {
    if (query[key] && query[key] !== 'all') conditions.push(`${column} ILIKE ${add('%'+H.like(H.text(query[key],key,80))+'%')}`);
  }
  if (query.neighborhood && query.neighborhood !== 'all') {
    let n = H.text(query.neighborhood,'neighborhood',80); if (n.toLowerCase()==='southie') n='South Boston';
    const place = add('%'+H.like(n)+'%');
    conditions.push(`(v.neighborhood ILIKE ${place} OR v.city ILIKE ${place})`);
  }
  if (query.type && query.type !== 'all') {
    const t = H.text(query.type,'category',60).toLowerCase();
    if (!/^[a-z_ -]+$/.test(t)) throw new H.HttpError(400,'Invalid category');
    conditions.push(`v.type = ${add(t)}`);
  }
  if (mode === 'nightlife') conditions.push(`v.type = ANY(${add(NIGHTLIFE)}::text[])`);
  // Tonight/featured are catalog suggestions, not proof of open hours or popularity.
  // Legacy seed flags must never determine public ranking or eligibility.
  if (query.price_level && query.price_level !== 'all') conditions.push(`${reviewedPriceSQL('v')} = ${add(H.integer(query.price_level,undefined,1,4,'price'))}`);
  if (query.bbox) {
    if (typeof query.bbox !== 'string') throw new H.HttpError(400,'Invalid map bounds');
    const b = query.bbox.split(',').map(s => s.trim() === '' ? NaN : Number(s));
    if (b.length!==4 || b.some(x=>!Number.isFinite(x)) || Math.abs(b[0])>90 || Math.abs(b[2])>90 || Math.abs(b[1])>180 || Math.abs(b[3])>180 || b[0]>b[2] || b[1]>b[3]) throw new H.HttpError(400,'Invalid map bounds');
    conditions.push(`v.lat BETWEEN ${add(b[0])} AND ${add(b[2])}`,`v.lng BETWEEN ${add(b[1])} AND ${add(b[3])}`);
  }
  if (mode==='map') conditions.push('v.lat BETWEEN -90 AND 90 AND v.lng BETWEEN -180 AND 180');
  const countValues = values.slice();
  const sort = query.sort || (q ? 'relevance' : 'name');
  if (!['relevance','name','rating'].includes(sort)) throw new H.HttpError(400,'Invalid sort');
  let order = '';
  if (q && sort==='relevance') {
    const exact = add(q), prefix = add(H.like(q)+'%');
    order = `CASE WHEN lower(v.name)=${exact} THEN 0 WHEN v.name ILIKE ${prefix} THEN 1 ELSE 2 END, `;
  }
  // Keep the legacy query accepted, but do not rank by unverified seed ratings.
  const sortApplied = sort==='rating' ? 'name' : sort;
  order += 'lower(v.name) ASC, v.id ASC';
  return {q,where:conditions.join(' AND '),values,countValues,order,sortApplied};
}
function install({router,pool,auth}) {
  const cached = res => res.setHeader('Cache-Control','public, max-age=30, s-maxage=30');
  async function browse(req,res,mode) {
    const f=build(req.query,mode), limit=H.integer(req.query.limit,mode==='featured'?6:24,1,mode==='map'?1000:100), offset=H.integer(req.query.offset,0,0,100000,'offset');
    const [counts,rows]=await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM venues v WHERE ${f.where}`,f.countValues),
      pool.query(`SELECT ${req.query.view==='detail'?DETAIL:CARD} FROM venues v WHERE ${f.where} ORDER BY ${f.order} LIMIT $${f.values.length+1} OFFSET $${f.values.length+2}`,[...f.values,limit,offset])
    ]);
    cached(res); const total=counts.rows[0].total;
    res.json({venues:rows.rows.map(publicVenue),total,limit,offset,has_more:offset+rows.rows.length<total,query:f.q,sort_applied:f.sortApplied,selection_basis:'catalog_not_live_availability',view:req.query.view==='detail'?'detail':'card'});
  }
  for (const [path,mode] of [['/venues','all'],['/venues/search','all'],['/venues/explore','all'],['/venues/map','map'],['/venues/nightlife','nightlife'],['/venues/tonight','tonight'],['/venues/featured','featured']]) router.get(path,H.wrap((q,s)=>browse(q,s,mode)));
  router.get('/venues/facets',H.wrap(async(req,res)=>{
    const r=await pool.query(`SELECT array_agg(DISTINCT neighborhood ORDER BY neighborhood) FILTER (WHERE COALESCE(neighborhood,'')<>'') AS neighborhoods,
      array_agg(DISTINCT type ORDER BY type) FILTER (WHERE COALESCE(type,'')<>'') AS types,
      array_agg(DISTINCT cuisine ORDER BY cuisine) FILTER (WHERE COALESCE(cuisine,'')<>'') AS cuisines FROM venues WHERE ${availableVenueSQL('')} AND ${visibleDiscoveryVenueSQL('venues')}`);
    cached(res);res.json(r.rows[0]);
  }));
  async function detail(req,res) {
    const value=H.text(req.params.slug || req.params.identifier,'venue',180,{required:true});
    const where=H.UUID.test(value)?'v.id=$1':'v.slug=$1';
    const r=await pool.query(`SELECT ${DETAIL} FROM venues v WHERE ${where} AND ${availableVenueSQL('v')} LIMIT 1`,[value]);
    if(!r.rows.length) throw new H.HttpError(404,'Venue not found'); cached(res);res.json(publicVenue(r.rows[0]));
  }
  router.get('/venues/slug/:slug',H.wrap(detail));
  router.get('/venues/:identifier',H.wrap(detail));
  router.get('/search/universal',auth.optionalAuth,H.noStore,H.wrap(async(req,res)=>{
    const q=H.text(req.query.q,'search',160),limit=H.integer(req.query.limit,6,1,20),me=req.user?.id||null;
    if(q.length<2) return res.json({venues:[],users:[],neighborhoods:[],categories:[]});
    const f=build({q}), pattern='%'+H.like(q)+'%';
    const [v,u,n,c]=await Promise.all([
      pool.query(`SELECT ${CARD} FROM venues v WHERE ${f.where} ORDER BY ${f.order} LIMIT $${f.values.length+1}`,[...f.values,limit]),
      require('./people').searchPeople(pool,me,q,limit).then(rows=>({rows})),
      pool.query(`SELECT DISTINCT neighborhood AS name FROM venues WHERE ${availableVenueSQL('')} AND ${visibleDiscoveryVenueSQL('venues')} AND neighborhood ILIKE $1 ORDER BY neighborhood LIMIT $2`,[pattern,limit]),
      pool.query(`SELECT DISTINCT type AS name FROM venues WHERE ${availableVenueSQL('')} AND ${visibleDiscoveryVenueSQL('venues')} AND type ILIKE $1 ORDER BY type LIMIT $2`,[pattern,limit])
    ]);
    res.json({query:q,venues:v.rows.map(publicVenue),users:u.rows,neighborhoods:n.rows,categories:c.rows});
  }));
}
module.exports={install,build,CARD,DETAIL,NIGHTLIFE};
