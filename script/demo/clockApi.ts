/** Reproduction clock; never opens an application session or sends an API request. */
const simulatedSetAt=new Date().toISOString();
export async function apiRequest<T>(_method:string,path:string):Promise<T>{
 if(path!=='/api/program-settings')throw Error('No application API available in recorded demo');
 return {clockMode:'manual',simulatedTime:'09:00',simulatedSetAt} as T;
}
