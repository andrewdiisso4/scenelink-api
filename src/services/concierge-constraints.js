'use strict';

// Bounded, deterministic request constraints shared by the catalog and AI paths.
// This is category/identity filtering, never proof of ingredients, noise, hours,
// accessibility or availability. Unknown negative facts require clarification.
const MAX_MESSAGE=500,MAX_EXCLUSIONS=12;
const LOCATION_ALIASES={
  'south boston':'South Boston',southie:'South Boston','east boston':'East Boston',eastie:'East Boston',
  'kendall square':'Cambridge','harvard square':'Cambridge','central square':'Cambridge',
  'davis square':'Somerville','union square':'Somerville','theater district':'Downtown',
  'theatre district':'Downtown','financial district':'Downtown'
};
const LOCATIONS=['Allston','Back Bay','Beacon Hill','Boston','Brookline','Cambridge','Dorchester','Downtown',
  'Fenway','Jamaica Plain','North End','Seaport','Somerville','South End','Fort Point','South Boston',
  'Chinatown','West End','East Boston','Charlestown','Roslindale','Brighton','Hyde Park','Mission Hill',
  'Roxbury','Mattapan','Quincy'];
for(const name of LOCATIONS)LOCATION_ALIASES[name.toLowerCase()]=name;
const CUISINES=['italian','japanese','mexican','chinese','thai','indian','french','mediterranean','greek',
  'lebanese','seafood','steakhouse','american','vietnamese','korean','spanish','southern','vegan','vegetarian'];
