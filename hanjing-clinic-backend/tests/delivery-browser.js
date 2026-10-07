import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

// Opt-in browser verification. All /api calls are forwarded to the isolated test
// server; no test writes ever reach the running local business database.
export async function verifyDeliveryBrowser({base,token}) {
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const me=await fetch(base+'/api/admin/me',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({token,user})=>{localStorage.setItem('auth_token',token);localStorage.setItem('user_info',JSON.stringify(user));},{token,user:me.data});
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url());
      const response=await route.fetch({url:base+url.pathname+url.search});
      await route.fulfill({response});
    });
    await page.goto('http://localhost:3000/fulfillment');
    const row=()=>page.getByRole('row').filter({has:page.getByText('#998',{exact:true})});
    await row().getByRole('button',{name:'取模',exact:true}).click();
    await page.getByLabel('口模编号 *',{exact:true}).fill('M-BROWSER');
    await page.getByLabel('口模存放位置 *',{exact:true}).fill('口模柜 A-03');
    await page.getByLabel('取模方式').selectOption({label:'实体口模'});
    await page.getByPlaceholder('参数名称',{exact:true}).fill('下颌前移量');
    await page.getByPlaceholder('测量值',{exact:true}).fill('4');
    await page.getByPlaceholder('单位',{exact:true}).fill('mm');
    await page.getByLabel('每日计划佩戴时长（小时）*',{exact:true}).fill('8');
    await page.getByLabel('计划佩戴时段 *',{exact:true}).fill('夜间睡眠');
    await page.getByLabel('设备规格 / 工厂制作要求 *',{exact:true}).fill('按医生处方及口模参数制作，检查边缘。');
    await page.locator('input[type=file]').setInputFiles({name:'scan.stl',mimeType:'application/octet-stream',buffer:Buffer.from('solid test\nendsolid test')});
    await page.getByRole('button',{name:'下载',exact:true}).waitFor();
    await page.getByRole('button',{name:'确认取模完成',exact:true}).click();
    await row().getByText('待送厂',{exact:true}).waitFor();
    await page.getByRole('button',{name:'送厂批次',exact:true}).first().click();
    await page.getByRole('button',{name:'汇总口模 / 新建批次',exact:true}).click();
    await page.getByLabel('制作工厂 *',{exact:true}).fill('测试制作工厂');
    await page.getByRole('row').filter({has:page.getByText('M-BROWSER',{exact:true})}).getByRole('checkbox').check();
    await page.getByRole('button',{name:'生成待寄批次',exact:true}).click();
    await page.getByRole('button',{name:'导出制作清单 CSV',exact:true}).waitFor();
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'导出制作清单 CSV',exact:true}).click();
    const download=await downloadPromise,stream=await download.createReadStream(),parts=[];
    for await (const part of stream)parts.push(part);
    const csv=Buffer.concat(parts).toString('utf8');
    assert.ok(csv.includes('M-BROWSER'));assert.ok(csv.includes('下颌前移量: 4 mm'));assert.ok(csv.includes('scan.stl'));
    await page.getByRole('button',{name:'确认寄出',exact:true}).click();
    await page.getByLabel('快递公司 *',{exact:true}).fill('测试快递');
    await page.getByLabel('快递单号 *',{exact:true}).fill('TEST-TRACK-998');
    await page.getByLabel('已逐件核对口模及制作资料，并确认实物已寄出').check();
    await page.getByRole('button',{name:'确认',exact:true}).click();
    await page.getByRole('button',{name:'工厂签收',exact:true}).click();
    await page.getByRole('button',{name:'确认',exact:true}).click();
    await page.getByRole('button',{name:'制作 / 恢复制作',exact:true}).click();
    await page.getByRole('button',{name:'确认',exact:true}).click();
    await page.getByRole('button',{name:'此件回货验收',exact:true}).click();
    await page.getByLabel('设备编号 *',{exact:true}).fill('DEVICE-BROWSER-998');
    await page.getByLabel('设备存放位置 *',{exact:true}).fill('成品柜 B-03');
    await page.getByRole('button',{name:'确认',exact:true}).click();
    await page.getByText('已回店验收',{exact:true}).waitFor();
    if(process.env.DELIVERY_SCREENSHOT_DIR){
      await mkdir(process.env.DELIVERY_SCREENSHOT_DIR,{recursive:true});
      await page.waitForTimeout(3500);
      await page.screenshot({path:process.env.DELIVERY_SCREENSHOT_DIR+'/factory-batch.png'});
    }
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByRole('button',{name:'患者交付',exact:true}).click();
    await row().getByText('待通知试戴',{exact:true}).waitFor();
    await row().getByRole('button',{name:'取模资料',exact:true}).click();
    await page.getByText('当前环节资料已锁定',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('口模编号 *',{exact:true}).isDisabled(),true);
    if(process.env.DELIVERY_SCREENSHOT_DIR){await page.waitForTimeout(500);await page.screenshot({path:process.env.DELIVERY_SCREENSHOT_DIR+'/mold-details.png'});}
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await row().getByRole('button',{name:'通知试戴',exact:true}).click();
    await row().getByText('待试戴',{exact:true}).waitFor();
    await row().getByRole('button',{name:'完成试戴',exact:true}).click();
    await page.getByRole('button',{name:'确认',exact:true}).click();
    await row().getByText('已完成',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
}
