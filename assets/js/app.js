
    const APP_NAME = "SC-BARCODEDZY_BKK_101_VER-1.1";
    const APP_BUILD = "Ver-1.1_2026-11-18";
    const LABEL_WIDTH_MM = 172.54;
    const LABEL_HEIGHT_MM = 123.01;
    const BATCH_PAGE_SIZE = 30;
    // PDF physical print sizes per GTIN Level (mm)
    const PDF_PRINT_SIZE = {
      "2":        { w: 48,  h: 30 },   // Lv2 → 48 x 30 mm (no title)
      "3":        { w: 60,  h: 35 },   // Lv3 → 60 x 35 mm
      "4":        { w: 112, h: 60 },   // Lv4 → 112 x 60 mm
      "ean13":    { w: 70,  h: 20 },   // EAN-13 barcode only → 70 x 20 mm
      "ean13then":{ w: 80,  h: 34 }    // EAN-13 TH/EN with product names → 80 x 34 mm
    };
    function getPrintSize(level) { return PDF_PRINT_SIZE[String(level)] || PDF_PRINT_SIZE["3"]; }
    function isEan13Mode(level) { return String(level) === "ean13" || String(level) === "ean13then"; }
    function isEan13ThenMode(level) { return String(level) === "ean13then"; }
    // EAN-13 barcode-only label dimensions (70×20 mm)
    const EAN13_LABEL_W = 70;
    const EAN13_LABEL_H = 20;
    // EAN-13 TH/EN label dimensions (80×34 mm)
    const EAN13THEN_LABEL_W = 80;
    const EAN13THEN_LABEL_H = 34;
    // Compute fit-to-page rectangle preserving aspect ratio (centered, with optional padding)
    function fitContain(srcW, srcH, dstW, dstH, paddingMm = 0) {
      const innerW = Math.max(0.1, dstW - paddingMm * 2);
      const innerH = Math.max(0.1, dstH - paddingMm * 2);
      const scale = Math.min(innerW / srcW, innerH / srcH);
      const w = srcW * scale, h = srcH * scale;
      return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h, scale };
    }

    // ============ FONT OUTLINING (opentype.js) ============
    let __embeddedFont = null;
    let __fontLoadPromise = null;
    function loadEmbeddedFont() {
      if (__embeddedFont) return Promise.resolve(__embeddedFont);
      if (__fontLoadPromise) return __fontLoadPromise;
      __fontLoadPromise = new Promise((resolve, reject) => {
        try {
          const b64 = byId("embeddedFontB64").textContent.trim();
          const binary = atob(b64);
          const buffer = new ArrayBuffer(binary.length);
          const view = new Uint8Array(buffer);
          for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
          __embeddedFont = window.opentype.parse(buffer);
          resolve(__embeddedFont);
        } catch (error) {
          reject(error);
        }
      });
      return __fontLoadPromise;
    }
    // CS PraJad font loaders — used for EAN-13 TH/EN labels
    let __csPraJadRegular = null, __csPraJadBold = null;
    let __csPraJadRegLoadPromise = null, __csPraJadBoldLoadPromise = null;
    function loadCSPraJadFont(scriptId, varSetter) {
      return new Promise((resolve, reject) => {
        try {
          const b64 = byId(scriptId).textContent.trim();
          const binary = atob(b64);
          const buffer = new ArrayBuffer(binary.length);
          const view = new Uint8Array(buffer);
          for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
          const parsed = window.opentype.parse(buffer);
          varSetter(parsed);
          resolve(parsed);
        } catch (error) { reject(error); }
      });
    }
    function loadCSPraJadRegular() {
      if (__csPraJadRegular) return Promise.resolve(__csPraJadRegular);
      if (__csPraJadRegLoadPromise) return __csPraJadRegLoadPromise;
      __csPraJadRegLoadPromise = loadCSPraJadFont("csPraJadRegularB64", (f) => { __csPraJadRegular = f; });
      return __csPraJadRegLoadPromise;
    }
    function loadCSPraJadBold() {
      if (__csPraJadBold) return Promise.resolve(__csPraJadBold);
      if (__csPraJadBoldLoadPromise) return __csPraJadBoldLoadPromise;
      __csPraJadBoldLoadPromise = loadCSPraJadFont("csPraJadBoldB64", (f) => { __csPraJadBold = f; });
      return __csPraJadBoldLoadPromise;
    }
    let currentMode = "single";
    let batchIndex = 0;
    let currentBatchPage = 0;
    const byId = (id) => document.getElementById(id);
    const sampleData = { title:"QTM GELVOLUTION 007 HITZ", subtitle:"QUANTUM GELVOLUTION 007 HITZ ASST BLUE 0.7 MM (DM)", thaiName:"ควอนตั้มเจลโวลูชั่น 007 ฮิทซ์น้ำเงินคละสี (DM)", gtin13:"8851907346492", gtinLevel:"3", manualItf14:"38851907345397", location:"IND", qty:"20", grossWeight:"", lotNo:"" };
    const ean13SampleData = { gtin13: "8851907346522", gtinLevel: "ean13" };
    const batchSampleData = {
      batchTitleList: `QTM WHITEBOARD MARKER
QTM GELVOLUTION 007 HITZ
QTM BALL PEN`,
      batchSubtitleList: `QTM WHITEBOARD MARKER BLUE
QUANTUM GELVOLUTION 007 HITZ ASST BLUE 0.7 MM (DM)
QTM BALL PEN 0.5 MM BLACK`,
      batchThaiNameList: `ควอนตั้มไวท์บอร์ดมาร์กเกอร์น้ำเงิน
ควอนตั้มเจลโวลูชั่น 007 ฮิทซ์น้ำเงินคละสี (DM)
ควอนตั้มปากกาลูกลื่น 0.5 มม. ดำ`,
      batchGtin13List: `8851907344221
8851907346492
8851907000004`,
      batchItf14List: `48851907344229
38851907345397
48851907000002`,
      batchLocationList: `CHN`,
      batchQtyList: `144
20
60`,
      batchGrossWeightList: ``,
      batchLotNoList: ``
    };

    function onlyDigits(value) { return String(value ?? "").trim().replace(/[\s-]/g, ""); }
    function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
    function safe(value) { return String(value || "").trim().replace(/[\x00-\x1f\\/:*?"<>|()]+/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Product"; }
    function calcCheckDigit(value) { const digits = onlyDigits(value); if (!/^\d+$/.test(digits)) throw new Error("รหัสต้องเป็นตัวเลขเท่านั้น"); let sum = 0; for (let i=digits.length-1,p=0;i>=0;i--,p++) sum += Number(digits[i])*(p%2===0?3:1); return String((10-sum%10)%10); }
    function isValidGtin(value, length) { const digits=onlyDigits(value); return new RegExp(`^\\d{${length}}$`).test(digits) && calcCheckDigit(digits.slice(0,-1))===digits.slice(-1); }
    function buildITF14FromGTIN13(gtin13, level) { const unit=onlyDigits(gtin13), indicator=String(level); if (!isValidGtin(unit,13)) throw new Error("GTIN-13 ต้องมี 13 หลักและ Check Digit ถูกต้อง"); if (!/^[234]$/.test(indicator)) throw new Error("เลือก Level 2, 3 หรือ 4"); const body=indicator+unit.slice(0,12); return body+calcCheckDigit(body); }
    function getITF14(data) { const manual=onlyDigits(data.manualItf14); if (manual) { if (!isValidGtin(manual,14)) throw new Error("Manual ITF-14 ต้องมี 14 หลักและ Check Digit ถูกต้อง"); return {value:manual, source:"manual", valid:true}; } return {value:buildITF14FromGTIN13(data.gtin13,data.gtinLevel),source:"generated",valid:true}; }

    function collectData() { return { title:byId("title").value, subtitle:byId("subtitle").value, thaiName:byId("thaiName").value, gtin13:byId("gtin13").value, gtinLevel:byId("gtinLevel").value, manualItf14:byId("manualItf14").value, location:byId("location").value, qty:byId("qty").value, grossWeight:byId("grossWeight").value, lotNo:byId("lotNo").value, ean13ThenEnName:byId("ean13ThenEnName")?.value||"", ean13ThenThName:byId("ean13ThenThName")?.value||"" }; }
    const BATCH_FIELDS = {
      title:["batchTitleList","ชื่อบรรทัดใหญ่"], subtitle:["batchSubtitleList","ชื่ออังกฤษ"], thaiName:["batchThaiNameList","ชื่อไทย"],
      gtin13:["batchGtin13List","GTIN"], manualItf14:["batchItf14List","Manual ITF-14"], location:["batchLocationList","LOCATION"], qty:["batchQtyList","QTY"], grossWeight:["batchGrossWeightList","G.W."], lotNo:["batchLotNoList","LOT NO."],
      ean13ThenEnName:["batchEan13ThenEnNameList","ชื่อ EN (EAN)"], ean13ThenThName:["batchEan13ThenThNameList","ชื่อ TH (EAN)"]
    };
    function listFrom(id) { const text=byId(id)?.value || ""; if (!text.trim()) return []; const clean=text.replace(/\r/g,"").replace(/\n$/,""); return clean.split("\n").map(x=>x.trim()); }
    function pickValue(list,index,fallback) { return list.length===0 ? fallback : list.length===1 ? list[0] : (list[index] ?? ""); }
    function parseBatchItems() {
      const fallback=collectData(), gtinLevel=byId("batchGtinLevel").value;
      const keys=isEan13ThenMode(gtinLevel)?["gtin13","ean13ThenEnName","ean13ThenThName"]:isEan13Mode(gtinLevel)?["gtin13"]:Object.keys(BATCH_FIELDS).filter(k=>!k.startsWith("ean13Then"));
      const lists=Object.fromEntries(keys.map(k=>[k,listFrom(BATCH_FIELDS[k][0])])), errors=[];
      const total=Math.max(0,...Object.values(lists).map(x=>x.length));
      if (!lists.gtin13.length) errors.push("กรุณาวาง GTIN อย่างน้อย 1 รายการ");
      for(const [key,list] of Object.entries(lists)) if(list.length>1 && list.length!==total) errors.push(`${BATCH_FIELDS[key][1]}: ${list.length} แถว ต้องมี 1 หรือ ${total} แถว (คงแถวว่างตามตำแหน่ง หรือใส่ - แทนค่าว่าง)`);
      const items=Array.from({length:total},(_,i)=>{
        const item={...fallback,gtinLevel,manualItf14:"",_row:i+1};
        for(const key of keys) { const value=pickValue(lists[key],i,key==="manualItf14"?"":fallback[key]); item[key]=value==="-"?"":value; }
        return item;
      });
      return {lists,items,errors};
    }

    function pageRange(total) { const pageCount = Math.max(1, Math.ceil(total / BATCH_PAGE_SIZE)); currentBatchPage = Math.min(Math.max(currentBatchPage, 0), pageCount - 1); const start = currentBatchPage * BATCH_PAGE_SIZE; const end = Math.min(total, start + BATCH_PAGE_SIZE); return { start, end, pageCount }; }
    function visibleBatch() { const parsed = parseBatchItems(); const range = pageRange(parsed.items.length); return { ...parsed, ...range, selectedItems: parsed.items.slice(range.start, range.end) }; }
    function getPreviewData() { if (currentMode !== "batch") return collectData(); const { items } = parseBatchItems(); batchIndex = Math.min(Math.max(batchIndex, 0), Math.max(0, items.length - 1)); return items[batchIndex] || {...collectData(),gtin13:"",manualItf14:""}; }
    // Short file names (≤70 chars) to avoid ZIP extraction errors on Windows.
    // Lead code = the actual barcode number for that level:
    //   Lv2/Lv3/Lv4 → ITF-14 (14 digits, indicator-prefixed)
    //   EAN-13 / EAN-13 TH/EN → GTIN-13 / EAN-13 (13 digits)
    function codeForName(data) {
      if (isEan13Mode(data.gtinLevel)) {
        let ean = onlyDigits(data.gtin13);
        try { ean = normalizeEAN13(data.gtin13).value; } catch (e) {}
        return ean || "0000000000000";
      }
      // GTIN levels → ITF-14
      let itf = onlyDigits(data.manualItf14);
      if (itf.length !== 14) { try { itf = getITF14(data).value; } catch (e) { itf = "00000000000000"; } }
      return itf;
    }
    function shortSubtitle(data, maxLen = 28) {
      const s = safe(isEan13ThenMode(data.gtinLevel)?data.ean13ThenEnName:(data.subtitle || ""));
      return s.slice(0, maxLen).replace(/_+$/, "");
    }
    function levelTag(data) {
      if (isEan13ThenMode(data.gtinLevel)) return "EAN13TH";
      if (isEan13Mode(data.gtinLevel)) return "EAN13";
      return `Lv${safe(data.gtinLevel)}`;
    }
    function makeBaseName(data = getPreviewData()) {
      // EAN-13 barcode-only: code + tag (no subtitle)
      if (isEan13Mode(data.gtinLevel) && !isEan13ThenMode(data.gtinLevel)) {
        return `${codeForName(data)}_EAN13`;
      }
      // EAN-13 TH/EN + all GTIN levels: code + short product name + level tag
      const sub = shortSubtitle(data);
      const base = sub ? `${codeForName(data)}_${sub}_${levelTag(data)}` : `${codeForName(data)}_${levelTag(data)}`;
      return base;
    }
    function makeZipName(firstItem, start, end, count, ext) {
      const range = `${String(start + 1).padStart(3, "0")}-${String(end).padStart(3, "0")}`;
      return `${makeBaseName(firstItem)}_X${count}_${range}.zip`;
    }

    function encodeITF14Rects(value, options = {}) {
      const digits = onlyDigits(value); if (digits.length !== 14) throw new Error("ITF-14 ต้องมี 14 หลัก");
      const patterns = { "0":"nnwwn", "1":"wnnnw", "2":"nwnnw", "3":"wwnnn", "4":"nnwnw", "5":"wnwnn", "6":"nwwnn", "7":"nnnww", "8":"wnnwn", "9":"nwnwn" };
      const x = options.x ?? 24.5, y = options.y ?? 48.21, height = options.height ?? 16.53, maxWidth = options.width ?? 123.55, wideRatio = options.wideRatio ?? 2.55;
      const sequence = []; const addBar = (size) => sequence.push({ type:"bar", size }); const addSpace = (size) => sequence.push({ type:"space", size }); const sizeOf = (char) => char === "w" ? wideRatio : 1;
      addBar(1); addSpace(1); addBar(1); addSpace(1);
      for (let i = 0; i < digits.length; i += 2) { const barPattern = patterns[digits[i]], spacePattern = patterns[digits[i + 1]]; for (let j = 0; j < 5; j++) { addBar(sizeOf(barPattern[j])); addSpace(sizeOf(spacePattern[j])); } }
      addBar(wideRatio); addSpace(1); addBar(1); const unit = maxWidth / sequence.reduce((sum, item) => sum + item.size, 0); let cursor = x, rects = "";
      for (const item of sequence) { const width = item.size * unit; if (item.type === "bar") rects += `<rect class="black" x="${cursor.toFixed(2)}" y="${y}" width="${width.toFixed(2)}" height="${height}"/>`; cursor += width; }
      return rects;
    }

    // ============ EAN-13 ENCODING ============
    const EAN13_L = { "0":"0001101","1":"0011001","2":"0010011","3":"0111101","4":"0100011","5":"0110001","6":"0101111","7":"0111011","8":"0110111","9":"0001011" };
    const EAN13_G = { "0":"0100111","1":"0110011","2":"0011011","3":"0100001","4":"0011101","5":"0111001","6":"0000101","7":"0010001","8":"0001001","9":"0010111" };
    const EAN13_R = { "0":"1110010","1":"1100110","2":"1101100","3":"1000010","4":"1011100","5":"1001110","6":"1010000","7":"1000100","8":"1001000","9":"1110100" };
    const EAN13_PARITY = { "0":"LLLLLL","1":"LLGLGG","2":"LLGGLG","3":"LLGGGL","4":"LGLLGG","5":"LGGLLG","6":"LGGGLL","7":"LGLGLG","8":"LGLGGL","9":"LGGLGL" };

    // Normalize EAN-13 input: if 12 digits, auto-append check digit; if 13, validate.
    function normalizeEAN13(input) {
      const digits=onlyDigits(input);
      if (!/^\d{12,13}$/.test(digits)) throw new Error("EAN-13 ต้องเป็นตัวเลข 12 หรือ 13 หลัก");
      if(digits.length===12) return {value:digits+calcCheckDigit(digits),source:"auto",valid:true};
      if(!isValidGtin(digits,13)) throw new Error(`EAN-13 Check Digit ไม่ถูกต้อง ควรเป็น ${calcCheckDigit(digits.slice(0,-1))}`);
      return {value:digits,source:"manual",valid:true};
    }
    // Build EAN-13 bit pattern (95 modules).

    function ean13Bits(digits) {
      if (digits.length !== 13) throw new Error("EAN-13 ต้องมี 13 หลัก");
      const first = digits[0], left = digits.substr(1, 6), right = digits.substr(7, 6);
      let bits = "101";
      const par = EAN13_PARITY[first];
      for (let i = 0; i < 6; i++) bits += par[i] === "L" ? EAN13_L[left[i]] : EAN13_G[left[i]];
      bits += "01010";
      for (let i = 0; i < 6; i++) bits += EAN13_R[right[i]];
      bits += "101";
      return bits;
    }

    // Encode EAN-13 to SVG rects with proper guard bar extensions
    // params: { x, y, height, moduleWidth, guardExtraHeight }
    function encodeEAN13Rects(digits, options = {}) {
      const bits = ean13Bits(digits);
      const x = options.x ?? 0, y = options.y ?? 0;
      const height = options.height ?? 10;
      const moduleWidth = options.moduleWidth ?? 0.33;
      const guardExtra = options.guardExtraHeight ?? 1.0; // guard bars extend below

      // Guard positions (in bit index):
      // Start guard: bits 0-2 (3 modules)
      // Center guard: bits 45-49 (5 modules)
      // End guard: bits 92-94 (3 modules)
      function isGuard(i) {
        return (i >= 0 && i <= 2) || (i >= 45 && i <= 49) || (i >= 92 && i <= 94);
      }

      let rects = "";
      for (let i = 0; i < bits.length; i++) {
        if (bits[i] === "1") {
          const bx = x + i * moduleWidth;
          const bh = isGuard(i) ? height + guardExtra : height;
          rects += `<rect class="black" x="${bx.toFixed(3)}" y="${y.toFixed(3)}" width="${moduleWidth.toFixed(3)}" height="${bh.toFixed(3)}"/>`;
        }
      }
      return rects;
    }

    // Build EAN-13 mini label SVG (barcode + 13-digit text at bottom)
    // Layout: 70mm wide x 20mm tall
    // Reference layout: bars centered with first digit ("8") OUTSIDE on left, then "851907" centered under left bars, then "346522" centered under right bars
    function ean13LabelSvg(data) {
      // Normalize input
      let result;
      try { result = normalizeEAN13(data.gtin13); }
      catch (error) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 20" width="100%" height="auto"><text x="35" y="11" font-family="Arial,Helvetica,sans-serif" font-size="2.5" text-anchor="middle" fill="#888">EAN-13: ${esc(error.message)}</text></svg>`;
      }
      const digits = result.value;
      const g = ean13Geometry();
      const bars = encodeEAN13Rects(digits, {
        x: g.barcodeX, y: g.barcodeY, height: g.barcodeH, moduleWidth: g.moduleW, guardExtraHeight: g.guardExtra
      });
      // Layout matches reference: 7 digits + 6 digits below bars, NO first digit on left
      // Group 1 = digits[0..6] = "8851907" (7 chars, right-aligned to center guard)
      // Group 2 = digits[7..12] = "346522" (6 chars, centered under right bars)
      const leftGroup = digits.substr(0, 7);
      const rightGroup = digits.substr(7, 6);
      // Left group: right-aligned at center guard end (module 50)
      const leftGroupEndX = g.barcodeX + 44 * g.moduleW;
      // Right group: centered under right data area (modules 50-91, center at module 70.5)
      const rightGroupCenterX = g.barcodeX + 70.5 * g.moduleW;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.labelW} ${g.labelH}" width="100%" height="auto">
        <style>.black{fill:#231f20}.ean-num{fill:#231f20;font-family:"CS PraJad Embedded",sans-serif;font-size:${g.textFontSize}px;font-weight:400;letter-spacing:0.18mm}.ean-num-end{text-anchor:end}.ean-num-mid{text-anchor:middle}</style>
        ${bars}
        <text class="ean-num ean-num-end" x="${leftGroupEndX.toFixed(3)}" y="${g.textY.toFixed(3)}">${leftGroup}</text>
        <text class="ean-num ean-num-mid" x="${rightGroupCenterX.toFixed(3)}" y="${g.textY.toFixed(3)}">${rightGroup}</text>
      </svg>`;
    }
    // Shared geometry for EAN-13 barcode-only (70×20 mm)
    function ean13Geometry() {
      const labelW = 70, labelH = 20;
      const barcodeW = 60;
      const moduleW = barcodeW / 95;
      const barcodeH = 11;
      const guardExtra = 1.5;
      const barcodeX = (labelW - barcodeW) / 2;
      const barcodeY = 2.5;
      const textFontSize = 4.2;
      const textY = barcodeY + barcodeH + guardExtra + 3.6;
      return { labelW, labelH, barcodeW, moduleW, barcodeH, guardExtra, barcodeX, barcodeY, textFontSize, textY };
    }
    // Geometry for EAN-13 TH/EN (80×34 mm) — derived from user's reference SVG
    // The reference SVG had viewBox 227.27×139.9 with outer frame at (0.25, 11.41) extent 226.77×94.78
    // Scaling that frame to 80mm wide gives 33.44mm tall — fits in 80×34mm target
    function ean13ThenGeometry() {
      const labelW = 80, labelH = 34;
      // Outer frame border (encloses EN + TH + barcode + numbers, just like reference)
      const frameX = 0;
      const frameY = 0;
      const frameW = 80;
      const frameH = 33.44;            // exact scaled value from reference (94.78 × 0.3528)
      const frameStroke = 0.18;        // scaled from 0.5 in reference (0.5 × 0.3528)
      // Inner barcode container (rounded rect with thicker border)
      const bcContX = 2.91;            // (8.49 - 0.25) × 0.3528
      const bcContY = 13.37;           // (49.31 - 11.41) × 0.3528
      const bcContW = 74.16;           // 210.22 × 0.3528
      const bcContH = 13.33;           // 37.78 × 0.3528
      const bcContStroke = 0.37;       // 1.04 × 0.3528
      // Barcode bars — fit EXACTLY inside container (no overflow beyond bottom of container)
      const barsY = bcContY;
      const barsH = bcContH;
      // No guard extension — container border defines the boundary
      const guardExtra = 0;
      // Bars X start (inside container, with left padding for left-side white space like reference)
      const barsX = 11.74;             // (33.28 - 0.25) × 0.3528 — gives same proportion as reference
      const barsW = 58.83;             // (200.16 - 33.28) × 0.3528
      const moduleW = barsW / 95;      // ~0.619 mm/module
      // EN and TH text
      const enFontSize = 4.0;          // approx 12 ref-units × scale, adjusted for legibility
      const enBaselineY = 6.56;        // (30 - 11.41) × 0.3528
      const thFontSize = 4.2;          // slightly larger as in reference (TH is bigger)
      const thBaselineY = 12.20;       // (46 - 11.41) × 0.3528
      // Numbers below barcode (inside the frame, below container)
      const numFontSize = 3.7;         // approx 10.5 ref-units × scale
      const numBaselineY = 31.61;      // (101 - 11.41) × 0.3528
      return {
        labelW, labelH,
        frameX, frameY, frameW, frameH, frameStroke,
        bcContX, bcContY, bcContW, bcContH, bcContStroke,
        barsX, barsY, barsW, barsH, moduleW, guardExtra,
        enFontSize, enBaselineY,
        thFontSize, thBaselineY,
        numFontSize, numBaselineY
      };
    }

    // EAN-13 TH/EN label — matches user's reference SVG layout exactly
    // Structure (top to bottom):
    //   1. Outer thin black frame (around everything)
    //   2. EN product name (bold, large)
    //   3. TH product name (bold, slightly larger)
    //   4. Inner barcode container (thicker stroke)
    //   5. Barcode bars + guard bars extending below
    //   6. 13-digit number (manual text, centered under bars, inside frame)
    function ean13ThenLabelSvg(data) {
      let result;
      try { result = normalizeEAN13(data.gtin13); }
      catch (error) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 34" width="100%" height="auto"><text x="40" y="17" font-family="Arial,Helvetica,sans-serif" font-size="3" text-anchor="middle" fill="#888">EAN-13 TH/EN: ${esc(error.message)}</text></svg>`;
      }
      const digits = result.value;
      const g = ean13ThenGeometry();
      // Barcode bars (no text — drawn manually below)
      const bars = encodeEAN13Rects(digits, {
        x: g.barsX, y: g.barsY, height: g.barsH,
        moduleWidth: g.moduleW, guardExtraHeight: g.guardExtra
      });
      // Number display — drawn as one centered text under the barcode container
      // Insert spaces for readability: "8 851907 815387" (1+6+6 grouping)
      const numberDisplay = `${digits[0]}  ${digits.substr(1,6)}  ${digits.substr(7,6)}`;
      const enName = esc(data.ean13ThenEnName || "");
      const thName = esc(data.ean13ThenThName || "");
      const labelCx = g.labelW / 2;
      // Max text width — leave 2mm margin from each side of the frame
      const maxTextW = g.frameW - 4;
      // Estimate text widths (approximate: CS PraJad chars ~0.55 of font size for EN, ~0.50 for TH)
      const enEstW = enName.length * g.enFontSize * 0.55;
      const thEstW = thName.length * g.thFontSize * 0.50;
      // Only apply textLength when text would overflow (shrink-to-fit, but never stretch)
      const enTL = enEstW > maxTextW ? ` textLength="${maxTextW}" lengthAdjust="spacingAndGlyphs"` : "";
      const thTL = thEstW > maxTextW ? ` textLength="${maxTextW}" lengthAdjust="spacingAndGlyphs"` : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.labelW} ${g.labelH}" width="100%" height="auto">
        <style>
          .ean13then-en{fill:#231f20;font-family:"CS PraJad Embedded","CS PraJad",sans-serif;font-size:${g.enFontSize}px;font-weight:700;text-anchor:middle}
          .ean13then-th{fill:#231f20;font-family:"CS PraJad Embedded","CS PraJad",sans-serif;font-size:${g.thFontSize}px;font-weight:700;text-anchor:middle}
          .ean13then-num{fill:#231f20;font-family:"CS PraJad Embedded","CS PraJad",sans-serif;font-size:${g.numFontSize}px;font-weight:400;text-anchor:middle;letter-spacing:0.4mm}
          .black{fill:#231f20}
        </style>
        <rect x="${g.frameX}" y="${g.frameY}" width="${g.frameW}" height="${g.frameH}" fill="none" stroke="#231f20" stroke-width="${g.frameStroke}"/>
        <text class="ean13then-en" x="${labelCx}" y="${g.enBaselineY}"${enTL}>${enName}</text>
        <text class="ean13then-th" x="${labelCx}" y="${g.thBaselineY}"${thTL}>${thName}</text>
        <rect x="${g.bcContX}" y="${g.bcContY}" width="${g.bcContW}" height="${g.bcContH}" fill="none" stroke="#231f20" stroke-width="${g.bcContStroke}"/>
        ${bars}
        <text class="ean13then-num" x="${labelCx}" y="${g.numBaselineY}">${numberDisplay}</text>
      </svg>`;
    }

    function labelSvg(data) {
      // Route to EAN-13 TH/EN label
      if (isEan13ThenMode(data.gtinLevel)) {
        return ean13ThenLabelSvg(data).replace('<svg ', '<svg id="label-svg" ');
      }
      // Route to EAN-13 barcode-only label
      if (isEan13Mode(data.gtinLevel)) {
        return ean13LabelSvg(data).replace('<svg ', '<svg id="label-svg" ');
      }
      let itf = { value:"00000000000000", valid:false }, barcodeRects = ""; try { itf = getITF14(data); barcodeRects = encodeITF14Rects(itf.value); } catch (error) {}
      const topBarcodeText = `${onlyDigits(data.gtin13)} x ${esc(data.qty)}`;
      // Lv2 omits the large title row but keeps subtitle + thai
      const isLv2 = String(data.gtinLevel) === "2";
      const titleEl = isLv2 ? "" : `<text class="title center-title" x="86.27" y="15.92" textLength="155" lengthAdjust="spacingAndGlyphs">${esc(data.title)}</text>`;
      // Lv2 uses a shorter frame on top (no empty space where title used to be).
      // Outer frame: top edge moved from y=0.95 down to y=15.00; bottom edge stays at 100.17.
      const framePath = isLv2
        ? `M172.54,100.17H0V15.00h172.54v85.17ZM.76,99.42h171.02V15.75H.76v83.67Z`
        : `M172.54,100.17H0V.95h172.54v99.21ZM.76,99.42h171.02V1.7H.76v97.72Z`;
      return `<svg id="label-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 172.54 123.01" width="100%" height="auto"><defs><style>.black{fill:#231f20}.title,.subtitle,.thai,.bold-small,.barcode-text{fill:#231f20;font-family:"Angsana New Embedded","Angsana New","Times New Roman",serif;font-weight:700}.title{font-size:22.16px;letter-spacing:-.02em}.subtitle{font-size:10.5px;letter-spacing:-.02em}.thai{font-size:9.75px}.small{fill:#231f20;font-family:"Angsana New Embedded","Angsana New","Times New Roman",serif;font-size:11.45px}.bold-small{font-size:11.45px}.table-header{text-anchor:middle}.barcode-text{font-size:13.5px;letter-spacing:.05em}.top-barcode-text{fill:#231f20;font-family:"Angsana New Embedded","Angsana New","Times New Roman",serif;font-size:11.25px;text-anchor:end}.center-title,.center-subtitle,.center-thai{text-anchor:middle;dominant-baseline:alphabetic}.table-value{text-anchor:middle}</style></defs><path class="black" d="${framePath}"/>${titleEl}<text class="subtitle center-subtitle" x="86.27" y="25.56" textLength="152" lengthAdjust="spacingAndGlyphs">${esc(data.subtitle)}</text><text class="thai center-thai" x="86.27" y="35.62" textLength="135" lengthAdjust="spacingAndGlyphs">${esc(data.thaiName)}</text><text class="top-barcode-text" x="148.05" y="44.26">${topBarcodeText}</text><path class="black" d="M164.4,66.05H8.14v-19.16h156.26v19.16ZM9.5,64.74h153.55v-16.53H9.5v16.53Z"/><g id="barcode-bars">${barcodeRects}</g><text class="barcode-text" transform="translate(7.49 74.88)">${esc(itf.value)}</text><text class="small table-header" x="31.135" y="84.50">LOCATION</text><text class="small table-header" x="66.025" y="84.50">QTY</text><text class="small table-header" x="98.330" y="84.50">G.W.(Kg)</text><text class="small table-header" x="141.860" y="84.50">LOT NO.</text><path class="black" d="M164.55,93.9H7.71v-16.74h156.84v16.74ZM8.23,93.39h155.78v-15.71H8.23v15.71Z"/><rect class="black" x="54.56" y="77.43" width=".53" height="16.22"/><rect class="black" x="77.49" y="77.43" width=".53" height="16.22"/><rect class="black" x="119.17" y="77.43" width=".53" height="16.22"/><text class="bold-small table-value" x="31.135" y="92.11">${esc(data.location)}</text><text class="bold-small table-value" x="66.025" y="92.11">${esc(data.qty)}</text><text class="bold-small table-value" x="98.330" y="92.11">${esc(data.grossWeight)}</text><text class="bold-small table-value" x="141.860" y="92.11">${esc(data.lotNo)}</text></svg>`;
    }
    // Accept plain quantities and correctly grouped thousands; keep the entered label text.
    const quantityPattern = /^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/;
    function validateData(data) {
      const issues=[];
      try { if(isEan13Mode(data.gtinLevel)) normalizeEAN13(data.gtin13); else {if(!isValidGtin(data.gtin13,13)) issues.push("GTIN-13 ต้องมี 13 หลักและ Check Digit ถูกต้อง"); getITF14(data);} } catch(e) {issues.push(e.message);}
      if(isEan13ThenMode(data.gtinLevel)) {if(!String(data.ean13ThenEnName||"").trim()) issues.push("กรอกชื่อสินค้า EN");if(!String(data.ean13ThenThName||"").trim()) issues.push("กรอกชื่อสินค้า TH");}
      if(!isEan13Mode(data.gtinLevel)) {if(!quantityPattern.test(String(data.qty).trim())) issues.push("QTY ต้องเป็นจำนวนเต็มมากกว่า 0 เช่น 1200 หรือ 1,200");if(String(data.grossWeight).trim() && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(data.grossWeight).trim())) issues.push("G.W. ต้องเป็นตัวเลขไม่ติดลบ หรือเว้นว่าง");}
      return issues;
    }
    function assertValid(data) { const issues=validateData(data); if(issues.length) throw new Error(issues.join(" • ")); return data; }
    function setStatus(kind,title,detail="") {byId("status").className=`status ${kind}`;byId("status").innerHTML=`<strong>${esc(title)}</strong>${esc(detail)}`;}
    function updateStatus(data) {const issues=validateData(data);if(issues.length){setStatus("bad","ตรวจสอบข้อมูล",issues.join(" • "));return;}const size=getPrintSize(data.gtinLevel),code=isEan13Mode(data.gtinLevel)?normalizeEAN13(data.gtin13).value:getITF14(data).value;setStatus("ok","พร้อมส่งออก",`${code} • ${size.w} × ${size.h} mm${!isEan13Mode(data.gtinLevel)&&data.manualItf14?" • ใช้ Manual ITF-14 (ไม่คำนวณทับ)":""}`);}
    function renderLabel(data) {
      updateStatus(data);
      const size=getPrintSize(data.gtinLevel); byId("previewSize").textContent=`${levelTag(data)} • ${size.w} × ${size.h} mm • QTY ไม่ใช่จำนวนสำเนาพิมพ์`;
      if(validateData(data).length){byId("label-container").innerHTML='<p class="note">แก้ข้อมูลที่แจ้งเตือนเพื่อแสดงฉลากและส่งออก</p>';return;}
      if(!fontsReady){byId("label-container").innerHTML='<p class="note">กำลังเตรียมฟอนต์สำหรับ Preview…</p>';return;}
      try {byId("label-container").innerHTML=buildPhysicalSVG(data,true);}catch(e){setStatus("bad","สร้าง Preview ไม่สำเร็จ",e.message);}
    }
    function updateBatchControls() {
      const parsed=parseBatchItems(), total=parsed.items.length, range=pageRange(total), visibleItems=parsed.items.slice(range.start,range.end);
      const toolbar=byId("previewToolbar"),thumbs=byId("batchThumbs");
      toolbar.classList.toggle("active",currentMode==="batch");thumbs.classList.toggle("active",currentMode==="batch");if(currentMode!=="batch")return;
      batchIndex=Math.min(Math.max(batchIndex,range.start),Math.max(range.start,range.end-1));
      byId("previewCounter").textContent=total?`Preview ${batchIndex+1} / ${total} | ชุด ${range.start+1}–${range.end}`:"ยังไม่มีรายการ";
      byId("prevBatchBtn").disabled=batchIndex<=0;byId("nextBatchBtn").disabled=batchIndex>=total-1;byId("prevBatchPageBtn").disabled=range.start<=0;byId("nextBatchPageBtn").disabled=range.end>=total;
      byId("batchCounts").textContent=`${total} รายการ • ชุดละ ${BATCH_PAGE_SIZE} • ${Object.entries(parsed.lists).map(([k,v])=>`${BATCH_FIELDS[k][1]}: ${v.length}`).join(" | ")}`;
      const rowErrors=parsed.items.flatMap((item,i)=>validateData(item).map(e=>`แถว ${i+1}: ${e}`));
      byId("batchErrors").textContent=[...parsed.errors,...rowErrors].slice(0,30).join("\n")+(rowErrors.length>30?"\nยังมีข้อผิดพลาดเพิ่มเติม…":"");
      thumbs.innerHTML=visibleItems.map((item,offset)=>{const index=range.start+offset,issues=validateData(item);const code=issues.length?"ตรวจสอบข้อมูล":codeForName(item);return `<button class="thumb-btn ${index===batchIndex?"active":""}" type="button" onclick="selectBatchItem(${index})">#${index+1}${item.gtinLevel==="ean13"?"":`<span>${esc(isEan13ThenMode(item.gtinLevel)?item.ean13ThenEnName:item.subtitle)}</span>`}<span>${esc(code)}</span><span class="pill">${issues.length?"ข้อมูลไม่ครบ/ไม่ถูกต้อง":levelTag(item)}</span></button>`;}).join("");
    }

    let lastBatchIndicator = "3";
    const batchFormats = document.querySelectorAll('input[name="batchFormat"]');
    for (const radio of batchFormats) radio.addEventListener("change", () => {
      if (!radio.checked) return;
      byId("batchGtinLevel").value = radio.value === "itf" ? lastBatchIndicator : radio.value;
      batchIndex = 0;
      currentBatchPage = 0;
    });
    function updateEan13UI() {
      const levelSingle = byId("gtinLevel").value;
      const levelBatch  = byId("batchGtinLevel").value;
      const isEanSingle     = isEan13Mode(levelSingle);
      const isEanThenSingle = isEan13ThenMode(levelSingle);
      const isEanBatch      = isEan13Mode(levelBatch);
      if (!isEanBatch) lastBatchIndicator = levelBatch;
      for (const radio of batchFormats) radio.checked = radio.value === (isEanBatch ? levelBatch : "itf");
      document.querySelectorAll(".ean13-hide-single").forEach((el) => {
        el.classList.toggle("hidden", isEanSingle);
      });
      const thenFields = byId("ean13ThenFields");
      if (thenFields) thenFields.classList.toggle("hidden", !isEanThenSingle);
      document.querySelectorAll(".ean13-hide-batch").forEach((el) => {
        el.classList.toggle("hidden", isEanBatch);
      });
      const helpSingle = byId("ean13Help");
      if (helpSingle) helpSingle.classList.toggle("hidden", isEanThenSingle || !isEanSingle);
      const helpThen = byId("ean13ThenHelp");
      if (helpThen) helpThen.classList.toggle("hidden", !isEanThenSingle);
      const helpBatch = byId("ean13HelpBatch");
      if (helpBatch) {helpBatch.classList.toggle("hidden", !isEanBatch);helpBatch.textContent=isEan13ThenMode(levelBatch)?"EAN-13 TH/EN Batch — กรอก GTIN และชื่อทั้งสองภาษา ขนาด 80 × 34 mm":"วางเลขจาก Excel หนึ่งรหัสต่อบรรทัด ใส่ 12 หลักเพื่อคำนวณหลักตรวจสอบ หรือ 13 หลักเพื่อตรวจรหัส • ฉลาก 70 × 20 mm";} byId("batchThenFields").classList.toggle("hidden",!isEan13ThenMode(levelBatch));
    }
    function update() { if(exportBusy)return; outlinedCache.clear();updateEan13UI();updateBatchControls();renderLabel(getPreviewData());updateExportButtons(); }
    function setMode(mode) {
      const previousMode = currentMode;
      currentMode = mode === "batch" ? "batch" : "single";
      if (previousMode !== currentMode) {
        const batch = byId("batchGtinLevel"), single = byId("gtinLevel");
        if (currentMode === "batch") batch.value = single.value;
        else single.value = batch.value;
      }
      byId("singleModeBtn").setAttribute("aria-pressed", String(currentMode === "single"));
      byId("batchModeBtn").setAttribute("aria-pressed", String(currentMode === "batch"));
      byId("singleModeBtn").classList.toggle("active", currentMode === "single");
      byId("batchModeBtn").classList.toggle("active", currentMode === "batch");
      byId("singleFormSection").classList.toggle("hidden", currentMode === "batch");
      byId("batchSection").classList.toggle("hidden", currentMode !== "batch");
      byId("singleActions").classList.toggle("hidden", currentMode !== "single");
      byId("batchActions").classList.toggle("hidden", currentMode !== "batch");
      update();
    }
    function selectBatchItem(index) { batchIndex = index; currentBatchPage = Math.floor(batchIndex / BATCH_PAGE_SIZE); update(); }
    function prevBatchItem() { selectBatchItem(Math.max(0, batchIndex - 1)); }
    function nextBatchItem() { const { items } = parseBatchItems(); selectBatchItem(Math.min(items.length - 1, batchIndex + 1)); }
    function prevBatchPage() { currentBatchPage = Math.max(0, currentBatchPage - 1); batchIndex = currentBatchPage * BATCH_PAGE_SIZE; update(); }
    function nextBatchPage() { const { items } = parseBatchItems(); const maxPage = Math.max(0, Math.ceil(items.length / BATCH_PAGE_SIZE) - 1); currentBatchPage = Math.min(maxPage, currentBatchPage + 1); batchIndex = currentBatchPage * BATCH_PAGE_SIZE; update(); }
    function loadSample() { Object.entries(sampleData).forEach(([key, value]) => { const el = byId(key); if (el) el.value = value; }); batchIndex = 0; currentBatchPage = 0; update(); }
    function loadBatchSample() {
      const level = byId(currentMode === "batch" ? "batchGtinLevel" : "gtinLevel").value;
      if (isEan13Mode(level)) {
        byId("batchGtin13List").value = batchSampleData.batchGtin13List;
        if (isEan13ThenMode(level)) {
          byId("batchEan13ThenEnNameList").value = batchSampleData.batchSubtitleList;
          byId("batchEan13ThenThNameList").value = batchSampleData.batchThaiNameList;
        }
      } else {
        for (const [key,value] of Object.entries(batchSampleData)) byId(key).value = value;
        byId("gtinLevel").value = "4";
        byId("batchGtinLevel").value = "4";
      }
      batchIndex = 0;
      currentBatchPage = 0;
      setMode("batch");
    }
    function loadEan13Sample() {
      byId("gtin13").value = ean13SampleData.gtin13;
      byId("gtinLevel").value = "ean13";
      byId("batchGtinLevel").value = "ean13";
      batchIndex = 0; currentBatchPage = 0;
      setMode("single");
      update();
    }
    function fillBatchFromCurrentForm() { const data = collectData(); byId("batchTitleList").value = data.title; byId("batchSubtitleList").value = data.subtitle; byId("batchThaiNameList").value = data.thaiName; byId("batchGtin13List").value = data.gtin13; byId("batchItf14List").value = data.manualItf14; byId("batchLocationList").value = data.location; byId("batchQtyList").value = data.qty; byId("batchGrossWeightList").value = data.grossWeight; byId("batchLotNoList").value = data.lotNo; byId("batchEan13ThenEnNameList").value=data.ean13ThenEnName;byId("batchEan13ThenThNameList").value=data.ean13ThenThName;batchIndex = 0; currentBatchPage = 0; setMode("batch"); }



    // V1.1: one physical SVG template for preview, raster, vector and print.
    let fontsReady = false, exportBusy = false;
    const outlinedCache = new Map();
    async function ensureFonts() {
      if (!window.opentype || !window.jspdf || !window.svg2pdf) throw new Error("โหลดไลบรารีไม่ครบ กรุณาแตก ZIP ทั้งโฟลเดอร์ก่อนเปิด index.html");
      await Promise.all([loadEmbeddedFont(), loadCSPraJadRegular(), loadCSPraJadBold(), document.fonts.ready]);
      fontsReady = true;
    }
    function outlineLabel(data,editable=false) {
      assertValid(data);
      if (!fontsReady) throw new Error("ฟอนต์ยังไม่พร้อม");
      const key=(editable?"editable:":"outline:")+JSON.stringify(data);
      if(outlinedCache.has(key)) return outlinedCache.get(key);
      const doc=new DOMParser().parseFromString(labelSvg(data),"image/svg+xml");
      if(doc.querySelector("parsererror")) throw new Error("สร้าง SVG ไม่สำเร็จ");
      const svg=document.importNode(doc.documentElement,true);
      svg.removeAttribute("id");
      // Resolve this template's simple class rules explicitly. This makes outline
      // geometry independent of the page's stylesheet, zoom and browser defaults.
      const rules=[];
      for(const sheet of svg.querySelectorAll("style")) for(const match of sheet.textContent.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declarations=Object.fromEntries(match[2].split(";").filter(x=>x.includes(":")).map(x=>{const i=x.indexOf(":");return [x.slice(0,i).trim(),x.slice(i+1).trim()];}));
        rules.push({selectors:match[1].split(",").map(x=>x.trim()),declarations});
      }
      {
        for(const node of Array.from(svg.querySelectorAll("text"))) {
          const style=Object.fromEntries(Array.from(node.attributes).map(a=>[a.name,a.value])),text=node.textContent;
          for(const rule of rules) if(rule.selectors.some(selector=>node.matches(selector)))Object.assign(style,rule.declarations);
          const size=parseFloat(style["font-size"])||12;
          const font=String(style["font-family"]||"").includes("CS PraJad")?(Number(style["font-weight"])>=600?__csPraJadBold:__csPraJadRegular):__embeddedFont;
          const spaceValue=style["letter-spacing"]||"0";
          const spacing=(parseFloat(spaceValue)||0)*(spaceValue.endsWith("em")?size:spaceValue.endsWith("mm")?96/25.4:1);
          const options={kerning:true,letterSpacing:spacing/size};
          const natural=font.getAdvanceWidth(text,size,options);
          let target=node.hasAttribute("textLength")?Number(node.getAttribute("textLength")):natural;
          const x=Number(node.getAttribute("x")||0),y=Number(node.getAttribute("y")||0);
          // Fit table text without changing the existing column geometry.
          if(node.classList.contains("table-header")||node.classList.contains("table-value")) {
            const widths={"31.135":43.85,"66.025":19.4,"98.33":38.15,"141.86":41.85};
            target=Math.min(target,widths[String(x)]||target);
          }
          if(node.classList.contains("ean13then-en")||node.classList.contains("ean13then-th"))target=Math.min(natural,76);
          const sx=natural>0?target/natural:1,anchor=style["text-anchor"]||"start";
          const dx=anchor==="middle"?-target/2:anchor==="end"?-target:0;
          if(editable) {
            node.setAttribute("textLength",String(target));node.setAttribute("lengthAdjust","spacingAndGlyphs");
            continue;
          }
          const path=document.createElementNS("http://www.w3.org/2000/svg","path");
          path.setAttribute("d",font.getPath(text,0,0,size,options).toPathData(4));
          path.setAttribute("fill",style.fill||"#231f20");
          path.setAttribute("transform",`${node.getAttribute("transform")||""} translate(${x+dx} ${y}) scale(${sx} 1)`);
          node.replaceWith(path);
        }
        // Inline bar colors before removing CSS to keep standalone SVG portable.
        for(const el of svg.querySelectorAll(".black")){el.setAttribute("fill","#231f20");el.removeAttribute("class");}
        if(!editable)svg.querySelectorAll("style").forEach(el=>el.remove());
        svg.querySelectorAll("[id]").forEach(el=>el.removeAttribute("id"));
        const result=new XMLSerializer().serializeToString(svg);
        if(outlinedCache.size>=120)outlinedCache.clear();
        outlinedCache.set(key,result);return result;
      }
    }
    function editableLabel(data){return outlineLabel(data,true);}
    function sourceSize(data) {return isEan13ThenMode(data.gtinLevel)?{w:80,h:34}:isEan13Mode(data.gtinLevel)?{w:70,h:20}:{w:LABEL_WIDTH_MM,h:LABEL_HEIGHT_MM};}
    function buildPhysicalSVG(data,outlined=true,background="transparent") {
      assertValid(data);
      const size=getPrintSize(data.gtinLevel),src=sourceSize(data);
      const fit=fitContain(src.w,src.h,size.w,size.h,isEan13Mode(data.gtinLevel)?0.5:1);
      let inner=outlined?outlineLabel(data):editableLabel(data);
      inner=inner.replace('width="100%" height="auto"',`width="${src.w}" height="${src.h}"`).replace(/ id="[^"]*"/g,"");
      const fontDefs=outlined?"":`<defs><style>${byId("embeddedFontStyles").textContent}</style></defs>`;
      const bg=background==="transparent"?"":`<rect width="${size.w}" height="${size.h}" fill="${background}"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.w} ${size.h}" width="${size.w}mm" height="${size.h}mm">${fontDefs}${bg}<g transform="translate(${fit.x} ${fit.y}) scale(${fit.scale})">${inner}</g></svg>`;
    }
    function buildExportSVGSource(data,background="transparent"){return buildPhysicalSVG(data,false,background);}
    function buildOutlinedExportSVG(data,font,background="transparent"){return buildPhysicalSVG(data,true,background);}
    function buildOutlinedLabelSVG(data,font,background="transparent"){return buildPhysicalSVG(data,true,background);}
    function getEditableSVGSource(data=getPreviewData()){return buildPhysicalSVG(data,false);}
    function batchForExport() {
      const batch=visibleBatch();
      const errors=[...batch.errors];
      if(!batch.selectedItems.length)errors.push("ไม่พบข้อมูลในชุดนี้");
      batch.selectedItems.forEach((item,i)=>validateData(item).forEach(e=>errors.push(`แถว ${batch.start+i+1}: ${e}`)));
      if(errors.length)throw new Error(errors.slice(0,12).join(" | "));
      return batch;
    }
    function updateExportButtons() {
      const singleBad=validateData(getPreviewData()).length>0 || (currentMode==="batch" && parseBatchItems().errors.length>0);
      let batchBad=false;try{batchForExport();}catch(e){batchBad=true;}
      document.querySelectorAll("#singleActions button").forEach(b=>b.disabled=exportBusy||!fontsReady||singleBad);
      document.querySelectorAll("#batchActions button").forEach(b=>b.disabled=exportBusy||!fontsReady||(b.getAttribute("onclick").includes("exportCurrentPreviewPDF")?singleBad:batchBad));
    }
    async function runExport(title,action) {
      if(exportBusy)return;
      exportBusy=true;
      const controls=Array.from(document.querySelectorAll("input,select,textarea,button"));
      const states=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
      setStatus("ok",title,"กำลังเตรียมไฟล์…");
      try {await ensureFonts();await action();}
      catch(e){setStatus("bad","ส่งออกไม่สำเร็จ",e.message);}
      finally{exportBusy=false;controls.forEach((el,i)=>el.disabled=states[i]);updateExportButtons();}
    }
    function downloadBlob(blob,filename) {
      if(!blob)throw new Error("ไม่มีข้อมูลไฟล์");
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    function svgToCanvas(data,dpi=300,background="transparent") {
      return new Promise((resolve,reject)=>{
        const size=getPrintSize(data.gtinLevel),pixelW=Math.round(size.w*dpi/25.4),pixelH=Math.round(size.h*dpi/25.4);
        const source=buildPhysicalSVG(data,true,background).replace(`width="${size.w}mm" height="${size.h}mm"`,`width="${pixelW}" height="${pixelH}"`);
        const url=URL.createObjectURL(new Blob([source],{type:"image/svg+xml;charset=utf-8"})),img=new Image();
        img.onload=()=>{try{const canvas=document.createElement("canvas");canvas.width=pixelW;canvas.height=pixelH;const ctx=canvas.getContext("2d");if(background!=="transparent"){ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas);}catch(e){reject(e);}finally{URL.revokeObjectURL(url);}};
        img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("แปลงภาพไม่สำเร็จ"));};img.src=url;
      });
    }
    function canvasToBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("สร้างไฟล์รูปภาพไม่สำเร็จ")),type,quality));}
    async function rasterBlob(data,type){
      const canvas=await svgToCanvas(data,300,type==="jpg"?"#ffffff":"transparent");
      const mime=type==="jpg"?"image/jpeg":"image/png",blob=await canvasToBlob(canvas,mime,.95);
      const bytes=new Uint8Array(await blob.arrayBuffer());
      // Set physical-resolution metadata instead of leaving Canvas's default 96 DPI.
      if(type==="jpg"){
        if(bytes[2]===0xff&&bytes[3]===0xe0&&String.fromCharCode(...bytes.slice(6,10))==="JFIF"){
          bytes[13]=1;bytes[14]=1;bytes[15]=44;bytes[16]=1;bytes[17]=44;
        }
        return new Blob([bytes],{type:mime});
      }
      const chunk=new Uint8Array(21),v=new DataView(chunk.buffer);v.setUint32(0,9);chunk.set([112,72,89,115],4);v.setUint32(8,Math.round(300/0.0254));v.setUint32(12,Math.round(300/0.0254));chunk[16]=1;v.setUint32(17,crc32(chunk.slice(4,17)));
      const parts=[bytes.slice(0,33),chunk];
      for(let pos=33;pos<bytes.length;){const len=new DataView(bytes.buffer,bytes.byteOffset+pos,4).getUint32(0);const type=String.fromCharCode(...bytes.slice(pos+4,pos+8));if(type!=="pHYs")parts.push(bytes.slice(pos,pos+12+len));pos+=12+len;}
      return new Blob(parts,{type:mime});
    }
    function downloadPNGPreview(){return runExport("กำลังสร้าง PNG",async()=>{const data={...assertValid(getPreviewData())};downloadBlob(await rasterBlob(data,"png"),`${makeBaseName(data)}.png`);setStatus("ok","ส่งออก PNG สำเร็จ","300 DPI • ขนาดตาม Level • พื้นหลังโปร่งใส");});}
    function downloadJPGPreview(){return runExport("กำลังสร้าง JPG",async()=>{const data={...assertValid(getPreviewData())};downloadBlob(await rasterBlob(data,"jpg"),`${makeBaseName(data)}.jpg`);setStatus("ok","ส่งออก JPG สำเร็จ","300 DPI • ขนาดตาม Level • พื้นหลังขาว");});}
    function downloadEditableSVG(){return runExport("กำลังสร้าง SVG Editable",async()=>{const data=assertValid(getPreviewData());downloadBlob(new Blob([getEditableSVGSource(data)],{type:"image/svg+xml"}),`${makeBaseName(data)}_edit.svg`);setStatus("ok","ส่งออก SVG Editable สำเร็จ","ฝังฟอนต์แล้ว สำหรับแก้ไข; แนะนำไฟล์ Outlined สำหรับส่งผลิต");});}
    function downloadOutlinedSVG(){return runExport("กำลังสร้าง SVG Outlined",async()=>{const data=assertValid(getPreviewData());downloadBlob(new Blob([buildPhysicalSVG(data,true)],{type:"image/svg+xml"}),`${makeBaseName(data)}.svg`);setStatus("ok","ส่งออก SVG Outlined สำเร็จ","ขนาดตาม Level • ตัวอักษรเป็น Path");});}
    function svgStringToElement(source){const doc=new DOMParser().parseFromString(source,"image/svg+xml");if(doc.querySelector("parsererror"))throw new Error("SVG ไม่สมบูรณ์");return doc.documentElement;}
    function exportSupplierPDF(){return runExport("กำลังสร้าง Supplier PDF",async()=>{
      if(currentMode==="batch" && parseBatchItems().errors.length)throw new Error(parseBatchItems().errors.join(" | "));
      const data=assertValid(getPreviewData()),size=getPrintSize(data.gtinLevel),{jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:size.w>size.h?"landscape":"portrait",unit:"mm",format:[size.w,size.h],compress:true});
      await pdf.svg(svgStringToElement(buildPhysicalSVG(data,true,"#ffffff")),{x:0,y:0,width:size.w,height:size.h});pdf.save(`${makeBaseName(data)}.pdf`);
      setStatus("ok","ส่งออก Supplier PDF สำเร็จ",`${size.w} × ${size.h} mm • Vector Outlined`);
    });}
    function exportCurrentPreviewPDF(){return exportSupplierPDF();}
    function downloadBatchZip(format){return runExport("กำลังสร้าง ZIP",async()=>{
      const {selectedItems,start,end}=batchForExport(),files=[],total=selectedItems.length;
      for(let i=0;i<total;i++){
        const data=selectedItems[i],ext=format==="svg_outlined"?"svg":format;
        const suffix=format==="svg"?"_edit":"";
        const name=`${makeBaseName(data)}${suffix}_${String(start+i+1).padStart(3,"0")}.${ext}`;
        const blob=format==="svg"||format==="svg_outlined"?new Blob([buildPhysicalSVG(data,format==="svg_outlined")],{type:"image/svg+xml"}):await rasterBlob(data,format);
        files.push({name,data:new Uint8Array(await blob.arrayBuffer())});setStatus("ok","กำลังสร้าง ZIP",`${i+1} / ${total}`);await new Promise(r=>setTimeout(r,0));
      }
      const filename=`${makeBaseName(selectedItems[0])}_${format}_${String(start+1).padStart(3,"0")}-${String(end).padStart(3,"0")}_X${total}.zip`;
      downloadBlob(makeZip(files),filename);setStatus("ok","ส่งออก ZIP สำเร็จ",`${total} ไฟล์ • รายการ ${start+1}–${end}`);
    });}
    function downloadBatchOutlinedSvgZip(){return downloadBatchZip("svg_outlined");}
    function paperSize(){const paper=byId("printPaperSize").value,orientation=byId("printOrientation").value,base=paper==="A3"?{w:297,h:420}:{w:210,h:297};return orientation==="landscape"?{w:base.h,h:base.w,paper,orientation}:{...base,paper,orientation};}
    function sheetLayout(level){const paper=paperSize(),cell=getPrintSize(level),gap=Number(byId("printGap").value),margin=5;
      const cols=Math.floor((paper.w-2*margin+gap)/(cell.w+gap)),rows=Math.floor((paper.h-2*margin+gap)/(cell.h+gap));
      if(cols<1||rows<1)throw new Error("ขนาดฉลากใหญ่กว่าพื้นที่พิมพ์");
      return {paper,cell,gap,margin,cols,rows,perPage:cols*rows};
    }
    function sheetItems(){if(currentMode==="batch")return batchForExport();return {selectedItems:[{...assertValid(collectData())}],start:0,end:1};}
    function exportPrintSheetPDF(){return runExport("กำลังสร้าง Print Sheet PDF",async()=>{
      const {selectedItems:items,start,end}=sheetItems(),layout=sheetLayout(items[0].gtinLevel),{paper,cell,gap,margin,cols,rows,perPage}=layout;
      const pdf=new window.jspdf.jsPDF({orientation:paper.orientation,unit:"mm",format:paper.paper.toLowerCase(),compress:true});const pages=Math.ceil(items.length/perPage);
      for(let p=0;p<pages;p++){
        if(p)pdf.addPage(paper.paper.toLowerCase(),paper.orientation);
        const part=items.slice(p*perPage,(p+1)*perPage);
        for(let i=0;i<part.length;i++) await pdf.svg(svgStringToElement(buildPhysicalSVG(part[i],true,"#ffffff")),{x:margin+(i%cols)*(cell.w+gap),y:margin+Math.floor(i/cols)*(cell.h+gap),width:cell.w,height:cell.h});
        setStatus("ok","กำลังสร้าง Print Sheet PDF",`หน้า ${p+1} / ${pages}`);await new Promise(r=>setTimeout(r,0));
      }
      pdf.save(`Sheet_${paper.paper}_${levelTag(items[0])}_${cell.w}x${cell.h}_${start+1}-${end}.pdf`);
      setStatus("ok","ส่งออก Print Sheet PDF สำเร็จ",`${items.length} ฉลาก • ${pages} หน้า • ${cols} × ${rows} ใบ/หน้า • Gap ${gap} mm`);
    });}
    function printCurrentSetSheet(){return runExport("กำลังเตรียม Browser Print",async()=>{
      const {selectedItems:items}=sheetItems(),{paper,cell,gap,margin,cols,perPage}=sheetLayout(items[0].gtinLevel),pages=[];
      for(let i=0;i<items.length;i+=perPage)pages.push(items.slice(i,i+perPage));
      byId("printSheetRoot").innerHTML=pages.map(page=>`<div class="sheet-page" style="width:${paper.w}mm;height:${paper.h}mm;padding:${margin}mm;display:grid;grid-template-columns:repeat(${cols},${cell.w}mm);grid-auto-rows:${cell.h}mm;gap:${gap}mm;align-content:start;justify-content:start">${page.map(item=>buildPhysicalSVG(item,true,"#ffffff")).join("")}</div>`).join("");
      const oldTitle=document.title,oldRule=byId("printPageStyle").textContent;
      document.title=`Sheet_${paper.paper}_${levelTag(items[0])}`;document.body.classList.add("print-sheet");byId("printPageStyle").textContent=`@page{size:${paper.w}mm ${paper.h}mm;margin:0}`;
      const cleanup=()=>{window.removeEventListener("afterprint",cleanup);document.body.classList.remove("print-sheet");document.title=oldTitle;byId("printPageStyle").textContent=oldRule;};
      try{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));window.addEventListener("afterprint",cleanup,{once:true});window.print();setStatus("ok","เปิดหน้าพิมพ์แล้ว","เลือก 100% / Actual Size และปิด Header/Footer");}catch(e){cleanup();throw e;}
    });}
    // Expose only the existing UI actions; no upload, analytics or server calls.
    Object.assign(window,{setMode,loadSample,loadBatchSample,loadEan13Sample,fillBatchFromCurrentForm,selectBatchItem,prevBatchItem,nextBatchItem,prevBatchPage,nextBatchPage,downloadPNGPreview,downloadJPGPreview,downloadEditableSVG,downloadOutlinedSVG,exportSupplierPDF,exportCurrentPreviewPDF,exportPrintSheetPDF,downloadBatchZip,downloadBatchOutlinedSvgZip,printCurrentSetSheet});
    let inputTimer;
    document.querySelectorAll("input,select,textarea").forEach(el=>{el.addEventListener("input",()=>{clearTimeout(inputTimer);inputTimer=setTimeout(update,120);});el.addEventListener("change",()=>{clearTimeout(inputTimer);update();});});
    loadSample();
    if (new URLSearchParams(location.search).get("mode") === "batch") setMode("batch");
    ensureFonts().then(update).catch(e=>setStatus("bad","เตรียมแอปไม่สำเร็จ",e.message));