const TYPE_TERMS=[
  ['cocktail[-\\s]+bars?','cocktail_bar'],['cocktail[-\\s]+lounges?','cocktail_bar'],['speakeas(?:y|ies)','cocktail_bar'],
  ['restaurants?','restaurant'],['bars?','bar'],['pubs?','pub'],['brewer(?:y|ies)','brewery'],['winer(?:y|ies)','winery'],
  ['caf[eé]s?','cafe'],['coffee\\s+shops?','cafe'],['nightclubs?','club'],['clubs?','club'],['lounges?','lounge'],
  ['music\\s+venues?','music']
];
const NEGATIVE=/\b(?:except(?:\s+for)?|excluding|exclude|avoid|without|do\s+not|don['’]t|no|not)\b/gi;
const NAMED_COMMAND=/^(?:please\s+)?(?:(?:tell\s+me\s+about|look\s+up|lookup)\s+|(?:find|show\s+me)\s+(?:(?:the|a|an)\s+)?(?:venue|restaurant|bar|caf[eé])\s+(?:named|called)\s+)/i;
const literal=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
const wordChar=value=>/[\p{L}\p{N}_]/u.test(value||'');
const locationTerms=Object.entries(LOCATION_ALIASES).sort((a,b)=>b[0].length-a[0].length);

function quotes(text){
  const spans=[];const re=/"([^"\r\n]*)"|“([^”\r\n]*)”/g;let match;
  while((match=re.exec(text)))spans.push({start:match.index,end:re.lastIndex,value:(match[1]??match[2]).trim()});
  return spans;
}
function protectedRanges(text){
  const spans=quotes(text),named=text.match(NAMED_COMMAND);
  if(named){
    const start=named[0].length,tail=text.slice(start);
    // Bare names such as No Name Restaurant and Not Your Average Joe's must
    // retain their words. An explicit delimited exclusion remains parseable.
    const boundary=tail.search(/[,;]|\s+(?:except|excluding|avoid|without|but\s+not)\b/i);
    spans.push({start,end:boundary<0?text.length:start+boundary});
  }
  return spans;
}
function mask(text,spans){
  const chars=text.split('');for(const span of spans)for(let i=span.start;i<span.end;i++)chars[i]=' ';
  return chars.join('');
}
function locationAt(text,index){
  for(const [phrase,name]of locationTerms){
    const match=text.slice(index).match(new RegExp('^'+literal(phrase),'i'));
    if(match){
      if(wordChar(text[index+match[0].length]))continue;
      if(name==='Quincy'&&/^\s+market\b/i.test(text.slice(index+match[0].length)))continue;
      return {kind:'excludedNeighborhoods',value:name,end:index+match[0].length};
    }
  }
  return null;
}
function parseNeighborhoods(message){
  if(typeof message!=='string'||message.length>MAX_MESSAGE)return [];
  const text=mask(message,protectedRanges(message)),found=[];
  for(let i=0;i<text.length;i++){
    if(i&&/[\p{L}\p{N}_]/u.test(text[i-1]))continue;
    const match=locationAt(text,i);if(!match)continue;
    if(!found.includes(match.value))found.push(match.value);i=match.end-1;
  }
  const explicitBostonAlternative=/\bor\s+boston\b|\bboston\s*,?\s+or\b/i.test(text);
  return found.length>1&&!explicitBostonAlternative?found.filter(name=>name!=='Boston'):found;
}
function skipSpace(text,index){while(/\s/.test(text[index]||'')&&index<text.length)index++;return index;}
function knownAt(text,index,quoteSpans){
  const quoted=quoteSpans.find(span=>span.start===index);
  if(quoted){
    if(!quoted.value||quoted.value.length>255)return null;
    return {kind:'excludedVenueNames',value:quoted.value,end:quoted.end};
  }
  const location=locationAt(text,index);if(location)return location;
  for(const [pattern,value]of TYPE_TERMS){
    const match=text.slice(index).match(new RegExp('^(?:'+pattern+')','i'));
    if(match&&!wordChar(text[index+match[0].length]))return {kind:'excludedVenueTypes',value,end:index+match[0].length};
  }
  for(const value of CUISINES){
    const match=text.slice(index).match(new RegExp('^'+literal(value),'i'));
    if(match&&!wordChar(text[index+match[0].length]))return {kind:'excludedCuisines',value,end:index+match[0].length};
  }
  return null;
}
function skipPrefix(text,index){
  index=skipSpace(text,index);
  const named=text.slice(index).match(/^(?:(?:the|a|an)\s+)?(?:venues?|restaurants?|bars?|caf[eé]s?)\s+(?:named|called)\s+/i);
  if(named)return {index:index+named[0].length,named:true};
  const prefix=text.slice(index).match(/^(?:(?:in|near|around|at|any|a|an|the|want|include|including|recommend|suggest|show|me|us|please)\b\s*)*/i);
  return {index:index+(prefix?.[0].length||0),named:false};
}
function clarification(){
  return 'I can exclude catalog cuisines, venue types, neighborhoods, or exact venue names in double quotes. Please clarify the exclusion; I cannot verify conditions such as ingredients, noise, or availability.';
}
function extractConstraints(message){
  const result={positiveText:typeof message==='string'?message:'',excludedCuisines:[],excludedNeighborhoods:[],
    excludedVenueTypes:[],excludedVenueNames:[],clarification:null};
  if(typeof message!=='string'||message.length>MAX_MESSAGE){result.positiveText='';result.clarification='Please keep the request to 500 characters of text.';return result;}
  const quoteSpans=quotes(message),search=mask(message,protectedRanges(message)),ranges=[];
  const markers=new RegExp(NEGATIVE.source,NEGATIVE.flags);let marker;
  while((marker=markers.exec(search))){
    if(wordChar(search[marker.index-1])||wordChar(search[markers.lastIndex]))continue;
    if(ranges.some(range=>marker.index>=range.start&&marker.index<range.end))continue;
    const tail=message.slice(markers.lastIndex);
    // "not only ... but also ..." expresses an addition, not an exclusion.
    if(/^\s+(?:only|just)\b/i.test(tail)&&/^not$/i.test(marker[0]))continue;
    // A standalone "No," is a discourse correction; the following words are
    // not automatically negated ("No, Italian instead").
    if(/^no$/i.test(marker[0])&&/^\s*[,!.?]/.test(tail))continue;
    let prefix=skipPrefix(message,markers.lastIndex),cursor=prefix.index,end=cursor,entries=[];
    if(prefix.named&&!quoteSpans.some(span=>span.start===cursor)){result.clarification=clarification();continue;}
    for(;;){
      const term=knownAt(message,cursor,quoteSpans);
      if(!term){result.clarification=clarification();break;}
      entries.push(term);end=term.end;
      const remainder=message.slice(end);
      const connector=remainder.match(/^\s*(?:,\s*(?:(?:and|or)\s+)?|(?:and|or)\s+|\/\s*)/i);
      if(!connector)break;
      // A location/positive qualifier after the list belongs to the request:
      // "restaurants, not bars, in Seaport" must keep Seaport positive.
      const clauseStart=skipSpace(message,end+connector[0].length);
      if(/^(?:in|near|around|within|with|under|below|for)\b/i.test(message.slice(clauseStart)))break;
      prefix=skipPrefix(message,end+connector[0].length);const next=prefix.index;
      if(prefix.named&&!quoteSpans.some(span=>span.start===next)){result.clarification=clarification();break;}
      if(knownAt(message,next,quoteSpans)){cursor=next;continue;}
      // Positive requests/constraints and another explicit negative start a
      // new clause. Other coordinated unknown facts must not be dropped.
      if(/^(?:find|show|recommend|suggest|want|looking|in|near|around|with|under|below|for|but|then|instead|please|no|not|avoid|except|without)\b/i.test(message.slice(next)))break;
      if(message.slice(next).trim())result.clarification=clarification();
      break;
    }
    if(!entries.length)continue;
    const leftover=message.slice(end).trimStart();
    if(leftover&&!/^[,;.!?:)]/.test(leftover)&&! /^(?:and|or|in|near|around|within|with|under|below|for|but|then|instead|please|find|show|recommend|suggest|want|looking|restaurants?|places?|spots?|food|cuisines?|venues?|options?|no|not|avoid|except|without)\b/i.test(leftover))result.clarification=clarification();
    const locations=parseNeighborhoods(message.slice(marker.index,end));
    for(const term of entries){
      if(term.kind==='excludedNeighborhoods'&&!locations.includes(term.value))continue;
      const list=result[term.kind];
      if(!list.includes(term.value)){
        if(list.length>=MAX_EXCLUSIONS)result.clarification='Please use at most 12 exclusions of each kind.';
        else list.push(term.value);
      }
    }
    ranges.push({start:marker.index,end});
  }
  let positive=message;
  for(const range of ranges.sort((a,b)=>b.start-a.start))positive=positive.slice(0,range.start)+' '+positive.slice(range.end);
  // These negative constructions are not supported category grammar. Do not
  // turn "can't eat Italian" into a positive Italian recommendation or claim
  // dietary safety. Quoted/named identities and already parsed clauses stay
  // protected from this conservative clarification guard.
  const unparsed=mask(search,ranges);
  if(/\b(?:can['’]t|cannot|can\s+not(?!\s+(?:only|just)\b)|anything\s+but|rather\s+than|instead\s+of)\b/i.test(unparsed))result.clarification=result.clarification||clarification();
  result.positiveText=positive.trim();
  return result;
}
function isEventRequest(message){
  const constraints=extractConstraints(message);if(constraints.clarification)return false;
  let text=mask(constraints.positiveText,protectedRanges(constraints.positiveText)).toLowerCase();
  if(/\b(events?|concerts?|live\s+music|what['’]s\s+happening)\b/.test(text))return true;
  // "Show restaurants" is an instruction. "A show", "shows" and
  // "show tonight/in Cambridge" refer to the event noun. Strip only a
  // leading imperative, retaining a second noun in "show me a show".
  text=text.replace(/^\s*(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?show\s+(?!(?:tonight|today|tomorrow|this|next|on|in|near|around|at|with|starring|featuring|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b)(?:(?:me|us)\s+)?/i,'');
  return /\bshows?\b/.test(text);
}
function explicitVenueType(message){
  const constraints=extractConstraints(message);if(constraints.clarification)return null;
  const positive=constraints.positiveText;if(NAMED_COMMAND.test(positive))return null;
  const text=mask(positive,quotes(positive)).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
  if(isEventRequest(positive))return null;
  const restaurant=/\brestaurants?\b/;
  const otherPlaces=/\b(?:bars?|pubs?|brewery|breweries|wineries|caf[eé]s?|coffee shops?|lounges?|nightclubs?|clubs?|music venues?|live music|karaoke|events?)\b/;
  const cocktailBars=/\bcocktail[-\s]+bars?\b/g;
  if(restaurant.test(text)&&!otherPlaces.test(text))return 'restaurant';
  if(/\bcocktail[-\s]+bars?\b/.test(text)&&!restaurant.test(text)&&!otherPlaces.test(text.replace(cocktailBars,' '))
    &&! /\b(?:dinner|lunch|brunch)\b/.test(text))return 'cocktail_bar';
  return null;
}
function inferVenueType(message){
  const constraints=extractConstraints(message);if(constraints.clarification)return null;
  const positive=constraints.positiveText;if(NAMED_COMMAND.test(positive)||isEventRequest(positive))return null;
  const text=mask(positive,quotes(positive)).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase(),classes=[];
  if(/\b(?:restaurants?|dining|dinner|lunch|brunch|food|eat)\b/.test(text))classes.push('restaurant');
  if(/\b(?:bars?|pubs?|cocktails?|drinks?)\b/.test(text))classes.push('bar');
  if(/\b(?:caf[eé]s?|coffee|espresso)\b/.test(text))classes.push('cafe');
  if(/\b(?:clubs?|nightclubs?|dance|dancing|nightlife|dj)\b/.test(text))classes.push('nightlife');
  if(classes.length>1)return null;
  return explicitVenueType(positive)||classes[0]||null;
}

module.exports={extractConstraints,explicitVenueType,inferVenueType,parseNeighborhoods,isEventRequest};
