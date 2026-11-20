    function onlyDigits(value) { return String(value ?? "").trim().replace(/[\s-]/g, ""); }
    function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
    function safe(value) { return String(value || "").trim().replace(/[\x00-\x1f\\/:*?"<>|()]+/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Product"; }
    function calcCheckDigit(value) { const digits = onlyDigits(value); if (!/^\d+$/.test(digits)) throw new Error("รหัสต้องเป็นตัวเลขเท่านั้น"); let sum = 0; for (let i=digits.length-1,p=0;i>=0;i--,p++) sum += Number(digits[i])*(p%2===0?3:1); return String((10-sum%10)%10); }
    function isValidGtin(value, length) { const digits=onlyDigits(value); return new RegExp(`^\\d{${length}}$`).test(digits) && calcCheckDigit(digits.slice(0,-1))===digits.slice(-1); }
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

