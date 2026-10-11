// Current development/CI/release runtime, from the official Node 24.21.0 archive.
// Historical R02 audit evidence retains its own immutable runtime policy.
export const RUNTIME_POLICY = Object.freeze({
  nodeVersion: 'v24.21.0',
  nodeEngine: '>=24.21 <25',
  npmVersion: '11.19.0',
  npmEngine: '>=11.19 <12',
  npmCliSha256: '8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7',
  npmPackageSha256: '09dfcf187178ce1ab3ea6194c80d3ae082ad2a86dc1269ac963f94429e718122',
  npmConfigVersion: '10.12.0',
  ciInfoVersion: '4.4.0'
});
