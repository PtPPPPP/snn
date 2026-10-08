'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import s from '../interview.module.css';
type Identity={id:string;name:string;studentId:string;createdAt:string;deviceBound:number;submissionId:string|null};
async function api(path:string,init?:RequestInit){const response=await fetch(path,{cache:'no-store',...init}),data=await response.json();if(!response.ok)throw new Error(data.error||'无法读取身份信息。');return data;}
function IdentityList(){
 const [rows,setRows]=useState<Identity[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[selected,setSelected]=useState<Identity|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{const data=await api('/api/interview/identities?page='+page);setRows(data.identities);setTotal(data.total);}catch(error){setRows([]);setSelected(null);setTotal(0);setError(error instanceof Error?error.message:'无法读取身份信息。');}finally{setLoading(false);}},[page]);
 useEffect(()=>{
  const controller=new AbortController();
  void api('/api/interview/identities?page='+page,{signal:controller.signal}).then(data=>{if(controller.signal.aborted)return;setRows(data.identities);setTotal(data.total);}).catch(error=>{if(controller.signal.aborted)return;setRows([]);setSelected(null);setTotal(0);setError(error instanceof Error?error.message:'无法读取身份信息。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[page]);
 async function release(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!selected||busy)return;setBusy(true);setError('');setNotice('');
  try{await api('/api/interview/identities/'+selected.id+'/release-device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})});setNotice('已解除 '+selected.name+' 的设备绑定。请本人在新浏览器填写原姓名和学号，原身份和答卷保留。');setSelected(null);setReason('');await load();}
  catch(error){setError(error instanceof Error?error.message:'无法解除设备绑定。');}
  finally{setBusy(false);}
 }
 return <><p>同学更换设备或丢失浏览器绑定时，先核实本人身份，再解除绑定，让本人在新浏览器填写原姓名和学号。原身份和已提交答卷保留。</p>
 {error&&<p className={s.error} role="alert">{error}</p>}{notice&&<p className={s.savedNotice} role="status">{notice}</p>}
 {loading?<p role="status">正在读取身份…</p>:rows.length===0?<p>还没有同学绑定笔试身份。</p>:<table className={s.identityTable}><thead><tr><th>姓名 / 学号</th><th>答卷</th><th>设备</th><th>操作</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.name}<br/>{row.studentId}</td><td>{row.submissionId?'已提交':'未提交'}</td><td>{row.deviceBound?'已绑定':'待重新绑定'}</td><td><button type="button" disabled={!row.deviceBound||busy} onClick={()=>{setSelected(row);setReason('');setError('');setNotice('');}}>[ 解除设备绑定 ]</button></td></tr>)}</tbody></table>}
 {selected&&<form className={s.releaseForm} onSubmit={release}><p>为 {selected.name} · {selected.studentId} 解除设备绑定</p><label>核实情况与原因<textarea required maxLength={500} rows={3} value={reason} onChange={event=>setReason(event.target.value)} placeholder="例如：已核实本人，原浏览器数据被清除，需要在新浏览器继续。"/></label><div><button type="submit" disabled={busy||!reason.trim()}>[ {busy?'正在处理…':'确认解除绑定'} ]</button><button type="button" disabled={busy} onClick={()=>setSelected(null)}>[ 取消 ]</button></div></form>}
 {total>30&&<div className={s.pagination}><button disabled={page===1||loading||busy} onClick={()=>{setLoading(true);setPage(value=>value-1);}}>[ 上一页 ]</button><span>{page} / {Math.ceil(total/30)}</span><button disabled={page*30>=total||loading||busy} onClick={()=>{setLoading(true);setPage(value=>value+1);}}>[ 下一页 ]</button></div>}
 </>;
}
export default function IdentityManagement(){const [open,setOpen]=useState(false);return <details className={s.identityManagement} onToggle={event=>setOpen(event.currentTarget.open)}><summary>笔试身份与设备管理</summary>{open&&<IdentityList/>}</details>;}
