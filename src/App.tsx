import { useMemo, useRef, useState } from "react";
import {
  calculateFrequencies, buildHuffmanTree, generateCodes, makeCodeRows,
  encodeData, createArchive, parseArchive, decodeData, calculateStats,
  symbolLabel, textHuffman, type HuffNode
} from "./huffman";

type Tab = "compressor" | "lab" | "analytics" | "how" | "about";

function formatBytes(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB","MB","GB","TB"]; let x=n/1024, i=0;
  while(x>=1024 && i<units.length-1){x/=1024;i++;}
  return `${x.toFixed(x>=100?0:x>=10?1:2)} ${units[i]}`;
}
function pct(n:number){ return `${n.toFixed(2)}%`; }

function TreeSvg({node, maxDepth=7}: {node: HuffNode|null; maxDepth?:number}) {
  const leaves:any[]=[];
  const collect=(n:HuffNode|null,d:number)=>{if(!n)return;if(n.symbol!==undefined||d>=maxDepth){leaves.push({n,d});return;}collect(n.left??null,d+1);collect(n.right??null,d+1)};
  collect(node,0);
  const width=Math.max(760, leaves.length*100), height=Math.min(520,(maxDepth+1)*72+50);
  const positions=new Map<number,{x:number,y:number}>();
  const place=(n:HuffNode|null,d:number,x0:number,x1:number)=>{
    if(!n)return;
    const x=(x0+x1)/2,y=40+d*70; positions.set(n.id,{x,y});
    if(n.symbol===undefined&&d<maxDepth){place(n.left??null,d+1,x0,x);place(n.right??null,d+1,x,x1);}
  };
  place(node,0,0,width);
  const edges:any[]=[];
  const walk=(n:HuffNode|null,d:number)=>{
    if(!n||n.symbol!==undefined||d>=maxDepth)return;
    for(const [child,label] of [[n.left,"0"],[n.right,"1"]] as const){
      if(child){const a=positions.get(n.id),b=positions.get(child.id);if(a&&b)edges.push({a,b,label});walk(child,d+1);}
    }
  };
  walk(node,0);
  if(!node) return <div className="empty">Upload a file to generate its real Huffman tree.</div>;
  return <div className="tree-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Huffman tree">
    {edges.map((e,i)=><g key={i}><line x1={e.a.x} y1={e.a.y+18} x2={e.b.x} y2={e.b.y-18} className="tree-line"/><text x={(e.a.x+e.b.x)/2} y={(e.a.y+e.b.y)/2-4} className="edge-label">{e.label}</text></g>)}
    {[...positions.entries()].map(([id,p])=>{
      const find=(n:HuffNode|null):HuffNode|null=>{if(!n)return null;if(n.id===id)return n;return find(n.left??null)||find(n.right??null)};
      const n=find(node)!; const leaf=n.symbol!==undefined;
      return <g key={id}><circle cx={p.x} cy={p.y} r="19" className={leaf?"tree-node leaf":"tree-node"}/><text x={p.x} y={p.y+5} textAnchor="middle" className="tree-text">{leaf?symbolLabel(n.symbol!):n.freq}</text><text x={p.x} y={p.y+36} textAnchor="middle" className="freq-text">{n.freq}</text></g>
    })}
  </svg>{leaves.length*2>positions.size && <div className="tree-note">Large tree: visualization is capped at {maxDepth} levels for readability. The compression algorithm still processes all symbols.</div>}</div>;
}

function StatCard({label,value,sub}:{label:string,value:string,sub?:string}) {
  return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub&&<div className="stat-sub">{sub}</div>}</div>
}

