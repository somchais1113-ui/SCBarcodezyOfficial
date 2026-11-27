// The web app supplies exact artwork PDFs and geometry. Illustrator itself writes the native files.
// Keep the converter function in ExtendScript's ES3 subset. It is serialised into the exported JSX.
const StickerIllustrator = (() => {
  function buildInIllustrator(job) {
    var root=File($.fileName).parent, output, doc=null, prefs=app.preferences.PDFFileOptions;
    var oldBox=prefs.pDFCropToBox,oldPage=prefs.pageToOpen,oldCoords=app.coordinateSystem;
    var suffix=1,sheet=0,pt=72/25.4;
    function namedFile(folder,name){return new File(folder.fullName+'/'+File.encode(name));}
    function sheetFile(i){var s=String(i);while(s.length<3)s='0'+s;return namedFile(output,job.name+'_Sheet-'+s+'.ai');}
    function addCuts(layer,board,total,ink) {
      var i,cmd,p,group,points=[],left=[],right=[],ring;
      function finish(){
        if(points.length>1&&Math.abs(points[0][0]-points[points.length-1][0])<.00001&&Math.abs(points[0][1]-points[points.length-1][1])<.00001){
          left[0]=left.pop();points.pop();right.pop();
        }
        if(points.length<2)throw Error('Empty knife path');
        ring=group.pathItems.add();ring.setEntirePath(points);ring.closed=true;
        ring.filled=false;ring.stroked=true;ring.strokeColor=ink;ring.strokeWidth=.25;ring.strokeOverprint=true;
        for(var k=0;k<points.length;k++){
          if(left[k])ring.pathPoints[k].leftDirection=left[k];
          if(right[k])ring.pathPoints[k].rightDirection=right[k];
        }
        points=[];left=[];right=[];
      }
      group=layer.groupItems.add();
      function pos(x,y){
        return [board[0]+pt*(job.left+(job.rot?job.h-y:x)),board[1]-pt*(job.top+(job.rot?x:y))];
      }
      for(i=0;i<job.path.length;i++){
        cmd=job.path[i];
        if(cmd[0]==='Z'){finish();continue;}
        if(cmd[0]==='C'){
          right[right.length-1]=pos(cmd[1],cmd[2]);p=pos(cmd[5],cmd[6]);left.push(pos(cmd[3],cmd[4]));
        }else{p=pos(cmd[1],cmd[2]);left.push(null);}
        points.push(p);right.push(null);
      }
      for(i=1;i<total;i++){
        var copy=group.duplicate(layer,ElementPlacement.PLACEATEND);
        copy.translate((i%job.cols)*(job.dx+job.gap)*pt,-Math.floor(i/job.cols)*(job.dy+job.gap)*pt);
      }
    }
    try{
      do{output=new Folder(root.fullName+'/Illustrator'+(suffix===1?'':'-'+suffix));suffix++;}while(output.exists);
      if(!output.create())throw Error('Cannot create output folder');
      prefs.pDFCropToBox=PDFBoxType.PDFMEDIABOX;prefs.pageToOpen=1;
      app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
      for(var part=0;part<job.parts.length;part++){
        var spec=job.parts[part],file=namedFile(root,spec.pdf);
        if(!file.exists)throw Error('Missing '+spec.pdf);
        doc=app.open(file);
        var board=doc.artboards[0].artboardRect;
        if(Math.abs(board[2]-board[0]-1000*pt)>.1||Math.abs(board[1]-board[3]-1000*pt)>.1)throw Error('PDF artboard size mismatch');
        var graphic,layers=[],i;
        if(doc.layers.length===1){graphic=doc.layers[0];}
        else{
          for(i=0;i<doc.layers.length;i++)layers.push(doc.layers[i]);
          graphic=doc.layers.add();
          for(i=0;i<layers.length;i++)layers[i].move(graphic,ElementPlacement.PLACEATEND);
        }
        graphic.name='Aw-Graphic';graphic.locked=false;graphic.visible=true;
        var die=doc.layers.add();die.name='Aw-Dicut_100';
        die.zOrder(ZOrderMethod.BRINGTOFRONT);die.locked=false;die.visible=true;
        var spot;
        try{spot=doc.spots.getByName(job.spot);}catch(missing){spot=null;}
        if(!spot){
          spot=doc.spots.add();spot.name=job.spot;
          var color;
          if(doc.documentColorSpace===DocumentColorSpace.CMYK){color=new CMYKColor();color.cyan=0;color.magenta=100;color.yellow=0;color.black=0;}
          else{color=new RGBColor();color.red=255;color.green=0;color.blue=255;}
          spot.colorType=ColorModel.SPOT;spot.color=color;
        }
        if(spot.name!==job.spot||spot.colorType!==ColorModel.SPOT)throw Error('Spot name already used: '+job.spot);
        var ink=new SpotColor();ink.spot=spot;ink.tint=100;
        addCuts(die,board,spec.count,ink);
        if(doc.layers.length!==2||doc.layers[0].name!=='Aw-Dicut_100'||doc.layers[1].name!=='Aw-Graphic')throw Error('Unexpected Illustrator layer order');
        doc.activeLayer=graphic;
        var options=new IllustratorSaveOptions();
        options.compatibility=Compatibility.ILLUSTRATOR16;options.pdfCompatible=true;options.embedLinkedFiles=true;
        var first=sheetFile(++sheet);
        doc.saveAs(first,options);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
        for(i=1;i<spec.copies;i++)if(!first.copy(sheetFile(++sheet).fsName))throw Error('Cannot copy repeated sheet '+sheet);
      }
      alert('Saved '+sheet+' AI file(s) in '+output.fsName);
    }catch(err){
      alert('Sticker Studio: '+err.message+(output?'\n'+output.fsName:''));
    }finally{
      if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);
      prefs.pDFCropToBox=oldBox;prefs.pageToOpen=oldPage;app.coordinateSystem=oldCoords;
    }
  }
  async function bundle(j,name,printPDF) {
    const files=[],parts=[];
    const copies=Math.floor(j.qty/j.cap),tail=j.qty%j.cap;
    for(const [count,repeats] of [[j.cap,copies],[tail,1]]){
      if(!count||!repeats)continue;
      const pdf='Graphic-'+(parts.length+1)+'.pdf';
      const blob=await printPDF({...j,qty:count,pages:1},'print');
      files.push({name:pdf,data:new Uint8Array(await blob.arrayBuffer())});
      parts.push({pdf,count,copies:repeats});
    }
    const {cols,dx,dy,gap,left,top,rot,h,path,spot}=j;
    const settings=JSON.stringify({cols,dx,dy,gap,left,top,rot,h,path,spot,name,parts})
      .replace(/[^\x20-\x7e]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
    const encoder=new TextEncoder();
    files.push({name:'Make-AI.jsx',data:encoder.encode('#target illustrator\n('+buildInIllustrator.toString()+')('+settings+');\n')});
    files.push({name:'วิธีสร้างไฟล์ AI.txt',data:encoder.encode('แตก ZIP ทั้งโฟลเดอร์ แล้วเปิด Adobe Illustrator CS6 หรือ CC\r\nเลือก File > Scripts > Other Script... แล้วเลือก Make-AI.jsx\r\nโปรแกรมจะสร้าง .ai แยกทุกแผ่น ขนาด 1,000 × 1,000 มม. ในโฟลเดอร์ Illustrator ข้างสคริปต์\r\nAw-Dicut_100 อยู่ด้านบนและใช้ Spot '+spot+' ที่ Tint 100% ส่วน Aw-Graphic อยู่ด้านล่าง\r\nหากเปิดซ้ำจะสร้างโฟลเดอร์ใหม่ ทดสอบอ่าน Spot ใน RIP ก่อนตัดล็อตจริง\r\n')});
    return makeZip(files);
  }
  return {bundle};
})();
