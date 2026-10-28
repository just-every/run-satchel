declare module "*.wasm?module" { const module:WebAssembly.Module; export default module; }
declare module "*.gz?inline" { const data:string; export default data; }
