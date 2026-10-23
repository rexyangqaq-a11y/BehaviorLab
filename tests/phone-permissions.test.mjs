import test from 'node:test';import assert from 'node:assert/strict';
import {assessPermissionAction} from '../src/phone-permissions.mjs';
const dialog=[{id:'permission_dialog_title',text:'允许测试应用复制来自剪贴板的内容？'},{text:'本次使用允许',bounds:'[1160,973][1424,1025]'},{text:'始终允许',bounds:'[1204,1094][1380,1146]'},{id:'permission_dialog_deny_button',bounds:'[786,1186][1798,1296]'},{text:'不允许',bounds:'[1226,1215][1358,1267]'}];
test('a real Harmony-style permission dialog allows explicit denial and blocks temporary or permanent grants for both native bridges',()=>{
 assert.equal(assessPermissionAction(dialog,'Tap',{locate:{center:[1292,999]}}).allowed,false);
 assert.equal(assessPermissionAction(dialog,'tap',{x:1292,y:1120}).allowed,false);
 assert.equal(assessPermissionAction(dialog,'Tap',{locate:{center:[1292,1241]}}).decision,'explicit_deny');
 assert.equal(assessPermissionAction(dialog,'tap',{x:1292,y:1241}).allowed,true);
 assert.equal(assessPermissionAction(dialog,'tap',{x:1292,y:1212}).allowed,true);
});
test('permission dialogs cannot be accepted through keyboard, text input or an imprecise click; back and home remain available',()=>{
 for(const name of ['Input','KeyboardPress','enter','clear','longPress','DoubleClick'])assert.equal(assessPermissionAction(dialog,name,{x:1292,y:999}).allowed,false);
 assert.equal(assessPermissionAction(dialog,'Tap',{locate:{center:[1000,1000]}}).allowed,false);
 for(const name of ['back','home','HarmonyBackButton','HarmonyHomeButton','Swipe','Scroll'])assert.equal(assessPermissionAction(dialog,name).allowed,true);
});
test('ordinary app text or a store button named allow does not masquerade as an OS permission dialog',()=>{
 assert.deepEqual(assessPermissionAction([{text:'允许'},{text:'这篇笔记讨论剪贴板权限'}],'tap',{x:10,y:10}),{dialog:false,allowed:true});
});
