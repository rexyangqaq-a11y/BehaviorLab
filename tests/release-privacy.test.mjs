import test from 'node:test';
import assert from 'node:assert/strict';
import {releasePrivacyPlan,cleanPrivateText} from '../scripts/release-privacy.mjs';
import {scaleReleaseRectangles} from '../scripts/redact-v04-release-archive.mjs';

test('release privacy derives private values from local layouts without hardcoding or exporting them',()=>{
 const nodes=[{text:'Synthetic Owner',bounds:'[286,359][452,433]'},{text:'华为账号、付款与账单、云空间等',bounds:'[286,449][781,493]'},{text:'Synthetic Owner的Device',bounds:'[1800,401][2300,549]'},{id:'AboutDevice.serial_number.result',text:'SYNTHETIC-SERIAL',bounds:'[2100,1640][2510,1690]'},{id:'AboutDevice.imei_id.result',text:'123456789012345',bounds:'[2100,1755][2510,1828]'}];
 const plan=releasePrivacyPlan([nodes],{width:2584,height:1828,caseId:'HM-STOR-001'});
 assert.ok(plan.privateStrings.includes('Synthetic Owner'));
 assert.ok(plan.privateStrings.includes('SYNTHETIC-SERIAL'));
 assert.ok(plan.rectangles.some(r=>r.reason==='device_identifier'&&r.bottom===1828));
 assert.ok(plan.rectangles.some(r=>r.reason==='private_text_occurrence'&&r.left>1700));
 assert.equal(cleanPrivateText('Synthetic Owner / SYNTHETIC-SERIAL / 123456789012345',plan.privateStrings),'[private text omitted] / [private text omitted] / [private text omitted]');
 assert.equal(nodes[0].text,'Synthetic Owner');
});

test('release privacy keeps counters and sha hashes intact and leaves a clean calculator scene alone',()=>{
 assert.deepEqual(releasePrivacyPlan([[{text:'990',bounds:'[0,0][100,100]'}]],{width:2584,height:1828,caseId:'HM-CALC-001'}).rectangles,[]);
 const hash='abc123456789012345def';
 assert.equal(cleanPrivateText(hash),hash);
 assert.equal(cleanPrivateText('331 requests / 1486 images / 1818302 input tokens'),'331 requests / 1486 images / 1818302 input tokens');
});

test('release privacy scales recorded physical rectangles to submitted half-size images and clips edges',()=>{
 const rects=scaleReleaseRectangles([{left:100,top:200,right:600,bottom:800},{left:2500,top:1800,right:2600,bottom:1900}],{width:2584,height:1828},{width:1292,height:914});
 assert.deepEqual(rects,[{left:50,top:100,width:250,height:300},{left:1250,top:900,width:42,height:14}]);
});