function App(){
  const [tab,setTab]=useState<Tab>("compressor");
  const [file,setFile]=useState<File|null>(null);
  const [data,setData]=useState<Uint8Array|null>(null);
  const [freq,setFreq]=useState<number[]>([]);
  const [tree,setTree]=useState<HuffNode|null>(null);
  const [codes,setCodes]=useState<Map<number,string>>(new Map());
  const [archive,setArchive]=useState<Uint8Array|null>(null);
  const [stats,setStats]=useState<ReturnType<typeof calculateStats>|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const [drag,setDrag]=useState(false);
  const [query,setQuery]=useState("");
  const [demoText,setDemoText]=useState("data science makes information useful");
  const [presentation,setPresentation]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const decompRef=useRef<HTMLInputElement>(null);

  const rows=useMemo(()=>makeCodeRows(freq,codes,data?.length??0).filter(r=>!query || symbolLabel(r.symbol).toLowerCase().includes(query.toLowerCase()) || r.code.includes(query)),[freq,codes,data,query]);
  const demo=useMemo(()=>textHuffman(demoText),[demoText]);

  const loadFile=async(f:File)=>{
    setError(""); setBusy("Reading file…"); setArchive(null); setStats(null);
    try{
      if(f.size===0){setFile(f);setData(new Uint8Array());setFreq(new Array(256).fill(0));setTree(null);setCodes(new Map());setBusy("");return;}
      if(f.size>0xFFFFFFFF) throw new Error("Files larger than 4 GB are not supported.");
      const buf=await f.arrayBuffer(), bytes=new Uint8Array(buf), fr=calculateFrequencies(bytes), tr=buildHuffmanTree(fr), cm=generateCodes(tr);
      setFile(f);setData(bytes);setFreq(fr);setTree(tr);setCodes(cm);setBusy("");
    }catch(e){setBusy("");setError(e instanceof Error?e.message:"Could not read the file.");}
  };

  const compress=()=>{
    if(!file||!data){setError("Please choose a file first.");return;}
    if(data.length===0){setError("An empty file contains no symbols to encode. Choose a non-empty file.");return;}
    try{
      setBusy("Encoding with Huffman Coding…");
      const enc=encodeData(data,codes);
      const ar=createArchive(file.name,data,freq,enc.bytes,enc.bitCount);
      setArchive(ar);setStats(calculateStats(data.length,ar.length,freq,codes,enc.bitCount));setBusy("");
    }catch(e){setBusy("");setError(e instanceof Error?e.message:"Compression failed.");}
  };

  const download=(bytes:Uint8Array,name:string,mime="application/octet-stream")=>{
    const blob=new Blob([bytes.buffer],{type:mime}), url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
  };

  const handleDecompress=async(f:File)=>{
    setError("");setBusy("Checking HuffZip archive…");
    try{
      const parsed=parseArchive(await f.arrayBuffer());
      const tr=buildHuffmanTree(parsed.freq);
      const out=decodeData(parsed.encoded,tr,parsed.originalSize);
      download(out,parsed.fileName);
      setBusy(""); setTab("compressor");
    }catch(e){setBusy("");setError(e instanceof Error?e.message:"Decompression failed.");}
  };

  const reset=()=>{setFile(null);setData(null);setFreq([]);setTree(null);setCodes(new Map());setArchive(null);setStats(null);setError("");setBusy("");setQuery("");};

  const scrollTo=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"});

  return <div className="app">
    <div className="orb orb1"/><div className="orb orb2"/>
    <header className="header">
      <div className="brand" onClick={()=>setTab("compressor")}><div className="brand-mark"><span>0</span><span>1</span><i/></div><div><b>HUFF<span>ZIP</span></b><small>Compress • Analyze • Understand</small></div></div>
      <nav>{(["compressor","lab","analytics","how","about"] as Tab[]).map(t=><button className={tab===t?"nav active":"nav"} onClick={()=>setTab(t)} key={t}>{t==="lab"?"Huffman Lab":t[0].toUpperCase()+t.slice(1)}</button>)}</nav>
      <div className="header-actions"><span className="ready"><i/> Engine Ready</span><button className="presentation" onClick={()=>setPresentation(true)}>Presentation Mode</button></div>
    </header>

    {error&&<div className="toast error">⚠ {error}<button onClick={()=>setError("")}>×</button></div>}
    {busy&&<div className="toast busy"><span className="spinner"/> {busy}</div>}

    <main>
      {tab==="compressor" && <section>
        <div className="hero">
          <div className="hero-copy"><div className="eyebrow">LOSSLESS DATA COMPRESSION LAB</div><h1>Compress smarter.<br/><em>Understand the algorithm.</em></h1><p>An interactive Huffman Coding laboratory that analyzes your file, builds its real binary tree, encodes it and lets you recover the original data.</p><div className="hero-buttons"><button className="primary" onClick={()=>scrollTo("engine")}>Start Compressing →</button><button className="secondary" onClick={()=>setTab("lab")}>Explore Huffman Lab</button></div><div className="hero-points"><span>✓ Client-side</span><span>✓ Lossless</span><span>✓ No uploads</span></div></div>
          <div className="hero-visual"><div className="data-flow">{["FILE","FREQUENCY","TREE","CODES","HUFF"].map((x,i)=><div key={x} className="flow-item"><div className="flow-box">{x}</div>{i<4&&<div className="flow-arrow">→</div>}</div>)}</div><div className="binary-rain">01001010<br/>10110101<br/>00101101<br/>11001001</div><div className="visual-caption">Huffman Engine <strong>LIVE</strong></div></div>
        </div>

        <div id="engine" className="section-head"><div><div className="eyebrow">WORKSPACE</div><h2>Huffman Compression Engine</h2><p>Choose a file and inspect the algorithm before creating your archive.</p></div><span className="status-pill"><i/> Ready</span></div>
        <div className="upload-card">
          <div className={"dropzone "+(drag?"drag":"")} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)loadFile(f)}} onClick={()=>inputRef.current?.click()}>
            <input ref={inputRef} type="file" hidden onChange={e=>e.target.files?.[0]&&loadFile(e.target.files[0])}/>
            <div className="upload-icon">⇧</div><h3>{file?file.name:"Drop your file here"}</h3><p>{file?`${formatBytes(file.size)} • ${file.type||"binary file"}`:"or click to browse • TXT, CSV, JSON, HTML, JS, CSS, XML, LOG, MD and more"}</p>
            <button className="secondary small" onClick={e=>{e.stopPropagation();inputRef.current?.click()}}>Choose File</button>
          </div>
          <div className="upload-side">
            <div className="side-title">ARCHIVE DECODER</div><p>Already have a <b>.huff</b> file generated by HuffZip?</p>
            <input ref={decompRef} type="file" accept=".huff" hidden onChange={e=>e.target.files?.[0]&&handleDecompress(e.target.files[0])}/>
            <button className="outline" onClick={()=>decompRef.current?.click()}>Upload & Decompress</button>
            <div className="privacy">🔒 Files are processed locally in your browser.</div>
          </div>
        </div>

        {file&&data&&<div className="workspace-grid">
          <div className="panel"><div className="panel-title"><span>01 / FILE ANALYSIS</span><b>Actual input data</b></div><div className="mini-grid"><StatCard label="File size" value={formatBytes(data.length)}/><StatCard label="Unique bytes" value={String(new Set(data).size)}/><StatCard label="Symbols" value={data.length.toLocaleString()}/><StatCard label="Tree" value={tree?"Built":"Empty"}/></div><div className="action-row"><button className="primary" onClick={compress} disabled={!tree||!!archive}>Compress File →</button><button className="secondary" onClick={reset}>Reset</button></div></div>
          <div className="panel"><div className="panel-title"><span>02 / FREQUENCY SIGNAL</span><b>Most common bytes</b></div><div className="bars">{rows.slice(0,7).map(r=><div className="bar-row" key={r.symbol}><span>{symbolLabel(r.symbol)}</span><div><i style={{width:`${Math.max(3,(r.frequency/(rows[0]?.frequency||1))*100)}%`}}/></div><b>{r.frequency.toLocaleString()}</b></div>)}</div></div>
        </div>}

        {tree&&<div className="panel tree-panel"><div className="panel-title"><span>03 / HUFFMAN TREE</span><b>Generated from your actual frequency table</b></div><TreeSvg node={tree}/><div className="tree-legend"><span>● leaf = symbol</span><span>edges: 0 left / 1 right</span><span>node value = frequency</span></div></div>}

        {rows.length>0&&<div className="panel code-panel"><div className="panel-title"><span>04 / GENERATED CODES</span><b>Prefix-free binary code table</b></div><div className="table-tools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symbol or code…"/><span>{rows.length} symbols</span></div><div className="table-scroll"><table><thead><tr><th>Symbol</th><th>Frequency</th><th>Probability</th><th>Huffman Code</th><th>Bits</th></tr></thead><tbody>{rows.map(r=><tr key={r.symbol}><td><code>{symbolLabel(r.symbol)}</code></td><td>{r.frequency.toLocaleString()}</td><td>{(r.probability*100).toFixed(2)}%</td><td><code className="binary">{r.code}</code></td><td>{r.code.length}</td></tr>)}</tbody></table></div></div>}

        {archive&&stats&&<div className="results"><div className="result-header"><div><div className="eyebrow">COMPRESSION COMPLETE</div><h2>Archive ready ✓</h2><p>{stats.archiveBytes<stats.originalBytes?"The Huffman archive is smaller than the source.":"The archive is larger because metadata overhead exceeds the savings for this input."}</p></div><button className="primary" onClick={()=>download(archive,`${file?.name||"file"}.huff`)}>↓ Download .HUFF</button></div><div className="stat-grid"><StatCard label="Original" value={formatBytes(stats.originalBytes)}/><StatCard label="Archive" value={formatBytes(stats.archiveBytes)}/><StatCard label="Space saved" value={pct(stats.savedPercent)} sub={stats.savedPercent<0?"Archive overhead":"Compared with source"}/><StatCard label="Ratio" value={`${stats.ratio.toFixed(2)} : 1`}/><StatCard label="Entropy" value={`${stats.entropy.toFixed(3)} bits`} sub="Shannon entropy"/><StatCard label="Avg. code" value={`${stats.averageCodeLength.toFixed(3)} bits`} sub={`${stats.uniqueSymbols} unique symbols`}/></div><div className="compare"><div><span>Original</span><div className="track"><i style={{width:"100%"}}/></div><b>{formatBytes(stats.originalBytes)}</b></div><div><span>HUFF archive</span><div className="track"><i style={{width:`${Math.min(100,Math.max(3,(stats.archiveBytes/(stats.originalBytes||1))*100))}%`}}/></div><b>{formatBytes(stats.archiveBytes)}</b></div></div><button className="secondary" onClick={reset}>Compress Another File</button></div>}
      </section>}

      {tab==="lab" && <Lab/>}
      {tab==="analytics" && <Analytics data={data} stats={stats} rows={rows}/>}
      {tab==="how" && <How/>}
      {tab==="about" && <About/>}

      <section className="live-demo">
        <div><div className="eyebrow">INTERACTIVE DEMO</div><h2>Try Huffman Coding Live</h2><p>Type text and watch the frequency model and code length change in real time.</p><textarea value={demoText} onChange={e=>setDemoText(e.target.value)} placeholder="Type something…"/></div>
        <div className="demo-results"><div className="mini-grid"><StatCard label="Characters" value={String([...demoText].length)}/><StatCard label="Original bits" value={demo.originalBits.toLocaleString()}/><StatCard label="Encoded bits" value={demo.encodedBits.toLocaleString()}/><StatCard label="Theoretical ratio" value={demo.ratio?`${demo.ratio.toFixed(2)} : 1`:"—"}/></div><div className="demo-code-list">{demo.rows.slice(0,10).map(r=><div key={r.char}><span>{JSON.stringify(r.char)}</span><b>{r.code}</b><small>{r.freq}</small></div>)}</div></div>
      </section>
    </main>

    <footer><div><b>HUFFZIP</b><span>Compress • Analyze • Understand</span></div><p>Data Science Project • Huffman Coding • Client-side processing</p></footer>

    {presentation&&<Presentation onClose={()=>setPresentation(false)}/>}
  </div>
}

