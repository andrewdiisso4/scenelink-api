'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {venueTypeSQL,exclusionSQL}=require('../src/services/concierge-query-constraints');

const fixtures=[
  ['category-hyphen','bar','cocktail-bar'],
  ['category-underscore','bar','cocktail_bar'],
  ['category-space','bar','cocktail bar'],
  ['category-case-space','bar','  Cocktail-Bar  '],
  ['type-hyphen','cocktail-bar',null],
  ['type-underscore','cocktail_bar',''],
  ['type-space','cocktail bar','bar'],
  ['generic-bar','bar','bar'],
  ['pub','bar','pub'],
  ['brewery','bar','brewery'],
  ['unknown-null',null,null],
  ['unknown-blank','  ',' '],
  ['known-restaurant','restaurant',null],
  ['known-category',null,'restaurant'],
  ['known-cafe','cafe','coffee shop']
];
async function withCatalog(run){
  const db=await PGlite.create();
  try{
    await db.exec('CREATE TABLE venues(name text PRIMARY KEY,type text,category text)');
    for(const row of fixtures)await db.query('INSERT INTO venues(name,type,category) VALUES($1,$2,$3)',row);
    await run(db);
  }finally{await db.close();}
}

test('real SQL normalizes cocktail-bar category and type aliases while preserving strict exclusions',async()=>{
  await withCatalog(async db=>{
    const {rows}=await db.query('SELECT name FROM venues WHERE '+venueTypeSQL('cocktail_bar')+' ORDER BY name');
    assert.deepEqual(rows.map(row=>row.name),[
      'category-case-space','category-hyphen','category-space','category-underscore','generic-bar',
      'type-hyphen','type-space','type-underscore'
    ]);
    assert(!rows.some(row=>['pub','brewery','unknown-null','unknown-blank'].includes(row.name)));
  });
});

test('real SQL excludes unknown venue types without rejecting known non-bar categories',async()=>{
  await withCatalog(async db=>{
    const clause=exclusionSQL({excludedVenueTypes:['bar']},1);
    const {rows}=await db.query('SELECT name FROM venues WHERE '+clause.conditions.join(' AND ')+' ORDER BY name',clause.values);
    assert.deepEqual(rows.map(row=>row.name),['known-cafe','known-category','known-restaurant']);
    assert(!rows.some(row=>['unknown-null','unknown-blank'].includes(row.name)));
  });
});
