const $=id=>document.getElementById(id);
function msg(t){const n=$("notice");n.textContent=t;n.style.display="block";clearTimeout(window.mt);window.mt=setTimeout(()=>n.style.display="none",1800)}
async function tab(){return (await chrome.tabs.query({active:true,currentWindow:true}))[0]}
function safeName(s){return (s||"page").replace(/[\\/:*?"<>|]/g,"_").slice(0,100)}

document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.page).classList.add("active")});

async function copyText(v){try{await navigator.clipboard.writeText(v);msg("Copied")}catch(e){msg("Clipboard blocked")}}
async function pageData(){const t=await tab();return {title:t?.title||"",url:t?.url||""}}

$("copyPage").onclick=async()=>{const d=await pageData();await copyText(d.title+"\n"+d.url)}
$("copyPageDev").onclick=$("copyPage").onclick;
$("copyUrl").onclick=async()=>{const d=await pageData();await copyText(d.url)}
$("copyTitle").onclick=async()=>{const d=await pageData();await copyText(d.title)}

$("screenshot").onclick=async()=>{try{const t=await tab();const u=await chrome.tabs.captureVisibleTab(t.windowId,{format:"png"});await chrome.downloads.download({url:u,filename:"QuickTools-screenshot.png",saveAs:true});msg("Screenshot saved")}catch(e){msg("Chrome blocked this page")}}

$("cleanurl").onclick=async()=>{try{const t=await tab();const u=new URL(t.url);const remove=/^utm_/i;[...u.searchParams.keys()].forEach(k=>{if(remove.test(k)||["gclid","fbclid","mc_cid","mc_eid","msclkid","dclid","gbraid","wbraid"].includes(k.toLowerCase()))u.searchParams.delete(k)});await copyText(u.href);msg("Clean URL copied")}catch(e){msg("URL unavailable")}}

$("duplicates").onclick=async()=>{const ts=await chrome.tabs.query({currentWindow:true});const seen=new Set(),ids=[];for(const t of ts){if(!t.url||t.url.startsWith("chrome://"))continue;if(seen.has(t.url))ids.push(t.id);else seen.add(t.url)}if(ids.length)await chrome.tabs.remove(ids);msg(ids.length?ids.length+" duplicate tab(s) closed":"No duplicates found")}

$("print").onclick=async()=>{try{const t=await tab();await chrome.scripting.executeScript({target:{tabId:t.id},func:()=>window.print()});msg("Print dialog opened")}catch(e){msg("Printing blocked here")}}

$("savehtml").onclick=async()=>{try{const t=await tab();const r=await chrome.scripting.executeScript({target:{tabId:t.id},func:()=>({html:"<!doctype html>\n"+document.documentElement.outerHTML,title:document.title})});const d=r[0].result;const blob=new Blob([d.html],{type:"text/html"}),u=URL.createObjectURL(blob);await chrome.downloads.download({url:u,filename:safeName(d.title)+".html",saveAs:true});setTimeout(()=>URL.revokeObjectURL(u),5000);msg("Page saved")}catch(e){msg("Cannot save this page")}}

async function selectedText(){try{const t=await tab();const r=await chrome.scripting.executeScript({target:{tabId:t.id},func:()=>getSelection()?.toString().trim()||""});return r[0]?.result||""}catch(e){return ""}}
$("selectionSearch").onclick=async()=>{const s=await selectedText();if(!s)return msg("Select some text first");await chrome.tabs.create({url:"https://www.google.com/search?q="+encodeURIComponent(s)})}
$("translate").onclick=async()=>{const s=await selectedText();if(!s)return msg("Select some text first");await chrome.tabs.create({url:"https://translate.google.com/?sl=auto&tl=en&text="+encodeURIComponent(s)})}

function tx(f){$("textBox").value=f($("textBox").value);stats()}
function stats(){const s=$("textBox").value;$("count").textContent=(s.trim()?s.trim().split(/\s+/).length:0)+" words · "+s.length+" characters"}
$("upper").onclick=()=>tx(s=>s.toUpperCase());$("lower").onclick=()=>tx(s=>s.toLowerCase());$("title").onclick=()=>tx(s=>s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()));$("spaces").onclick=()=>tx(s=>s.replace(/\s+/g," ").trim());$("sortLines").onclick=()=>tx(s=>s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b)).join("\n"));$("uniqueLines").onclick=()=>tx(s=>[...new Set(s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))].join("\n"));$("copy").onclick=()=>copyText($("textBox").value);$("clear").onclick=()=>{$("textBox").value="";stats()};$("textBox").oninput=stats;

$("pageInfo").onclick=async()=>{const d=await pageData();try{const t=await tab();const r=await chrome.scripting.executeScript({target:{tabId:t.id},func:()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,links:document.links.length,images:document.images.length})});const x=r[0].result;alert("Title: "+d.title+"\nURL: "+d.url+"\nPage size: "+x.width+" × "+x.height+"\nLinks: "+x.links+"\nImages: "+x.images)}catch(e){alert("Title: "+d.title+"\nURL: "+d.url)}}

$("source").onclick=async()=>{const d=await pageData();if(!d.url)return;await chrome.tabs.create({url:"view-source:"+d.url})}

function formatJson(v){return JSON.stringify(JSON.parse(v),null,2)}
$("jsonFormat").onclick=()=>{$("devBox").focus();try{$("devBox").value=formatJson($("devBox").value);msg("JSON formatted")}catch(e){msg("Invalid JSON")}}
$("formatJson").onclick=$("jsonFormat").onclick;

$("urlDecode").onclick=async()=>{$("devBox").value=decodeURIComponent($("devBox").value);msg("URL decoded")}
$("decodeUrl").onclick=$("urlDecode").onclick;

function b64enc(s){return btoa(unescape(encodeURIComponent(s)))}
function b64dec(s){return decodeURIComponent(escape(atob(s)))}
$("encode64").onclick=()=>{try{$("devBox").value=b64enc($("devBox").value);msg("Base64 encoded")}catch(e){msg("Could not encode")}}
$("decode64").onclick=()=>{try{$("devBox").value=b64dec($("devBox").value);msg("Base64 decoded")}catch(e){msg("Invalid Base64")}}
$("base64").onclick=()=>{document.querySelector('[data-page="dev"]').click();$("devBox").focus()}

$("clearDev").onclick=()=>{$("devBox").value=""}

async function clips(){const d=await chrome.storage.local.get("clips"),a=d.clips||[];$("clips").innerHTML="";if(!a.length){$("clips").innerHTML='<div class="clip" style="cursor:default;color:#687280">No saved clipboard items</div>';return}a.forEach(x=>{const e=document.createElement("div");e.className="clip";e.textContent=x;e.onclick=()=>copyText(x);$("clips").appendChild(e)})}
$("clearClip").onclick=async()=>{await chrome.storage.local.set({clips:[]});clips();msg("Clipboard cleared")}
document.addEventListener("copy",async()=>{try{const x=window.getSelection()?.toString().trim();if(x){const d=await chrome.storage.local.get("clips"),a=d.clips||[];await chrome.storage.local.set({clips:[x,...a.filter(v=>v!==x)].slice(0,30)})}}catch(e){}})

$("saveNote").onclick=async()=>{await chrome.storage.local.set({notes:$("notes").value});msg("Notes saved")}
(async()=>{const d=await chrome.storage.local.get(["notes","clips"]);$("notes").value=d.notes||"";clips();stats()})()
