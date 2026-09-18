export type HuffNode = {
  freq: number;
  symbol?: number;
  left?: HuffNode;
  right?: HuffNode;
  id: number;
};

export type CodeRow = {
  symbol: number;
  frequency: number;
  probability: number;
  code: string;
};

export type CompressionStats = {
  originalBytes: number;
  archiveBytes: number;
  savedPercent: number;
  ratio: number;
  entropy: number;
  averageCodeLength: number;
  uniqueSymbols: number;
  encodedBits: number;
};

class MinHeap {
  private items: HuffNode[] = [];

  get size() { return this.items.length; }

  push(node: HuffNode) {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.items[p].freq <= this.items[i].freq) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }

  pop(): HuffNode {
    if (!this.items.length) throw new Error("Heap is empty");
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        const l = i * 2 + 1, r = l + 1;
        if (l < this.items.length && this.items[l].freq < this.items[smallest].freq) smallest = l;
        if (r < this.items.length && this.items[r].freq < this.items[smallest].freq) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

let nodeCounter = 0;

export function calculateFrequencies(data: Uint8Array): number[] {
  const freq = new Array<number>(256).fill(0);
  for (const b of data) freq[b]++;
  return freq;
}

export function buildHuffmanTree(freq: number[]): HuffNode | null {
  const heap = new MinHeap();
  nodeCounter = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) heap.push({ freq: freq[i], symbol: i, id: nodeCounter++ });
  }
  if (!heap.size) return null;
  if (heap.size === 1) return heap.pop();
  while (heap.size > 1) {
    const a = heap.pop(), b = heap.pop();
    heap.push({ freq: a.freq + b.freq, left: a, right: b, id: nodeCounter++ });
  }
  return heap.pop();
}

export function generateCodes(root: HuffNode | null): Map<number, string> {
  const codes = new Map<number, string>();
  if (!root) return codes;
  if (root.symbol !== undefined) {
    codes.set(root.symbol, "0");
    return codes;
  }
  const walk = (node: HuffNode, prefix: string) => {
    if (node.symbol !== undefined) {
      codes.set(node.symbol, prefix || "0");
      return;
    }
    if (node.left) walk(node.left, prefix + "0");
    if (node.right) walk(node.right, prefix + "1");
  };
  walk(root, "");
  return codes;
}

export function makeCodeRows(freq: number[], codes: Map<number, string>, total: number): CodeRow[] {
  const rows: CodeRow[] = [];
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) rows.push({
      symbol: i,
      frequency: freq[i],
      probability: total ? freq[i] / total : 0,
      code: codes.get(i) ?? ""
    });
  }
  return rows.sort((a,b) => b.frequency - a.frequency || a.symbol - b.symbol);
}

export function encodeData(data: Uint8Array, codes: Map<number, string>): { bytes: Uint8Array; bitCount: number } {
  let bitCount = 0;
  for (const b of data) bitCount += (codes.get(b) ?? "").length;
  const out = new Uint8Array(Math.ceil(bitCount / 8));
  let bitIndex = 0;
  for (const b of data) {
    const code = codes.get(b)!;
    for (const bit of code) {
      if (bit === "1") out[Math.floor(bitIndex / 8)] |= 1 << (7 - (bitIndex % 8));
      bitIndex++;
    }
  }
  return { bytes: out, bitCount };
}

export function decodeData(encoded: Uint8Array, root: HuffNode | null, originalSize: number): Uint8Array {
  if (!root || originalSize === 0) return new Uint8Array(0);
  if (root.symbol !== undefined) return new Uint8Array(originalSize).fill(root.symbol);
  const out = new Uint8Array(originalSize);
  let outIndex = 0, bitIndex = 0;
  let node = root;
  while (outIndex < originalSize) {
    const byte = encoded[Math.floor(bitIndex / 8)];
    const bit = (byte >> (7 - (bitIndex % 8))) & 1;
    node = bit === 0 ? node.left! : node.right!;
    bitIndex++;
    if (node.symbol !== undefined) {
      out[outIndex++] = node.symbol;
      node = root;
    }
    if (bitIndex > encoded.length * 8 + 1) throw new Error("Corrupted Huffman archive.");
  }
  return out;
}

function utf8Bytes(s: string) { return new TextEncoder().encode(s); }

