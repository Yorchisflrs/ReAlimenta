import { mkdir, writeFile, access } from 'node:fs/promises';
const images = {
  pan:'1509440159596-0249088772ff', fruta:'1619566636858-adf3ef46400b', verduras:'1518843875459-f738682238a6',
  yogur:'1488477181946-6428a0291777', arroz:'1586201375761-83865001e31c', sopa:'1603208614668-b35c95647eaf',
  salsa:'1592924357228-91a4daadcfea', galletas:'1499636136210-6f4ee915583e', leche:'1563636619-e9143da7973b', ensalada:'1512621776951-a57141f2eefd'
};
await mkdir(new URL('../assets/images/alimentos/',import.meta.url),{recursive:true});
for(const [key,photo] of Object.entries(images)) {
  if(process.argv.includes('--solo-sopa') && key !== 'sopa')continue;
  const file=new URL(`../assets/images/alimentos/${key}.jpg`,import.meta.url);
  try { await access(file); if(!process.argv.includes('--refresh')) { console.log(`${key}: ya disponible`); continue; } } catch {}
  const response=await fetch(`https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=1000&q=85`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok || !response.headers.get('content-type')?.startsWith('image/'))throw new Error(`No se pudo obtener ${key}: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  await writeFile(file,bytes); console.log(`${key}: fotografía local ${bytes.length} bytes`);
}
