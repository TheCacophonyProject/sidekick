import{k as R,x as E,b as N,i as l,c as r,B as $,C as h,l as _,n as v,h as P,t as g,j as k,v as m,E as A}from"./index-b4794d68.js";import{A as p}from"./ActionContainer-219b5aec.js";import{C as T}from"./CircleButton-c8642661.js";import{D as b}from"./index-2252c3d7.js";const z=g('<button class="text-red-400"></button>',2),C=g('<span class="w-24">Saved: <!> </span>',3),S=g('<span class="ml-2">Uploaded: </span>',2),U=g('<p class="flex items-center text-gray-800"><span class="w-24">Saved: <!> </span><span class="ml-2">Uploaded: </span></p>',7),D=g('<section class="pb-bar pt-bar relative h-full space-y-2 overflow-y-auto bg-gray-200 px-2"><div class="pb-bar fixed inset-x-0 bottom-[4vh] mx-auto flex justify-center"></div></section>',4);function L(){const n=R(),a=E(),y=async()=>{const{value:t}=await b.confirm({title:"Delete Saved",message:"Are you sure you want to delete all saved items? Note: Uploaded items will not be deleted, until the device is notified"});t&&(await n.deleteRecordings(),await n.deleteEvents({uploaded:!1}))};N(()=>{const t=m.get("/storage");t&&(m.set("/storage",[t[0],(()=>{const o=z.cloneNode(!0);return o.$$click=y,l(o,r(A,{size:32})),o})()]),console.log(m.get("/storage")))});const w=async()=>{if(!a.data()){const{value:t}=await b.confirm({title:"Login",message:`You are not currently logged in.
 Would you like to login?`});if(!t)return;await a.logout();return}await a.validateCurrToken(),a.isAuthorized()&&await n.uploadItems()},u=t=>t.isProd,x=t=>t.isProd===a.isProd(),f=t=>!t.isProd;return(()=>{const t=D.cloneNode(!0),o=t.firstChild;return l(t,r(p,{icon:$,header:"Recordings",get action(){return r(h,{href:"recordings",class:"text-blue-500",get children(){return r(_,{size:32})}})},get children(){return r(h,{href:"recordings",class:"flex items-center text-gray-800",get children(){return[(()=>{const e=C.cloneNode(!0),i=e.firstChild,s=i.nextSibling;return s.nextSibling,l(e,()=>n.UnuploadedRecordings().filter(u).length,s),e})(),(()=>{const e=S.cloneNode(!0);return e.firstChild,l(e,()=>n.UploadedRecordings().filter(u).length,null),e})()]}})}}),o),l(t,r(p,{icon:v,header:"Events",get children(){const e=U.cloneNode(!0),i=e.firstChild,s=i.firstChild,d=s.nextSibling;d.nextSibling;const c=i.nextSibling;return c.firstChild,l(i,()=>n.UnuploadedEvents().filter(u).length,d),l(c,()=>n.UploadedEvents().filter(u).length,null),e}}),o),l(t,r(P,{get when(){return!a.isProd()},get children(){return[r(p,{icon:$,header:"Test Recordings",get action(){return r(h,{href:"recordings",class:"text-blue-500",get children(){return r(_,{size:32})}})},get children(){return r(h,{href:"recordings",class:"flex items-center text-gray-800",get children(){return[(()=>{const e=C.cloneNode(!0),i=e.firstChild,s=i.nextSibling;return s.nextSibling,l(e,()=>n.UnuploadedRecordings().filter(f).length,s),e})(),(()=>{const e=S.cloneNode(!0);return e.firstChild,l(e,()=>n.UploadedRecordings().filter(f).length,null),e})()]}})}}),r(p,{icon:v,header:"Test Events",get children(){const e=U.cloneNode(!0),i=e.firstChild,s=i.firstChild,d=s.nextSibling;d.nextSibling;const c=i.nextSibling;return c.firstChild,l(i,()=>n.UnuploadedEvents().filter(f).length,d),l(c,()=>n.UploadedEvents().filter(f).length,null),e}})]}}),o),l(o,r(T,{get text(){return a.isProd()?"Upload to Cacophony":"Upload to Cacophony Test"},loadingText:"Uploading...",onClick:w,get disabled(){return n.isUploading()||n.UnuploadedRecordings().filter(x).length===0&&n.UnuploadedEvents().filter(x).length===0},get loading(){return n.isUploading()}})),t})()}k(["click"]);export{L as default};