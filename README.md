# HUFFZIP — File Compression Tool using Huffman Coding

A complete React + TypeScript + Vite Data Science project.

## Run locally

1. Install Node.js (LTS) if it is not already installed.
2. Extract this ZIP.
3. Open the extracted `huffzip` folder in VS Code.
4. Open VS Code Terminal.
5. Run:

```bash
npm install
npm run dev
```

6. Open the local URL printed by Vite (usually `http://localhost:5173`).

## Features

- Real Huffman Coding on byte data
- Frequency analysis
- Dynamic Huffman tree
- Generated prefix-free codes
- Custom `.huff` archive
- Compression and decompression
- Downloadable archive and recovered file
- Compression ratio, space saved, entropy and average code length
- Interactive text demo
- Analytics charts
- Huffman Lab
- Presentation Mode
- Client-side file processing
- Responsive dark UI

## Notes

HuffZip stores a frequency table in its custom archive so the tree can be reconstructed during decompression. Small files can become larger because archive metadata has overhead; the UI reports that honestly.
