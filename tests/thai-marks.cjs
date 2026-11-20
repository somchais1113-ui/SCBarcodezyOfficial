// Run with Node.js 20+ from the extracted project. Uses the shipped font bytes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const studio=path.join(__dirname,'../assets/studio');
const env=vm.createContext({opentype:require('../assets/vendor/opentype.min.js'),MM:25.4/72,Intl});
env.window=env;
for(const file of ['fonts.js','db-thaitext.js','db-thai-layout.js','thai-marks.js','thai-layout.js']){
  vm.runInContext(fs.readFileSync(path.join(studio,file),'utf8'),env,{filename:file});
}
const {marks,db}=vm.runInContext('({marks:ThaiMarks,db:withDBThaiLayout})',env);
for(const [name,bytes] of Object.entries(env.labelFonts)){
  const raw=env.opentype.parse(Uint8Array.from(Buffer.from(bytes,'base64')).buffer);
  const font=name==='DB ThaiText X'?db(raw):raw;
  function changes(text,kind,index){
    const markTuning=index?{single:{text,points:{[kind+':'+index]:[.15,.2]}}}:{all:{[kind]:[.15,.2]}};
    const state=marks.state({text,sx:72,sy:110,markTuning});
    const original=marks.outline(font,text,0,30,24,{kerning:true}).commands;
    const shifted=marks.outline(font,text,0,30,24,{kerning:true,markState:state}).commands;
    assert.equal(original.length,shifted.length,name+' · '+text);
    let moved=0,stationary=0;
    for(let i=0;i<original.length;i++)for(const suffix of ['','1','2']){
      const x='x'+suffix,y='y'+suffix;
      if(!(x in original[i]))continue;
      const dx=shifted[i][x]-original[i][x],dy=shifted[i][y]-original[i][y];
      if(Math.abs(dx)+Math.abs(dy)<1e-7){stationary++;continue;}
      assert(Math.abs(dx-.15*state.kx)<1e-7&&Math.abs(dy-.2*state.ky)<1e-7,name+' · '+text);
      moved++;
    }
    assert(stationary>0);return moved;
  }
  assert(changes('ข้อแนะนำ','tho')>0&&changes('ข้อแนะนำ','am')>0);
  assert(changes('กิ้','vowel')>0);assert.equal(changes('กุ','vowel'),0);
  assert.equal(changes('ค่า','tho'),0);
  assert.equal(changes('น้ำ น้ำ','tho'),changes('น้ำ น้ำ','tho',1)+changes('น้ำ น้ำ','tho',2));
  for(const [rule,positive,negative] of [
    ['baseTone','ข้อ แก้ ค่า','ชี้ น้ำ'],['stackTone','ชี้ ที่','ข้อ น้ำ'],
    ['amTone','น้ำ ย้ำ','ข้อ ชี้'],['vowel','ชี้','น้ำ ข้อ'],['am','น้ำ ย้ำ','ข้อ ชี้']
  ]){
    function outline(text,profile){
      const state=marks.state({text,sx:100,sy:100,pt:12},null,profile);
      return marks.outline(font,text,0,20,12*env.MM,{kerning:true,markState:state}).toPathData(5);
    }
    const profile={[rule]:[.05,.08]};
    for(const text of positive.split(' '))assert.notEqual(outline(text,profile),outline(text),name+' '+rule+' '+text);
    assert.equal(outline(negative,profile),outline(negative),name+' '+rule+' '+negative);
  }
  assert(changes('ป้ำ','am')>0,name+' · ป้ำ');
}
console.log('Thai mark outline checks passed for all bundled faces.');
