const fs=require('fs');
const phrases=require('./docx_phrases.json');
const bank=require('../app/data/adjectives.json');
const kinds={adjectives:0,comparatives:1,superlatives:2};
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const direct=[];
for(const e of bank) for(let i=0;i<3;i++) if(e.forms[i]) direct.push({form:e.forms[i],index:i,word:e.word});
function matches(text,index){
 const out=[];
 for(const c of direct){if(c.index!==index)continue;const re=new RegExp('(^|[^A-Za-z])('+esc(c.form)+')(?=$|[^A-Za-z-])','gi');let m;while((m=re.exec(text))!==null)out.push({start:m.index+m[1].length,end:m.index+m[0].length,answer:m[2],word:c.word});}
 return out.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
}
function pick(text,kind){
 const idx=kinds[kind];
 const found=matches(text,idx); if(found.length)return {...found[0],source:'bank'};
 let re,m;
 if(kind==='adjectives'){
  re=/\b(?:is|are|am|was|were|be|been|being|seems?|looks?|feels?|sounds?|becomes?|became|remains?|stays?|tastes?|smells?)\s+(?:(?:absolutely|deeply|genuinely|incredibly|particularly|perfectly|quite|really|remarkably|surprisingly|thoughtfully|unexpectedly|very|well|both|too|so|rather|totally|beautifully|carefully)\s+)*(?:a[n]?\s+)?([A-Za-z]+(?:-[A-Za-z]+)?)/i;
  m=re.exec(text);if(m){const start=m.index+m[0].lastIndexOf(m[1]);return {start,end:start+m[1].length,answer:m[1],source:'copula'}}
  re=/\b(?:a|an|the)\s+([A-Za-z]+(?:-[A-Za-z]+)?)\s+(?:idea|experience|event|approach|building|celebration|design|conversation|view|trip|town|novel|exhibition)\b/i;
  m=re.exec(text);if(m){const start=m.index+m[0].indexOf(m[1]);return {start,end:start+m[1].length,answer:m[1],source:'attributive'}}
 }
 if(kind==='comparatives'){
  const patterns=[
   /\b(?:more and more|less and less)\s+[A-Za-z]+(?:-[A-Za-z]+)?/i,
   /\b(?:as\s+[A-Za-z]+(?:-[A-Za-z]+)?\s+as)\b/i,
   /\b(?:increasingly|gradually|ever)\s+[A-Za-z]+(?:-[A-Za-z]+)?/i,
   /\b(?:more|less)\s+[A-Za-z]+(?:-[A-Za-z]+)?/i,
   /\b(?:earlier|sooner|better|worse|further|farther|fewer)\b/i,
   /\b[A-Za-z]+(?:ier|er)\b(?=\s+(?:than|in|of|to|as|we|you|I|they|it|the|fewer|problems|will|the))/i,
  ];
  for(re of patterns){m=re.exec(text);if(m)return {start:m.index,end:m.index+m[0].length,answer:m[0],source:'comparative-pattern'}}
 }
 if(kind==='superlatives'){
  re=/\b(?:most|least)\s+(?:(?:unexpectedly|thoughtfully|meticulously|remarkably|surprisingly|genuinely|incredibly|undoubtedly|arguably)\s+)?[A-Za-z]+(?:-[A-Za-z]+)?/i;
  m=re.exec(text);if(m)return {start:m.index,end:m.index+m[0].length,answer:m[0],source:'superlative-pattern'};
  re=/\b[A-Za-z]+(?:iest|est)\b/i;
  m=re.exec(text);if(m)return {start:m.index,end:m.index+m[0].length,answer:m[0],source:'superlative-suffix'};
 }
 return null;
}
const output=[],miss=[];
for(const p of phrases){const f=pick(p.english,p.kind);if(!f){miss.push(p);continue;}output.push({id:p.number,level:p.level,kind:p.kind,english:p.english,spanish:p.spanish,answer:f.answer.toLowerCase(),frame:p.english.slice(0,f.start)+'_____'+p.english.slice(f.end),targetSource:f.source});}
if(miss.length) throw new Error(`${miss.length} source phrases need a focus adjective`);
console.log({total:phrases.length,parsed:output.length,miss:miss.length,sourceCount:output.reduce((o,x)=>(o[x.targetSource]=(o[x.targetSource]||0)+1,o),{})});
fs.writeFileSync('./work/phrase_bank_prototype.json',JSON.stringify(output,null,2));
const runtimeData=output.map(({id,level,kind,spanish,english,frame,answer})=>({id,level,kind,spanish,english,frame,answer}));
fs.writeFileSync('./app/data/practicePhrases.js',`window.PRACTICE_PHRASES = ${JSON.stringify(runtimeData)};\n`);