function Lab(){return <section className="content-page"><div className="page-hero"><div className="eyebrow">HUFFMAN LAB</div><h1>From frequencies to bits.</h1><p>Huffman Coding is a greedy, lossless compression technique. This lab breaks the process into presentation-ready steps.</p></div><div className="steps">{[
["01","Frequency Analysis","Count how often every symbol occurs. Frequent symbols are the best candidates for shorter codes."],
["02","Priority Queue","Place nodes into a min-priority queue ordered by frequency."],
["03","Tree Construction","Repeatedly remove the two least-frequent nodes and merge them into a parent node."],
["04","Code Generation","Follow left edges as 0 and right edges as 1. Every symbol receives a unique prefix-free code."],
["05","Encoding","Replace every source symbol with its variable-length Huffman code and pack the bits into bytes."],
["06","Decoding","Rebuild the same tree from the stored frequency table and walk the bits to recover the original bytes."]
].map(([n,t,d])=><div className="step" key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div><div className="step-arrow">→</div></div>)}</div><div className="concept-grid"><div className="concept"><b>Greedy</b><p>The algorithm makes the locally optimal merge by choosing the two smallest frequencies at each step.</p></div><div className="concept"><b>Prefix-free</b><p>No Huffman code is the prefix of another, so decoding is unambiguous.</p></div><div className="concept"><b>Lossless</b><p>The encoded archive contains enough metadata to reconstruct the exact original bytes.</p></div></div></section>}

