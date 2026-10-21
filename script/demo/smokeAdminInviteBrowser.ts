import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type pg from 'pg';
import { chromium, type Page } from 'playwright';

export async function runAdminInviteBrowser({ appUrl, mailUrl, actors, password, db, directory, pass, service }: {
  appUrl: string; mailUrl: string; actors: Record<string,{id:string;email:string;token:string}>;
  password: string; db: pg.Client; directory: string; pass:(name:string)=>void; service:string;
}) {
  const browser = await chromium.launch({headless:true,executablePath:process.env.ADMIN_INVITE_CHROMIUM_PATH});
  const errors:string[]=[];
  const attach = (page:Page) => {
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',request=>assert.notEqual(request.headers().authorization,`Bearer ${service}`,'service credential must never reach browser'));
  };
  const login = async(page:Page, role:string) => {
    await page.goto(`${appUrl}/login`);
    await page.getByLabel('Email',{exact:true}).fill(actors[role].email);
    await page.getByLabel('Contraseña (opcional para enlace)').fill(password);
    await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();
    await page.waitForURL('**/dashboard');
  };
  async function mailLink(email:string,subject?:string) {
    for(let i=0;i<100;i++) {
      const messages:any=await (await fetch(`${mailUrl}/api/v1/messages`)).json();
      const message=messages.messages.find((m:any)=>m.To.some((to:any)=>to.Address===email)&&(!subject||m.Subject.includes(subject)));
      if(message){const body:any=await(await fetch(`${mailUrl}/api/v1/message/${message.ID}`)).json();return String(body.HTML).match(/href="([^"]+)"/)![1].replace(/&amp;/g,'&');}
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error('No captured invitation');
  }
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();attach(page);
    await page.goto(`${appUrl}/login`);
    await page.getByText('Acceso mediante invitación de un administrador.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:/crear cuenta|registrarse/i}).count(),0);
    await page.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click();
    await page.getByRole('button',{name:'Enviar email de recuperación'}).waitFor();
    await page.screenshot({path:`${directory}/login-recovery.png`});
    await login(page,'admin');
    await page.goto(`${appUrl}/settings`);
    await page.getByRole('tab',{name:'Usuarios',exact:true}).click();
    const form=page.getByRole('form',{name:'Invitar usuario'});await form.waitFor();
    await form.getByLabel('Email de invitación').fill('browser-invited@example.test');
    await form.getByRole('combobox',{name:'Rol inicial'}).click();
    await page.getByRole('option',{name:'aux',exact:true}).click();
    await form.getByRole('button',{name:'Enviar invitación',exact:true}).click();
    await form.getByRole('status').waitFor();
    let row=page.getByRole('row').filter({hasText:'browser-invited@example.test'});await row.getByText('Invitación pendiente',{exact:true}).waitFor();
    await page.screenshot({path:`${directory}/invitation-pending.png`});
    const invited=(await db.query("SELECT id FROM auth.users WHERE email='browser-invited@example.test'")).rows[0].id;
    const staff=(await db.query("INSERT INTO staff_people(name,role_type) VALUES('Invited staff','production') RETURNING id")).rows[0].id;
    await page.reload();await page.getByRole('tab',{name:'Usuarios',exact:true}).click();
    row=page.getByRole('row').filter({hasText:'browser-invited@example.test'});
    await row.getByRole('combobox').nth(1).click();await page.getByRole('option',{name:'Invited staff · Producción'}).click();
    await row.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.getByText('Cambios guardados',{exact:true}).waitFor();
    assert.equal(Number((await db.query("SELECT entity_id FROM user_entity_links WHERE user_id=$1 AND entity_type='staff_person'",[invited])).rows[0].entity_id),Number(staff));
    pass('Native browser ADMIN invitation, chosen role, pending status and existing staff-link editor persisted');
    const guest=await browser.newContext();const invitedPage=await guest.newPage();attach(invitedPage);
    // Supabase Site URL is /dashboard, proving callback handling does not depend
    // on a new production redirect or a /login-only landing page.
    await invitedPage.goto(await mailLink('browser-invited@example.test'));
    await invitedPage.getByLabel('Nueva contraseña',{exact:true}).fill(password);
    await invitedPage.getByRole('button',{name:'Actualizar contraseña',exact:true}).click();
    await invitedPage.waitForURL('**/dashboard');
    await invitedPage.screenshot({path:`${directory}/invitation-activated.png`});
    assert.ok((await db.query('SELECT email_confirmed_at FROM auth.users WHERE id=$1',[invited])).rows[0].email_confirmed_at);
    assert.equal((await db.query('SELECT r.key FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE user_id=$1',[invited])).rows[0].key,'aux');
    // Fresh context proves password login independently of invitation session.
    const fresh=await browser.newContext();const freshPage=await fresh.newPage();attach(freshPage);
    actors.invited={id:invited,email:'browser-invited@example.test',token:''};await login(freshPage,'invited');
    await freshPage.goto(`${appUrl}/settings`);await freshPage.getByText('Acceso denegado',{exact:false}).first().waitFor();
    assert.equal(await freshPage.getByRole('form',{name:'Invitar usuario'}).count(),0);
    await page.getByRole('button',{name:'Reintentar',exact:true}).click();
    await page.getByRole('row').filter({hasText:'browser-invited@example.test'}).getByText('Email confirmado',{exact:true}).waitFor();
    pass('Captured real invitation → native browser activation/password at /dashboard → independent password login; aux role and staff link preserved; non-admin has no invitation UI');
    const denied=form.getByLabel('Email de invitación');await denied.fill('browser-invited@example.test');
    await form.getByRole('button',{name:'Enviar invitación',exact:true}).click();
    await form.getByRole('alert').waitFor();assert.equal(await form.getByRole('status').count(),0);
    await page.screenshot({path:`${directory}/invitation-duplicate.png`});
    const recovery=await browser.newContext();const recoveryPage=await recovery.newPage();attach(recoveryPage);
    await recoveryPage.goto(`${appUrl}/login`);await recoveryPage.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click();
    await recoveryPage.getByLabel('Email',{exact:true}).fill('browser-invited@example.test');await recoveryPage.getByRole('button',{name:'Enviar email de recuperación'}).click();
    await recoveryPage.getByText('Te enviamos un enlace para restablecer tu contraseña.',{exact:true}).waitFor();
    await recoveryPage.goto(await mailLink('browser-invited@example.test','Reset'));
    const recoveredPassword=password+'new';await recoveryPage.getByLabel('Nueva contraseña',{exact:true}).fill(recoveredPassword);await recoveryPage.getByRole('button',{name:'Actualizar contraseña',exact:true}).click();await recoveryPage.waitForURL('**/dashboard');
    const recoveryLogin=await browser.newContext();const recoveryLoginPage=await recoveryLogin.newPage();attach(recoveryLoginPage);await recoveryLoginPage.goto(`${appUrl}/login`);await recoveryLoginPage.getByLabel('Email',{exact:true}).fill('browser-invited@example.test');await recoveryLoginPage.getByLabel('Contraseña (opcional para enlace)').fill(recoveredPassword);await recoveryLoginPage.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await recoveryLoginPage.waitForURL('**/dashboard');
    pass('Native password recovery email, callback, password change and fresh login remain functional');
    const magic=await browser.newContext();const magicPage=await magic.newPage();attach(magicPage);
    await magicPage.goto(`${appUrl}/login`);await magicPage.getByLabel('Email',{exact:true}).fill(actors.viewer.email);await magicPage.getByRole('button',{name:'Enviar enlace',exact:true}).click();await magicPage.getByText('Te hemos enviado un enlace para iniciar sesión. Revisa tu correo.',{exact:true}).waitFor();
    await magicPage.goto(await mailLink(actors.viewer.email,'Magic'));await magicPage.waitForURL(/\/dashboard#?$/);await magicPage.getByRole('button',{name:'Cerrar sesión',exact:true}).waitFor();
    assert.equal((await db.query('SELECT r.key FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE user_id=$1',[actors.viewer.id])).rows[0].key,'viewer');
    const unknown=await browser.newContext();const unknownPage=await unknown.newPage();attach(unknownPage);await unknownPage.goto(`${appUrl}/login`);
    const otpRequest=unknownPage.waitForRequest(request=>request.url().includes('/auth/v1/otp')&&request.method()==='POST');
    await unknownPage.getByLabel('Email',{exact:true}).fill('unknown-browser@example.test');await unknownPage.getByRole('button',{name:'Enviar enlace',exact:true}).click();
    assert.equal((await otpRequest).postDataJSON().create_user,false);await unknownPage.getByRole('alert').waitFor();
    assert.equal((await db.query("SELECT id FROM auth.users WHERE email='unknown-browser@example.test'")).rows.length,0);
    pass('Authorized magic-link browser login preserved; unknown account OTP explicitly disables creation and creates no user');
    assert.deepEqual(errors,[]);
    writeFileSync(`${directory}/browser.json`,JSON.stringify({mode:'REAL_DISPOSABLE_BROWSER',httpInterception:false,errors,screenshots:['login-recovery.png','invitation-pending.png','invitation-activated.png','invitation-duplicate.png']},null,2));
    pass('Browser duplicate displays error, no success notice; no JavaScript errors or service_role browser request');
  } finally { await browser.close(); }
}
