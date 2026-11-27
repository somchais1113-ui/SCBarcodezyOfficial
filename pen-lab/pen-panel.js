// Shared with the existing upload and sample entry points.
const penPanel = (() => {
  const get=id=>document.getElementById(id);
  let model=null,output=null,name='',generation=0;
  function clear(message){
    generation++;model=null;output=null;get('pen-export').disabled=true;get('pen-result').replaceChildren();get('pen-compare').removeAttribute('src');get('pen-proof').hidden=true;get('pen-status').textContent=message;
  }
  function redraw(){
    if(!model)return;
    const length=get('pen-length').valueAsNumber,stroke=get('pen-stroke').valueAsNumber,gap=get('pen-gap').valueAsNumber;
    try{
      output=PenOutline.draw(model,length,stroke,gap,get('pen-ink').value);
      const svg=new DOMParser().parseFromString(output.svg,'image/svg+xml').documentElement;
      get('pen-result').style.setProperty('--print-width',length+'mm');get('pen-result').style.setProperty('--print-height',output.height+'mm');
      get('pen-result').replaceChildren(document.importNode(svg,true));get('pen-proof').hidden=false;
      get('pen-status').textContent=length+' × '+Number(output.height.toFixed(2))+' มม. · สีเดียว · '+output.paths.length+' พาธ';
      get('pen-export').disabled=false;
    }catch(e){output=null;get('pen-result').replaceChildren();get('pen-export').disabled=true;get('pen-status').textContent=e.message;}
  }
  function start(image,filename){
    clear('กำลังหาขอบและรอยต่อ…');const ticket=generation;
    requestAnimationFrame(()=>setTimeout(()=>{
      if(generation!==ticket)return;
      try{model=PenOutline.analyse(image);name=filename;get('pen-compare').src=model.proof.toDataURL();redraw();}
      catch(e){clear(e.message);}
    },0));
  }
  get('pen-actual').onchange=()=>get('pen-result').classList.toggle('print-scale',get('pen-actual').checked);
  for(const id of ['pen-length','pen-stroke','pen-gap','pen-ink'])get(id).addEventListener('input',redraw);
  get('pen-export').onclick=()=>{if(!output)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([output.svg],{type:'image/svg+xml'}));a.download=name.replace(/\.[^.]+$/,'')+'_'+get('pen-length').value+'mm_Outline.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000);};
  return {clear,start};
})();
