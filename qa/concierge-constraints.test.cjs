'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractConstraints,explicitVenueType,inferVenueType,parseNeighborhoods,isEventRequest}=require('../src/services/concierge-constraints');

test('a quoted exclusion cannot become a positive named-venue lookup',()=>{
  const result=extractConstraints('Find restaurants except "Aster Kitchen" in Seaport');
  assert.equal(result.clarification,null);assert.deepEqual(result.excludedVenueNames,['Aster Kitchen']);
  assert(!result.positiveText.includes('Aster Kitchen'));assert(!result.positiveText.includes('except'));
  assert.equal(explicitVenueType(result.positiveText),'restaurant');assert.deepEqual(parseNeighborhoods(result.positiveText),['Seaport']);
});
test('negative cuisines, types and locations retain the positive request',()=>{
  const cuisine=extractConstraints('No Italian; find restaurants in Seaport');
  assert.equal(cuisine.clarification,null);assert.deepEqual(cuisine.excludedCuisines,['italian']);
  assert(!/italian/i.test(cuisine.positiveText));assert.equal(explicitVenueType(cuisine.positiveText),'restaurant');
  const type=extractConstraints('Find restaurants, not bars, in Seaport');
  assert.equal(type.clarification,null);assert.deepEqual(type.excludedVenueTypes,['bar']);assert.equal(explicitVenueType(type.positiveText),'restaurant');
  assert.deepEqual(type.excludedNeighborhoods,[]);assert.deepEqual(parseNeighborhoods(type.positiveText),['Seaport']);
  const area=extractConstraints('Find restaurants in Seaport, not Back Bay');
  assert.equal(area.clarification,null);assert.deepEqual(area.excludedNeighborhoods,['Back Bay']);assert.deepEqual(parseNeighborhoods(area.positiveText),['Seaport']);
});
test('explicit negation markers support exact identities and catalog categories',()=>{
  const cases=[
    ['Avoid Italian; find restaurants',['italian'],[],[],[]],
    ['Find restaurants without bars',[],[],['bar'],[]],
    ['Find restaurants except for “Aster Kitchen”',[],[],[],['Aster Kitchen']],
    ["Don't recommend bars; find restaurants",[],[],['bar'],[]],
    ['Do not show me pubs, breweries or wineries; find restaurants',[],[],['pub','brewery','winery'],[]],
    ['Find restaurants, not in Eastie',[],['East Boston'],[],[]],
    ['Find restaurants excluding the venue called "Aster Kitchen"',[],[],[],['Aster Kitchen']],
    ['Find restaurants, no cocktail bars or music venues',[],[],['cocktail_bar','music'],[]],
    ['Find restaurants, not a café',[],[],['cafe'],[]]
  ];
  for(const [message,cuisines,areas,types,names]of cases){const r=extractConstraints(message);
    assert.equal(r.clarification,null,message);assert.deepEqual(r.excludedCuisines,cuisines,message);
    assert.deepEqual(r.excludedNeighborhoods,areas,message);assert.deepEqual(r.excludedVenueTypes,types,message);assert.deepEqual(r.excludedVenueNames,names,message);}
});
test('coordinated exclusions preserve later positive clauses and deduplicate aliases',()=>{
  const result=extractConstraints('No Italian, Thai or Japanese; find restaurants in Seaport, not Southie or South Boston');
  assert.equal(result.clarification,null);assert.deepEqual(result.excludedCuisines,['italian','thai','japanese']);
  assert.deepEqual(result.excludedNeighborhoods,['South Boston']);assert.deepEqual(parseNeighborhoods(result.positiveText),['Seaport']);
  const mixed=extractConstraints('Avoid "Aster Kitchen" and "Birch Bar", but find restaurants in Back Bay');
  assert.equal(mixed.clarification,null);assert.deepEqual(mixed.excludedVenueNames,['Aster Kitchen','Birch Bar']);
  assert.deepEqual(parseNeighborhoods(mixed.positiveText),['Back Bay']);assert.equal(explicitVenueType(mixed.positiveText),'restaurant');
});
test('unsupported or ambiguous negative facts require clarification',()=>{
  for(const message of ['Find a restaurant, not loud','Find restaurants without nuts','Find restaurants with no queues',
    'Find restaurants except Aster Kitchen','Find restaurants except the bar called Aster Kitchen',
    'No bars or crowded places','Find a cafe without a reservation','No Italian and expensive places',
    'Find restaurants except ""','Not without Italian']){
    assert.equal(typeof extractConstraints(message).clarification,'string',message);
  }
});
test('unsupported negative constructions clarify instead of becoming positive or dietary claims',()=>{
  for(const message of ["Find restaurants in Seaport, but I can't eat Italian",'I cannot eat seafood',
    'I can not eat Italian','Find anything but Italian','Find Thai rather than Italian','Find bars instead of restaurants']){
    const result=extractConstraints(message);assert.equal(typeof result.clarification,'string',message);
    assert.deepEqual(result.excludedCuisines,[],message);assert.deepEqual(result.excludedVenueTypes,[],message);
  }
  for(const message of ['Show me "Can’t Stop Cafe"','Tell me about "Anything But Ordinary"',
    'Look up Rather Than Restaurant','Find the bar called Instead Of Bar']){
    const result=extractConstraints(message);assert.equal(result.clarification,null,message);assert.equal(result.positiveText,message);
  }
});
test('positive quoted names keep negation, cuisine, category and meaningful spaces',()=>{
  for(const message of ['Tell me about "No  Italian Restaurant"','Show me “Not Your Average Bar”',
    '"Avoid Italian Kitchen"','Find the restaurant named "No Name Restaurant"']){
    const result=extractConstraints(message);assert.equal(result.positiveText,message);assert.equal(result.clarification,null);
    assert.deepEqual([result.excludedCuisines,result.excludedNeighborhoods,result.excludedVenueTypes,result.excludedVenueNames],[[],[],[],[]]);
    assert.equal(explicitVenueType(message),null,message);
  }
});
test('positive explicit bare-name commands protect their identity words',()=>{
  for(const message of ['Tell me about No Name Restaurant',"Look up Not Your Average Joe's",'Find the bar called No Name Bar']){
    const r=extractConstraints(message);assert.equal(r.positiveText,message);assert.equal(r.clarification,null);assert.equal(explicitVenueType(message),null);
  }
  const constrained=extractConstraints('Tell me about No Name Restaurant, except "Other Venue"');
  assert.equal(constrained.clarification,null);assert(constrained.positiveText.includes('No Name Restaurant'));
  assert.deepEqual(constrained.excludedVenueNames,['Other Venue']);
});
test('word boundaries avoid substrings and discourse additions are not exclusions',()=>{
  for(const message of ['Find a barbershop in Boston','Avoidance Kitchen','Noble Restaurant','Nottingham Cafe','Noé Cafe']){
    const r=extractConstraints(message);assert.equal(r.clarification,null);assert.deepEqual(r.excludedVenueTypes,[]);assert.deepEqual(r.excludedCuisines,[]);
  }
  const addition=extractConstraints('Not only restaurants but also bars in Seaport');
  assert.equal(addition.positiveText,'Not only restaurants but also bars in Seaport');assert.equal(addition.clarification,null);assert.equal(explicitVenueType(addition.positiveText),null);
  const correction=extractConstraints('No, Italian restaurants instead');
  assert.deepEqual(correction.excludedCuisines,[]);assert.equal(correction.clarification,null);assert.equal(explicitVenueType(correction.positiveText),'restaurant');
});
test('exclusion bounds fail closed without oversized arrays or truncated request meaning',()=>{
  const many='Avoid '+Array.from({length:13},(_,i)=>'"Venue '+i+'"').join(', ');
  const result=extractConstraints(many);assert.equal(typeof result.clarification,'string');assert.equal(result.excludedVenueNames.length,12);
  const long=extractConstraints('x'.repeat(501));assert.equal(typeof long.clarification,'string');assert.equal(long.positiveText,'');
  assert.equal(typeof extractConstraints({message:'no Italian'}).clarification,'string');
});
test('shared explicit types recognize singular/plural and preserve mixed/generic routes',()=>{
  for(const message of ['Find a restaurant in Boston','Find restaurants in Boston','Show me restaurants'])assert.equal(explicitVenueType(message),'restaurant',message);
  for(const message of ['Show me cocktail bars in Boston','Find a cocktail-bar','Show us a cocktail bar'])assert.equal(explicitVenueType(message),'cocktail_bar',message);
  for(const message of ['Find me a place in Boston','Find restaurants or bars','Plan dinner then cocktail bars',
    'Find Italian restaurants then cocktail bars','Show me concerts at restaurants','Find cocktail bars or breweries','Find a restaurant and cafe'])assert.equal(explicitVenueType(message),null,message);
  assert.equal(explicitVenueType('Find restaurants, not bars'),'restaurant');
});
test('imperative show-place requests remain distinct from event nouns',()=>{
  for(const message of ['Show restaurants','Show cocktail bars instead','Show me cocktail bars','Please show a restaurant',
    'Can you show restaurants in Seaport','Show "The Show Bar"','Tell me about Show Bar'])assert.equal(isEventRequest(message),false,message);
  assert.equal(explicitVenueType('Show restaurants'),'restaurant');
  assert.equal(explicitVenueType('Show cocktail bars instead'),'cocktail_bar');
  for(const message of ['Find a show tonight','Shows in Cambridge','Show tonight','Show in Cambridge','Show me a show tonight',
    'Show events tonight','Concerts in Seaport','Live music tonight'])assert.equal(isEventRequest(message),true,message);
});
test('shared ordinary type inference keeps single classes and leaves mixed classes broad',()=>{
  const cases=[['Find bars','bar'],['Find a pub','bar'],['Drinks in Seaport','bar'],['Show cocktail bars instead','cocktail_bar'],
    ['Find dinner in Back Bay','restaurant'],['Lunch in Seaport','restaurant'],['Brunch','restaurant'],['Food in Boston','restaurant'],
    ['Find cafes','cafe'],['Find a café','cafe'],['Coffee in Cambridge','cafe'],['Espresso','cafe'],
    ['Find clubs','nightlife'],['Show nightclubs','nightlife'],['Dancing','nightlife'],['Nightlife in Seaport','nightlife']];
  for(const [message,expected]of cases)assert.equal(inferVenueType(message),expected,message);
  for(const message of ['Find restaurants or bars','Dinner then drinks','Find cafes or nightclubs','Coffee and dinner',
    'Show me "Coffee Bar"','Tell me about Dinner Club','Find the restaurant named No Name Restaurant',
    'Find a show tonight','Find restaurants for a concert'])assert.equal(inferVenueType(message),null,message);
  assert.equal(inferVenueType('Find restaurants, not bars, in Seaport'),'restaurant');
});
test('both parsers can share location aliases without losing Chinatown identity',()=>{
  const cases=[['restaurants in Southie',['South Boston']],['restaurants in Eastie',['East Boston']],
    ['restaurants near Harvard Square',['Cambridge']],['restaurants near Kendall Square',['Cambridge']],
    ['cafes near Central Square',['Cambridge']],['bars in Davis Square',['Somerville']],
    ['restaurants in Union Square',['Somerville']],['restaurants in Chinatown',['Chinatown']],
    ['restaurants in the Theater District',['Downtown']],['restaurants in Fort Point',['Fort Point']],
    ['restaurants in Quincy',['Quincy']],['restaurants near Quincy Market',[]],['restaurants in Bostonian',[]]];
  for(const [message,expected]of cases)assert.deepEqual(parseNeighborhoods(message),expected,message);
});
test('generic Boston does not broaden a specific location except an explicit alternative',()=>{
  assert.deepEqual(parseNeighborhoods('Find restaurants in Back Bay, Boston'),['Back Bay']);
  assert.deepEqual(parseNeighborhoods('Find restaurants in South Boston'),['South Boston']);
  assert.deepEqual(parseNeighborhoods('Find restaurants in Boston Seaport'),['Seaport']);
  assert.deepEqual(parseNeighborhoods('Find restaurants in Back Bay or Boston'),['Back Bay','Boston']);
  assert.deepEqual(parseNeighborhoods('Find restaurants in Boston or Back Bay'),['Boston','Back Bay']);
  assert.deepEqual(parseNeighborhoods('Show me "North End Cafe" in Seaport'),['Seaport']);
  assert.deepEqual(parseNeighborhoods('Tell me about North End Cafe'),[]);
});
