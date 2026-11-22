// Store already-compressed PDF / image bytes directly. Set the UTF-8 filename
// flag in both headers so names survive extraction on another workstation.
const crcTable = Uint32Array.from({length:256}, (_, value) => {
  let crc = value;
  for (let bit=0; bit<8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const directory = [];
  const now = new Date();
  const time = (now.getHours()<<11) | (now.getMinutes()<<5) | (now.getSeconds()>>1);
  const date = ((now.getFullYear()-1980)<<9) | ((now.getMonth()+1)<<5) | now.getDate();
  let offset = 0;
  let directorySize = 0;

  for (const {name, data} of files) {
    const filename = encoder.encode(name);
    const local = new Uint8Array(30);
    const header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, crc32(data), true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, filename.length, true);
    localParts.push(local, filename, data);

    const item = new Uint8Array(46);
    const entry = new DataView(item.buffer);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    item.set(local.subarray(4), 6);
    entry.setUint32(42, offset, true);
    directory.push(item, filename);
    directorySize += item.length + filename.length;
    offset += local.length + filename.length + data.length;
  }

  const end = new Uint8Array(22);
  const record = new DataView(end.buffer);
  record.setUint32(0, 0x06054b50, true);
  record.setUint16(8, files.length, true);
  record.setUint16(10, files.length, true);
  record.setUint32(12, directorySize, true);
  record.setUint32(16, offset, true);
  return new Blob([...localParts, ...directory, end], {type:'application/zip'});
}