function Analytics({data,stats,rows}:{data:Uint8Array|null;stats:any;rows: any[]}){const top=rows.slice(0,12);const max=top[0]?.frequency||1;return <section className="content-page"><div className="page-hero"><div className="eyebrow">COMPRESSION ANALYTICS</div><h1>Measure the data.</h1><p>Charts and metrics are derived from the currently analyzed file. Upload a file in Compressor to populate this view.</p></div>{!data?<div className="empty big">No file analyzed yet. Go to <b>Compressor</b> and choose a file.</div>:<><div className="stat-grid">{stats&&<><StatCard label="Original" value={formatBytes(stats.originalBytes)}/><StatCard label="Archive" value={formatBytes(stats.archiveBytes)}/><StatCard label="Entropy" value={`${stats.entropy.toFixed(3)} bits`}/><StatCard label="Average code" value={`${stats.averageCodeLength.toFixed(3)} bits`}/></>}</div><div className="chart-grid"><div className="panel"><div className="panel-title"><span>BYTE FREQUENCY</span><b>Top symbols</b></div><div className="chart-bars">{top.map(r=><div key={r.symbol}><span>{symbolLabel(r.symbol)}</span><i style={{height:`${Math.max(8,(r.frequency/max)*150)}px`}}/><small>{r.frequency}</small></div>)}</div></div><div className="panel"><div className="panel-title"><span>CODE LENGTH</span><b>Bits per symbol</b></div><div className="lengths">{top.map(r=><div key={r.symbol}><span>{symbolLabel(r.symbol)}</span><div><i style={{width:`${Math.min(100,r.code.length*8)}%`}}/></div><b>{r.code.length}</b></div>)}</div></div></div></>}</section>}

