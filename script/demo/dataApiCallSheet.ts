import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';

/** Real browser and product endpoints: no request interception or seeded HTTP responses. */
export async function dataApiCallSheet(appUrl:string,user:{email:string;password:string},directory:string) {
  assert.equal(new URL(appUrl).hostname,'127.0.0.1');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const page=await browser.newPage(),errors:string[]=[],responses:{path:string;status:number}[]=[];
  try {
    page.setDefaultNavigationTimeout(120_000);page.setDefaultTimeout(60_000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{
      const path=new URL(response.url()).pathname;
      if(path.startsWith('/api/'))responses.push({path,status:response.status()});
    });
    await page.goto(`${appUrl}/login`);
    await page.getByLabel('Email',{exact:true}).fill(user.email);
    await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(user.password);
    await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
    responses.length=0;
    await page.goto(`${appUrl}/call-sheet`);
    await page.getByTestId('sheet-header').waitFor();
    const tasks=await page.locator('[data-testid^="sheet-task-"]').count();assert.ok(tasks>0);
    assert.deepEqual(errors,[]);
    assert.ok(responses.some(r=>r.path.endsWith('/tasks')&&r.status===200));
    assert.deepEqual(responses.filter(r=>r.status>=400),[]);
    await page.screenshot({path:`${directory}/data-api-call-sheet.png`,fullPage:true});
    return {role:'viewer',tasks,errors,responses};
  }catch(error){
    await page.screenshot({path:`${directory}/data-api-call-sheet-failed.png`}).catch(()=>{});
    writeFileSync(`${directory}/data-api-browser-failure.json`,JSON.stringify({url:page.url(),title:await page.title().catch(()=>''),errors,responses},null,2));
    throw error;
  }finally {await browser.close();}
}
