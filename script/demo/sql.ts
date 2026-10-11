export const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
export const literal=(value:unknown):string=>value==null?'NULL':typeof value==='number'?String(value):typeof value==='boolean'?String(value):quote(typeof value==='string'?value:JSON.stringify(value));
export const identifier=(value:string)=>`"${value.replaceAll('"','""')}"`;
