// JPEG scan data can be embedded unchanged in PDF. EXIF orientation lives in
// the APP1 metadata, so PDF consumers need a placement transform or an upright bitmap.
const JpegOrientation = (() => {
  function read(length, byte) {
    const be16 = offset => byte(offset) * 256 + byte(offset + 1);
    if (length < 4 || be16(0) !== 0xffd8) return 1;
    let pos = 2;
    while (pos + 4 <= length && byte(pos) === 255) {
      while (pos < length && byte(pos) === 255) pos++;
      const marker = byte(pos++);
      if (marker === 0xda || marker === 0xd9 || pos + 2 > length) break;
      const size = be16(pos), end = pos + size, base = pos + 8;
      if (size < 2 || end > length) break;
      if (marker === 0xe1 && size >= 22 && be16(pos+2) === 0x4578 &&
          be16(pos+4) === 0x6966 && be16(pos+6) === 0) {
        const order = be16(base), le = order === 0x4949;
        const u16 = i => le ? byte(i) + 256 * byte(i+1) : be16(i);
        const u32 = i => le ? u16(i) + 65536*u16(i+2) : 65536*u16(i) + u16(i+2);
        if ((le || order === 0x4d4d) && u16(base+2) === 42) {
          const ifd = base + u32(base+4);
          if (ifd >= base+8 && ifd+2 <= end) {
            const entries = u16(ifd);
            for (let i=0; i<entries; i++) {
              const tag = ifd + 2 + 12*i;
              if (tag+12 > end) break;
              if (u16(tag) === 0x112 && u16(tag+2) === 3 && u32(tag+4) === 1) {
                const value = u16(tag+8);
                if (value >= 1 && value <= 8) return value;
              }
            }
          }
        }
      }
      pos = end;
    }
    return 1;
  }
  function fromDataURL(url) {
    if (!/^data:image\/jpe?g;base64,/i.test(url)) return 1;
    const start = url.indexOf(',')+1;
    // Decode only the metadata blocks accessed. Most JPEGs put EXIF first.
    const block = 12288;
    let cached = -1, data;
    return read(Math.floor((url.length-start)*.75), offset => {
      const index = Math.floor(offset/block);
      if (index !== cached) {
        const first = start + index*block/3*4;
        data = atob(url.slice(first,first+block/3*4)); cached=index;
      }
      return data.charCodeAt(offset%block);
    });
  }
  function uprightPNG(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img,0,0);
    const url = canvas.toDataURL('image/png');
    if (!url.startsWith('data:image/png;')) throw Error('สร้างภาพตามทิศทางต้นฉบับไม่สำเร็จ');
    return url;
  }
  return {fromBytes: bytes=>read(bytes.length,i=>bytes[i]), fromDataURL, uprightPNG};
})();