export function createArchive(fileName: string, original: Uint8Array, freq: number[], encoded: Uint8Array, bitCount: number): Uint8Array {
  const name = utf8Bytes(fileName);
  if (name.length > 65535) throw new Error("File name is too long.");
  if (original.length > 0xFFFFFFFF) throw new Error("Files larger than 4 GB are not supported.");
  const padding = (8 - (bitCount % 8)) % 8;
  const headerSize = 5 + 2 + name.length + 4 + 4 * 256 + 1;
  const out = new Uint8Array(headerSize + encoded.length);
  const view = new DataView(out.buffer);
  let p = 0;
  out.set(new TextEncoder().encode("HUFF1"), p); p += 5;
  view.setUint16(p, name.length, true); p += 2;
  out.set(name, p); p += name.length;
  view.setUint32(p, original.length, true); p += 4;
  for (let i = 0; i < 256; i++) { view.setUint32(p, freq[i], true); p += 4; }
  out[p++] = padding;
  out.set(encoded, p);
  return out;
}

export function parseArchive(buffer: ArrayBuffer): { fileName: string; originalSize: number; freq: number[]; encoded: Uint8Array } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 5 + 2 + 4 + 1024 + 1) throw new Error("This file is too small to be a HuffZip archive.");
  const magic = new TextDecoder().decode(bytes.slice(0,5));
  if (magic !== "HUFF1") throw new Error("Invalid HuffZip archive: header not recognized.");
  let p = 5;
  const nameLen = view.getUint16(p, true); p += 2;
  if (p + nameLen + 4 + 1024 + 1 > bytes.length) throw new Error("Corrupted HuffZip header.");
  const fileName = new TextDecoder().decode(bytes.slice(p, p + nameLen)); p += nameLen;
  const originalSize = view.getUint32(p, true); p += 4;
  const freq: number[] = [];
  for (let i = 0; i < 256; i++) { freq.push(view.getUint32(p, true)); p += 4; }
  const padding = bytes[p++];
  if (padding > 7) throw new Error("Corrupted padding metadata.");
  return { fileName, originalSize, freq, encoded: bytes.slice(p) };
}

export function calculateStats(original: number, archive: number, freq: number[], codes: Map<number,string>, totalBits: number): CompressionStats {
  let entropy = 0, avg = 0, unique = 0, total = 0;
  for (const f of freq) total += f;
  for (let i=0;i<256;i++) {
    if (freq[i] > 0) {
      unique++;
      const p = freq[i] / total;
      entropy -= p * Math.log2(p);
      avg += p * (codes.get(i)?.length ?? 0);
    }
  }
  return {
    originalBytes: original,
    archiveBytes: archive,
    savedPercent: original ? ((original - archive) / original) * 100 : 0,
    ratio: archive ? original / archive : 0,
    entropy,
    averageCodeLength: avg,
    uniqueSymbols: unique,
    encodedBits: totalBits
  };
}

export function symbolLabel(n: number): string {
  if (n >= 32 && n <= 126) return `'${String.fromCharCode(n)}'`;
  const names: Record<number,string> = {9:"TAB",10:"LF",13:"CR",32:"SPACE"};
  return names[n] ?? `0x${n.toString(16).padStart(2,"0").toUpperCase()}`;
}

export function textHuffman(text: string) {
  const chars = [...text];
  const freq = new Map<string, number>();
  for (const c of chars) freq.set(c, (freq.get(c) ?? 0) + 1);
  const nodes: {freq:number; char?:string; left?:any; right?:any}[] = [...freq.entries()].map(([char,f])=>({char,freq:f}));
  if (!nodes.length) return { rows: [], root: null, encodedBits: 0, originalBits: 0, ratio: 0 };
  if (nodes.length === 1) {
    const only = nodes[0];
    return { rows:[{char:only.char!,freq:only.freq,code:"0"}],root:only,encodedBits:chars.length,originalBits:chars.length*8,ratio:chars.length?8:0 };
  }
  while(nodes.length>1) {
    nodes.sort((a,b)=>a.freq-b.freq || (a.char??"").localeCompare(b.char??""));
    const a=nodes.shift()!,b=nodes.shift()!;
    nodes.push({freq:a.freq+b.freq,left:a,right:b});
  }
  const root=nodes[0];
  const codeMap=new Map<string,string>();
  const walk=(n:any,p:string)=>{ if(n.char!==undefined){codeMap.set(n.char,p||"0");return;} walk(n.left,p+"0");walk(n.right,p+"1"); };
  walk(root,"");
  const rows=[...freq.entries()].map(([char,freq])=>({char,freq,code:codeMap.get(char)!})).sort((a,b)=>b.freq-a.freq);
  const encodedBits=chars.reduce((s,c)=>s+codeMap.get(c)!.length,0);
  return {rows,root,encodedBits,originalBits:chars.length*8,ratio:encodedBits?chars.length*8/encodedBits:0};
}