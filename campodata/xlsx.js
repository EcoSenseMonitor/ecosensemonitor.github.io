/* Exportação XLSX totalmente offline, sem bibliotecas externas.
   ZIP sem compactação + Office Open XML; cada coluna mantém seu cabeçalho. */
(function(){
 'use strict';
 const encoder=new TextEncoder();
 const bytes=text=>encoder.encode(text);
 const xml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
 const le16=n=>[n&255,(n>>>8)&255];
 const le32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
 let crcTable=null;
 function crc32(a){
  if(!crcTable){crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0})}
  let crc=-1;for(const x of a)crc=crcTable[(crc^x)&255]^(crc>>>8);return (crc^-1)>>>0;
 }
 function concat(parts){const total=parts.reduce((n,a)=>n+a.length,0);const all=new Uint8Array(total);let pos=0;for(const a of parts){all.set(a,pos);pos+=a.length}return all}
 function zip(files){
  const chunks=[],directory=[];let offset=0;
  for(const [filename,source] of Object.entries(files)){
   const name=bytes(filename),data=bytes(source),crc=crc32(data);
   const local=Uint8Array.from([...le32(0x04034b50),...le16(20),...le16(0x0800),...le16(0),...le16(0),...le16(0),
     ...le32(crc),...le32(data.length),...le32(data.length),...le16(name.length),...le16(0)]);
   const central=Uint8Array.from([...le32(0x02014b50),...le16(20),...le16(20),...le16(0x0800),...le16(0),...le16(0),...le16(0),
     ...le32(crc),...le32(data.length),...le32(data.length),...le16(name.length),...le16(0),...le16(0),...le16(0),...le16(0),
     ...le32(0),...le32(offset)]);
   chunks.push(local,name,data);
   directory.push(central,name);
   offset+=local.length+name.length+data.length;
  }
  const centralData=concat(directory),header=Uint8Array.from([...le32(0x06054b50),...le16(0),...le16(0),
    ...le16(directory.length/2),...le16(directory.length/2),...le32(centralData.length),...le32(offset),...le16(0)]);
  return concat([...chunks,centralData,header]);
 }
 function columnName(n){
  let s='';for(let x=n+1;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;
  return s;
 }
 function build(table){
  if(!Array.isArray(table)||!table.length)throw Error('Planilha vazia');
  const sheetRows=table.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((item,ci)=>{
   const raw=item===null||item===undefined?'':typeof item==='object'?JSON.stringify(item):String(item);
   const safe=xml(raw);
   return '<c r="'+columnName(ci)+(ri+1)+'" t="inlineStr"'+(ri===0?' s="1"':'')+'><is><t xml:space="preserve">'+safe+'</t></is></c>';
  }).join('')+'</row>').join('');
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>'+sheetRows+'</sheetData></worksheet>';
  const types='<?xml version="1.0" encoding="UTF-8"?>'
    +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    +'<Default Extension="xml" ContentType="application/xml"/>'
    +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    +'</Types>';
  const rels='<?xml version="1.0" encoding="UTF-8"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    +'</Relationships>';
  const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheets><sheet name="Entrevistas" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const workbookRels='<?xml version="1.0" encoding="UTF-8"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    +'</Relationships>';
  const styles='<?xml version="1.0" encoding="UTF-8"?>'
    +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts>'
    +'<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    +'<borders count="1"><border/></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    +'<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>';
  const output=zip({
   '[Content_Types].xml':types,'_rels/.rels':rels,
   'xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':workbookRels,
   'xl/styles.xml':styles,'xl/worksheets/sheet1.xml':sheet
  });
  return new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 }
 window.CampoDataXLSX=build;
})();
