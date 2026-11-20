// Every variant owns an editable project and the exact artwork used for preview and print.
(()=>{
  const width=210,height=297,margin=5,gap=3,epsilon=0.000001;
  const groups=[];
  let page=0,chosen=null,editing=null,printing=false;
  const dialog=$('sheetDialog');
  const positions=()=>groups.flatMap(group=>group.copies);
  const groupFor=copy=>groups.find(group=>group.copies.includes(copy));
  const round=n=>Math.round(n*1000000)/1000000;

  function fits(box,others){
    if(box.x<margin-epsilon||box.y<margin-epsilon||box.x+box.w>width-margin+epsilon||box.y+box.h>height-margin+epsilon)return false;
    return others.every(other=>box.page!==other.page||box.x+box.w+gap<=other.x+epsilon||
      other.x+other.w+gap<=box.x+epsilon||box.y+box.h+gap<=other.y+epsilon||other.y+other.h+gap<=box.y+epsilon);
  }

  function allocate(w,h,occupied){
    if(w>width-2*margin+epsilon||h>height-2*margin+epsilon)throw Error('ฉลากใหญ่เกินพื้นที่ 200 × 287 มม. ของ A4 แนวตั้ง');
    for(let sheet=0;;sheet++){
      const local=occupied.filter(box=>box.page===sheet);
      const edges=(pos,size)=>[...new Set([margin,...local.map(b=>round(b[pos]+b[size]+gap))])].sort((a,b)=>a-b);
      const xs=edges('x','w'),ys=edges('y','h');
      for(const y of ys)for(const x of xs){
        const box={x,y,w,h,page:sheet};
        if(fits(box,local))return box;
      }
    }
  }

  function quantity(input){
    const n=input.valueAsNumber;
    if(!Number.isInteger(n)||n<1||n>300)throw Error('ใส่จำนวนเต็ม 1–300 ดวงต่อแบบ');
    return n;
  }

  async function capture(){
    if(busy)throw Error('รอให้ถอดแบบเสร็จก่อน');
    const raw=svgSource(),model=structuredClone(project);
    const root=await StudioPrint.session().prepare(raw,'svg'),svg=StudioPrint.serial(root);
    return {model,svg,name:StudioExportName.productName(model,model.layers),
      url:URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}))};
  }

  function count(){
    const n=positions().length;
    $('sheetOpen').textContent='ดูแผ่น A4 · '+n+' ดวง';
    return n;
  }
  function focusCopy(copy){chosen=copy;if(copy)page=copy.page;}
  function pageCount(){return positions().reduce((n,b)=>Math.max(n,b.page+1),1);}
  function show(){
    const total=count(),pages=pageCount();
    page=Math.min(page,pages-1);
    const visible=positions().filter(b=>b.page===page);
    if(!visible.includes(chosen))chosen=visible[0]||null;
    const group=groupFor(chosen);
    $('sheetPages').textContent='แผ่น '+(page+1)+' / '+pages;
    $('sheetPrev').disabled=page===0;$('sheetNext').disabled=page===pages-1;
    $('sheetPDF').disabled=!total||printing;
    $('sheetEmpty').hidden=!!total;$('sheetSelection').hidden=!total;
    $('sheetGroup').replaceChildren(...groups.map((g,i)=>new Option(g.name+' · '+g.copies.length+' ดวง',i)));
    const paper=$('sheetPaper');paper.replaceChildren();
    if(!group)return;
    $('sheetGroup').value=groups.indexOf(group);
    $('sheetSize').textContent=+chosen.w.toFixed(3)+' × '+(+chosen.h.toFixed(3))+' มม.';
    $('sheetQty').value=group.copies.length;
    $('sheetX').value=chosen.x;$('sheetY').value=chosen.y;
    $('sheetCopyTitle').textContent='ตำแหน่งดวงที่ '+(group.copies.indexOf(chosen)+1);
    for(const g of groups)g.copies.forEach((b,i)=>{
      if(b.page!==page)return;
      const el=document.createElement('button'),img=new Image();
      el.type='button';el.setAttribute('aria-label',g.name+' ดวงที่ '+(i+1));el.setAttribute('aria-pressed',b===chosen);
      Object.assign(el.style,{left:b.x/width*100+'%',top:b.y/height*100+'%',width:b.w/width*100+'%',height:b.h/height*100+'%'});
      img.alt='';img.src=g.url;el.append(img);paper.append(el);
      el.onclick=()=>{focusCopy(b);show();paper.querySelector('[aria-pressed=true]')?.focus();};
    });
  }

  function compactPages(){
    const indices=[...new Set(positions().map(box=>box.page))].sort((a,b)=>a-b);
    for(const box of positions())box.page=indices.indexOf(box.page);
    if(chosen&&groupFor(chosen))page=chosen.page;
  }
  let acting=false;
  const action=(id,fn)=>$(id).onclick=async()=>{
    if(acting)return;
    acting=true;
    const message=dialog.open?$('sheetMessage'):editing?$('sheetEditMessage'):$('sheetFeedback');
    message.textContent='';
    try{await fn();}catch(e){message.textContent=e.message;note(e.message);}
    finally{acting=false;}
  };
  action('sheetAdd',async()=>{
    const n=quantity($('sheetCopies')),occupied=positions(),copies=[];
    for(let i=0;i<n;i++){const b=allocate(project.width,project.height,occupied);occupied.push(b);copies.push(b);}
    const g={...await capture(),copies};groups.push(g);focusCopy(copies[0]);count();
    $('sheetFeedback').textContent='เพิ่ม '+g.name+' จำนวน '+n+' ดวงแล้ว';
  });
  function open(){show();$('sheetMessage').textContent='';dialog.showModal();}
  action('sheetOpen',open);$('sheetClose').onclick=()=>dialog.close();
  $('sheetPrev').onclick=()=>{page--;show();};$('sheetNext').onclick=()=>{page++;show();};
  $('sheetGroup').onchange=()=>{focusCopy(groups[+$('sheetGroup').value].copies[0]);show();};
  action('sheetMove',()=>{
    const x=$('sheetX').valueAsNumber,y=$('sheetY').valueAsNumber;
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('ระบุ X และ Y เป็นมิลลิเมตร');
    if(!fits({...chosen,x,y},positions().filter(b=>b!==chosen)))throw Error('ตำแหน่งนี้ล้ำขอบกระดาษหรือชิดฉลากอื่นเกินไป');
    Object.assign(chosen,{x,y});show();$('sheetMessage').textContent='ย้ายดวงที่เลือกแล้ว';
  });
  action('sheetSetQty',()=>{
    const g=groupFor(chosen),n=quantity($('sheetQty')),all=positions();
    const copies=g.copies.slice(0,n);
    while(copies.length<n){const b=allocate(g.model.width,g.model.height,all);copies.push(b);all.push(b);}
    g.copies=copies;if(!copies.includes(chosen))focusCopy(copies[copies.length-1]);compactPages();show();
  });
  action('sheetRemove',()=>{
    const g=groupFor(chosen);groups.splice(groups.indexOf(g),1);URL.revokeObjectURL(g.url);
    chosen=null;compactPages();show();
  });

  // Return to the user's working label and its own undo stack after editing a sheet variant.
  function editMode(on){
    $('sheetEditBar').hidden=!on;
    for(const id of ['sheetOpen','sheetAdd','save','load','projectFile','imageFile','lunaExample'])$(id).disabled=on;
    $('sourcePanel').querySelector('#drop').inert=on;
  }
  action('sheetEdit',async()=>{
    if(busy)throw Error('รอให้ถอดแบบเสร็จก่อน');
    const g=groupFor(chosen);
    const original={project,selected,history,future,mode:$('mode').value,sourceOpen:$('sourcePanel').open};
    const model=structuredClone(g.model);model.id=uid();
    await restore(model);editing={g,original};history=[];future=[];$('mode').value='art';render();
    $('sheetEditTitle').textContent='กำลังแก้บน A4 · '+g.name+' ('+g.copies.length+' ดวง)';
    dialog.close();editMode(true);$('sheetEditBar').scrollIntoView({block:'start'});
  });
  async function finish(){
    if(busy)throw Error('รอให้ถอดแบบเสร็จก่อน');
    const o=editing.original;
    await restore(o.project);history=o.history;future=o.future;selected=o.selected;
    $('mode').value=o.mode;$('sourcePanel').open=o.sourceOpen;render();editing=null;editMode(false);open();
  }
  action('sheetCancel',finish);
  action('sheetApply',async()=>{
    const g=editing.g,others=positions().filter(b=>!g.copies.includes(b));
    const w=project.width,h=project.height;
    const copies=g.copies.map(old=>{
      const candidate={...old,w,h},b=fits(candidate,others)?candidate:allocate(w,h,others);
      others.push(b);return b;
    });
    const artwork=await capture(),index=g.copies.indexOf(chosen);
    URL.revokeObjectURL(g.url);Object.assign(g,artwork,{copies});focusCopy(copies[index]);compactPages();
    await finish();$('sheetMessage').textContent='อัปเดตทุกดวงของแบบที่เลือกแล้ว';
  });
  action('sheetPDF',async()=>{
    if(printing)return;
    printing=true;dialog.querySelector('.sheet-layout').inert=true;$('sheetClose').disabled=true;
    const lock=e=>e.preventDefault();dialog.addEventListener('cancel',lock);
    try{
      const pdf=new jspdf.jsPDF({putOnlyUsedFonts:true,unit:'mm',format:'a4',orientation:'portrait',compress:true});
      const pages=pageCount(),print=StudioPrint.session(),ready=new Map();
      for(let p=0;p<pages;p++){
        if(p)pdf.addPage();
        $('sheetMessage').textContent='กำลังสร้าง PDF แผ่น '+(p+1)+' / '+pages;
        for(const g of groups)for(const b of g.copies){
          if(b.page!==p)continue;
          if(!ready.has(g))ready.set(g,await print.prepare(g.svg,'pdf'));
          const svg=ready.get(g).cloneNode(true);
          await pdf.svg(svg,{x:b.x,y:b.y,width:b.w,height:b.h});
        }
      }
      const model=groups[0].model;
      pdf.save(StudioExportName.filename(model,model.layers,'pdf'));
      $('sheetMessage').textContent='ส่งออก PDF แล้ว · '+pages+' แผ่น'+print.detail();
    }finally{printing=false;dialog.querySelector('.sheet-layout').inert=false;$('sheetClose').disabled=false;dialog.removeEventListener('cancel',lock);}
  });
})();