function How(){return <section className="content-page"><div className="page-hero"><div className="eyebrow">HOW IT WORKS</div><h1>Short codes for common symbols.</h1><p>Huffman Coding uses symbol frequency to build a binary tree. This reduces the average number of bits used by frequent symbols while remaining lossless.</p></div><div className="formula-card"><div><b>Compression ratio</b><code>Original size ÷ Archive size</code></div><div><b>Space saved</b><code>((Original − Archive) ÷ Original) × 100</code></div><div><b>Entropy</b><code>− Σ p(x) log₂ p(x)</code></div></div><div className="info-grid"><div><h3>Problem Statement</h3><p>Large amounts of digital data require efficient storage and transmission. This project implements Huffman Coding to reduce file size through lossless compression while visualizing the algorithm.</p></div><div><h3>Complexity</h3><p><b>Frequency:</b> O(n)<br/><b>Tree:</b> O(k log k)<br/><b>Encoding:</b> O(n)<br/><b>Decoding:</b> O(n)<br/><b>Space:</b> O(k)</p><small>n = input bytes, k = unique symbols</small></div><div><h3>Why it works</h3><p>More frequent symbols receive shorter codes; less frequent symbols receive longer codes. The tree guarantees prefix-free codes.</p></div><div><h3>Important note</h3><p>Small files can become larger because the archive stores a frequency table and file metadata. That is normal compression overhead, not a calculation error.</p></div></div></section>}

function About(){return <section className="content-page"><div className="page-hero"><div className="eyebrow">ABOUT THE PROJECT</div><h1>HUFFZIP</h1><p>A practical Data Science project combining an algorithm, binary data processing, analytics and interactive visualization.</p></div><div className="about-card"><div className="about-logo">0 1<br/><i>↘</i></div><div><h2>File Compression Tool using Huffman Coding</h2><p>HUFFZIP demonstrates frequency analysis, a min-priority queue, Huffman tree construction, prefix-free code generation, binary bit packing, custom archive creation and exact decompression.</p><div className="badges"><span>Huffman Coding</span><span>Lossless</span><span>Data Science</span><span>Client-side</span></div></div></div><div className="application-grid">{["File compression","Data storage","Data transmission","Text compression","Multimedia systems","Network optimization"].map(x=><div key={x}><span>◆</span><b>{x}</b><small>Real-world use of efficient data representation</small></div>)}</div></section>}

function Presentation({onClose}:{onClose:()=>void}){return <div className="presentation-overlay"><button className="close-pres" onClick={onClose}>×</button><div className="pres-inner"><div className="eyebrow">DATA SCIENCE PROJECT</div><h1>HUFFZIP</h1><h2>File Compression Tool using Huffman Coding</h2><div className="pres-grid">{[["Problem","Efficient storage and transmission of digital data."],["Objective","Implement lossless Huffman compression and visualize the algorithm."],["Working","Frequency → Priority Queue → Tree → Codes → Encoding."],["Result","Compare original and archive size using real input data."],["Complexity","O(n) frequency/encoding; O(k log k) tree construction."],["Applications","Compression, storage, transmission and multimedia systems."]].map(([a,b])=><div key={a}><span>{a}</span><p>{b}</p></div>)}</div><div className="pres-footer">Greedy algorithm • Prefix-free codes • Lossless recovery</div></div></div>}

export default App;